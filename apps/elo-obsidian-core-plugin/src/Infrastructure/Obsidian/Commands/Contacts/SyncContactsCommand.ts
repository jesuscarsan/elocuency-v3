
import { App, Notice, TFile, FuzzySuggestModal, getAllTags } from 'obsidian';
import { CommandEnum } from "@elo/core";
import { BridgeService } from '../../Services/BridgeService';
import { FrontmatterKeys } from "@elo/core";
import { showMessage } from '../../Utils/Messages';
import { executeInEditMode, getActiveMarkdownView } from '../../Utils/ViewMode';

export class SyncCurrentContactCommand {
    id: string = CommandEnum.SyncContacts;
    name: string = 'Contactos: Sincronizar Nota Activa con Mac/iPhone';

    constructor(
        private app: App,
        private bridge: BridgeService
    ) { }

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
            new Notice(`Sincronizando contacto: ${targetFile.basename}...`);
            try {
                await this.syncFile(targetFile);
                new Notice(`Sincronización completada para ${targetFile.basename}`);
            } catch (e) {
                console.error(`Error syncing ${targetFile.basename}:`, e);
                new Notice(`Error al sincronizar: ${(e as Error).message}`);
            }
        });
    }

    private isPersona(file: TFile): boolean {
        // Condition 1: Frontmatter tag
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) return false;

        const tags = getAllTags(cache);
        if (tags && tags.some(t => t.startsWith("#Personas/") || t === "#Personas")) {
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

        const contactData: any = {
            name: finalName,
            phone: frontmatter[FrontmatterKeys.Telefono],
            email: frontmatter[FrontmatterKeys.Email],
            birthday: frontmatter[FrontmatterKeys.Cumpleanos],
            id: frontmatter[FrontmatterKeys.EloAppleContactId] // Use existing ID if available
            // Add tags as notes?
        };

        let selectedCandidate: any = null;

        // Fuzzy Match Strategy if ID is missing
        if (!contactData.id) {
            const cleanName = file.basename.replace(/\(.*\)/g, "").trim() || file.basename;
            console.log(`[SyncCurrentContact] Searching candidates for: ${cleanName}`);

            try {
                const candidates = await this.bridge.searchContacts(cleanName);
                console.log(`[SyncCurrentContact] Candidates found: ${candidates?.length}`);

                if (candidates && candidates.length > 0) {
                    // Interactive Selection Modal
                    selectedCandidate = await this.promptUserForCandidate(file.basename, cleanName, candidates);
                    console.log(`[SyncCurrentContact] Selected candidate:`, selectedCandidate);

                    if (selectedCandidate) {
                        contactData.id = selectedCandidate.id;
                        // contactData.name = selectedCandidate.name; // Don't overwrite, we want to enforce the Note Title as the source of truth for the Name
                        new Notice(`Enlazado a: ${selectedCandidate.name}`);
                    } else {
                        // User cancelled or chose to create new
                        console.log(`[SyncCurrentContact] User cancelled or chose create new.`);
                        new Notice(`Creando nuevo contacto: ${finalName}`);
                    }
                }
            } catch (err) {
                console.error("Error searching candidate:", err);
            }
        }

        console.log(`[SyncCurrentContact] Upserting contact data:`, contactData);

        // Upsert Contact to Mac (returns full contact with merged data)
        try {
            const syncedContact = await this.bridge.upsertContact(contactData);
            console.log(`[SyncCurrentContact] Upsert result:`, syncedContact);

            await this.app.fileManager.processFrontMatter(file, (fm) => {
                if (syncedContact) {
                    // 1. Store the ID
                    if (syncedContact.id) {
                        fm[FrontmatterKeys.EloAppleContactId] = syncedContact.id;
                    }

                    // 2. Populate missing fields from Synced Contact (Mac -> Obsidian)

                    // Phone
                    if (!fm[FrontmatterKeys.Telefono] && syncedContact.phones && syncedContact.phones.length > 0) {
                        fm[FrontmatterKeys.Telefono] = syncedContact.phones[0];
                    }

                    // Email
                    if (!fm[FrontmatterKeys.Email] && syncedContact.emails && syncedContact.emails.length > 0) {
                        fm[FrontmatterKeys.Email] = syncedContact.emails[0];
                    }

                    // Birthday
                    if (!fm[FrontmatterKeys.Cumpleanos] && syncedContact.birthday) {
                        fm[FrontmatterKeys.Cumpleanos] = syncedContact.birthday;
                    }
                }
            });
        } catch (err) {
            console.error(`[SyncCurrentContact] Upsert failed:`, err);
            throw err;
        }
    }

    private async promptUserForCandidate(noteName: string, query: string, candidates: any[]): Promise<any | null> {
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
        private candidates: any[],
        private onChoose: (item: any | null) => void
    ) {
        super(app);
        this.setPlaceholder(`Selecciona un contacto para "${noteName}"`);
    }

    getItems(): any[] {
        return [
            ...this.candidates,
            { id: "CREATE_NEW", name: `➕ Crear nuevo contacto: "${this.query}"`, phone: [], email: [] }
        ];
    }

    getItemText(item: any): string {
        if (item.id === "CREATE_NEW") return item.name;
        // Show details to help identify
        const details = [
            item.phones?.join(", "),
            item.emails?.join(", ")
        ].filter(Boolean).join(" | ");
        return `${item.name} ${details ? `(${details})` : ''}`;
    }

    onChooseItem(item: any, evt: MouseEvent | KeyboardEvent): void {
        if (item.id === "CREATE_NEW") {
            this.onChoose(null);
        } else {
            this.onChoose(item);
        }
    }
}
