
import { App, Notice, TFile, FuzzySuggestModal, getAllTags } from 'obsidian';
import { GoogleAuthModal } from '../../Views/Modals/GoogleAuthModal';
import { CommandEnum } from '../../../../Domain/Constants/CommandIds';
import { FrontmatterKeys } from '../../../../Domain/Constants/FrontmatterRegistry';
import { executeInEditMode, getActiveMarkdownView } from '../../Utils/ViewMode';
import { GoogleContactAdapter } from '../../Adapters/GoogleContactAdapter';
import UnresolvedLinkGeneratorPlugin from '../../main';
import { Contact } from '../../Adapters/ContactAdapter';

export class SyncGoogleContactsCommand {
    id: string = 'elo-sync-google-contacts';
    name: string = 'Contactos: Sincronizar Nota Activa con Google';

    private adapter: GoogleContactAdapter;

    constructor(
        private app: App,
        private plugin: UnresolvedLinkGeneratorPlugin
    ) {
        this.adapter = new GoogleContactAdapter(
            plugin.settings,
            plugin.saveSettings.bind(plugin)
        );
    }

    async execute(file?: TFile): Promise<void> {
        const targetFile = file || this.app.workspace.getActiveFile();

        if (!targetFile || !(targetFile instanceof TFile)) {
            new Notice("No hay ninguna nota activa.");
            return;
        }

        if (!this.isPersona(targetFile)) {
            new Notice("La nota activa no es una Persona (falta tag #Personas).");
            return;
        }

        const view = getActiveMarkdownView(this.app, targetFile);
        if (!view) {
            new Notice("No se pudo obtener la vista de la nota para activar el modo edición.");
            return;
        }

        await executeInEditMode(view, async () => {
            new Notice(`Sincronizando con Google: ${targetFile.basename}...`);
            try {
                await this.syncFile(targetFile);
                new Notice(`Sincronización con Google completada para ${targetFile.basename}`);
            } catch (e) {
                console.error(`Error syncing ${targetFile.basename}:`, e);
                // Check if error is related to auth
                const msg = (e as Error).message;
                if (msg.includes("Refresh Token is missing") || msg.includes("No Google tokens") || msg.includes("401") || msg.includes("403") || msg.includes("invalid_grant") || msg.includes("Token has been expired")) {
                    new Notice("Autenticación necesaria con Google.");
                    new GoogleAuthModal(this.app, this.adapter, async () => {
                        // On Success, retry? Or just notify.
                        new Notice("Autenticado correctamente. Ejecuta el comando de nuevo.");
                    }).open();
                } else {
                    new Notice(`Error al sincronizar con Google: ${msg}`);
                }
            }
        });
    }

    private isPersona(file: TFile): boolean {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) return false;

        const tags = getAllTags(cache);
        console.log("tags:", tags);
        if (tags && tags.some(t => t.startsWith("#Personas/"))) {
            return true;
        }
        return false;
    }

    private async syncFile(file: TFile): Promise<void> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        if (!frontmatter) return;

        const name = file.basename.replace(/\(.*\)/g, "").trim() || file.basename;
        const finalName = frontmatter?.['name'] || file.basename;

        // "!!googleContactId" - using a string literal if not yet in Registry
        // Or we should add it to Registry. For now, let's use a hardcoded string or a new constant if possible.
        // The user asked for an ID.
        const GOOGLE_ID_KEY = "!!googleContactId";

        const contactData: Contact = {
            id: frontmatter[GOOGLE_ID_KEY],
            name: finalName,
            phone: this.toArray(frontmatter[FrontmatterKeys.Telefono]),
            email: this.toArray(frontmatter[FrontmatterKeys.Email]),
            birthday: frontmatter[FrontmatterKeys.Cumpleanos],
            customFields: {
                eloSyncDate: new Date().toISOString()
            }
        };

        let selectedCandidate: Contact | null = null;

        // Strategy: If No ID, Search & Prompt
        if (!contactData.id) {
            const cleanName = finalName; // Use the name we are sending
            console.log(`[SyncGoogle] Searching candidates for: ${cleanName}`);

            try {
                const candidates = await this.adapter.searchContacts(cleanName);

                if (candidates && candidates.length > 0) {
                    selectedCandidate = await this.promptUserForCandidate(file.basename, cleanName, candidates);

                    if (selectedCandidate) {
                        contactData.id = selectedCandidate.id;
                        new Notice(`Enlazado a Google Contact: ${selectedCandidate.name}`);
                    } else {
                        // User Cancelled or Create New
                        // Logic check: if prompt returns null, is it cancel or create new?
                        // In the other command, CREATE_NEW returned null.
                        // We should clarify 'CREATE_NEW' vs 'CANCEL'.
                        // My adaptation of promptUserForCandidate below handles this via a special ID check or implicit "null means create new" if we want that behavior.
                        // But usually null means cancel.
                        // Let's look at the Logic in previous command:
                        // if (selectedCandidate) { use ID } else { Notice("Creating new"); }
                        // So null meant "Create New". Wait, let's check the modal logic again.
                        // The modal returned `null` for "CREATE_NEW".
                        new Notice(`Creando nuevo contacto en Google: ${finalName}`);
                    }
                } else {
                    new Notice(`No se encontraron candidatos. Creando nuevo...`);
                }

            } catch (err) {
                console.error("Error searching candidate:", err);
            }
        }

        // Upsert
        const syncedContact = await this.adapter.upsertContact(contactData);

        // Update Frontmatter
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (syncedContact.id) {
                fm[GOOGLE_ID_KEY] = syncedContact.id;
            }

            // Sync back fields if missing (Google -> Obsidian)
            if (!fm[FrontmatterKeys.Telefono] && syncedContact.phone && syncedContact.phone.length > 0) {
                fm[FrontmatterKeys.Telefono] = syncedContact.phone;
            }

            if (!fm[FrontmatterKeys.Email] && syncedContact.email && syncedContact.email.length > 0) {
                fm[FrontmatterKeys.Email] = syncedContact.email;
            }

            if (!fm[FrontmatterKeys.Cumpleanos] && syncedContact.birthday) {
                fm[FrontmatterKeys.Cumpleanos] = syncedContact.birthday;
            }

            // Sync Date Update (Both Sides aligned by logic)
            if (syncedContact.customFields && syncedContact.customFields['eloSyncDate']) {
                fm["!!googleSyncDate"] = syncedContact.customFields['eloSyncDate'];
            }
        });
    }

    private toArray(val: any): string[] {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return [val];
    }

    private async promptUserForCandidate(noteName: string, query: string, candidates: Contact[]): Promise<Contact | null> {
        return new Promise((resolve) => {
            const modal = new ContactSelectionModal(this.app, noteName, query, candidates, (selected) => {
                resolve(selected);
            });
            modal.open();
        });
    }
}

class ContactSelectionModal extends FuzzySuggestModal<any> {
    constructor(
        app: App,
        private noteName: string,
        private query: string,
        private candidates: Contact[],
        private onChoose: (item: Contact | null) => void
    ) {
        super(app);
        this.setPlaceholder(`Selecciona un contacto de Google para "${noteName}"`);
    }

    getItems(): any[] {
        return [
            ...this.candidates,
            { id: "CREATE_NEW", name: `➕ Crear nuevo contacto: "${this.query}"` }
        ];
    }

    getItemText(item: any): string {
        if (item.id === "CREATE_NEW") return item.name;

        // Show details 
        const details = [
            item.phone?.join(", "),
            item.email?.join(", ")
        ].filter(Boolean).join(" | ");

        return `${item.name} ${details ? `(${details})` : ''}`;
    }

    onChooseItem(item: any, evt: MouseEvent | KeyboardEvent): void {
        if (item.id === "CREATE_NEW") {
            this.onChoose(null); // Return null to signal "Create New"
        } else {
            this.onChoose(item);
        }
    }
}
