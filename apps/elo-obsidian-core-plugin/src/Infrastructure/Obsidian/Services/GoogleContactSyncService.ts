import { App, Notice, TFile, FuzzySuggestModal, getAllTags } from 'obsidian';
import { GoogleContactAdapter } from '../Adapters/GoogleContactAdapter';
import { GoogleContactTransformer } from '../Transformers/GoogleContactTransformer';
import { Contact } from '../Adapters/ContactAdapter';
import { FrontmatterKeys } from "@elo/core";

export class GoogleContactSyncService {
    constructor(
        private app: App,
        private adapter: GoogleContactAdapter,
        private transformer: GoogleContactTransformer
    ) { }

    /**
     * Syncs a specific note with Google.
     * If no Google ID exists, searches for candidates or creates a new one.
     */
    async syncNoteWithGoogle(file: TFile): Promise<void> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        if (!frontmatter) return;

        // 1. Transform Note -> Contact
        const tags = getAllTags(cache) || [];
        const contactData = this.transformer.toContact(file, frontmatter, tags);
        let selectedCandidate: Contact | null = null;

        // 2. Identify / Match
        if (!contactData.id) {
            const cleanName = contactData.name;
            console.log(`[SyncService] Searching candidates for: ${cleanName}`);

            try {
                const candidates = await this.adapter.searchContacts(cleanName);
                if (candidates && candidates.length > 0) {
                    selectedCandidate = await this.promptUserForCandidate(file.basename, cleanName, candidates);

                    if (selectedCandidate) {
                        contactData.id = selectedCandidate.id;
                        new Notice(`Enlazado a Google Contact: ${selectedCandidate.name}`);
                    } else {
                        new Notice(`Creando nuevo contacto en Google: ${cleanName}`);
                    }
                } else {
                    new Notice(`No se encontraron candidatos. Creando nuevo...`);
                }
            } catch (err) {
                console.error("Error searching candidate:", err);
            }
        }

        // 3. Upsert to Google
        const syncedContact = await this.adapter.upsertContact(contactData);

        // 4. Update Note Frontmatter (Sync back)
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            this.transformer.updateFrontmatterFromContact(fm, syncedContact);
        });
    }

    /**
     * Links a specific Google Contact to a Note.
     * Updates frontmatter and appends notes if any.
     */
    async linkContactToNote(contact: Contact, file: TFile): Promise<void> {
        // 1. Update Obsidian Note
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            this.transformer.updateFrontmatterFromContact(fm, contact);
        });

        // Append Notes to Body if they exist
        if (contact.notes) {
            const content = await this.app.vault.read(file);
            await this.app.vault.modify(file, content + "\n\n" + contact.notes);
        }

        // 2. Update Google Contact (set eloSyncDate)
        const updatedContact: Contact = {
            ...contact,
            customFields: {
                ...contact.customFields,
                eloSyncDate: new Date().toISOString()
            }
        };
        await this.adapter.upsertContact(updatedContact);

        new Notice(`Enlazado: ${contact.name} <-> ${file.basename}`);
    }

    /**
     * Creates a new note from a Contact and links them.
     * Deletes source contact if requested (via move logic usually, but here we just create).
     */
    async createNoteFromContact(contact: Contact): Promise<TFile> {
        const templatePath = "!!metadata/templates/Personas/Persona conocidos mios.md";
        const templateFile = this.app.vault.getAbstractFileByPath(templatePath);

        let content = "";
        if (templateFile instanceof TFile) {
            content = await this.app.vault.read(templateFile);
        } else {
            // Optional: check for existence or warn
            console.warn(`Template not found: ${templatePath}`);
        }

        // Determine filename
        let filename = `Personas/${contact.name}.md`;

        // Ensure folder exists
        if (!await this.app.vault.adapter.exists("Personas")) {
            await this.app.vault.createFolder("Personas");
        }

        // Handle duplicates
        let i = 1;
        while (await this.app.vault.adapter.exists(filename)) {
            filename = `Personas/${contact.name} ${i}.md`;
            i++;
        }

        const newFile = await this.app.vault.create(filename, content);

        // Link
        await this.linkContactToNote(contact, newFile);

        return newFile;
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

        const details = [
            item.phone?.join(", "),
            item.email?.join(", ")
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
