
import { App, Modal, Notice, TFile, Setting, ButtonComponent, FuzzySuggestModal, normalizePath, TFolder } from 'obsidian';
import { GoogleContactAdapter } from '../../Adapters/GoogleContactAdapter';
import UnresolvedLinkGeneratorPlugin from '../../main';
import { Contact } from '../../Adapters/ContactAdapter';
import { GoogleContactSyncService } from '../../Services/GoogleContactSyncService';
import { GoogleContactTransformer } from '../../Transformers/GoogleContactTransformer';
import { FrontmatterKeys } from "@elo/core";

interface ContactMatch {
    contact: Contact;
    suggestedNote?: TFile;
}

export class ProcessUnsyncedGoogleContactsCommand {
    id: string = 'elo-process-unsynced-google-contacts';
    name: string = 'Contactos: Procesar No Sincronizados de Google';

    private adapter: GoogleContactAdapter;
    private service: GoogleContactSyncService;

    constructor(
        private app: App,
        private plugin: UnresolvedLinkGeneratorPlugin
    ) {
        this.adapter = new GoogleContactAdapter(
            plugin.settings,
            plugin.saveSettings.bind(plugin)
        );
        const transformer = new GoogleContactTransformer();
        this.service = new GoogleContactSyncService(app, this.adapter, transformer);
    }

    async execute(): Promise<void> {
        new Notice("Buscando contactos no sincronizados en Google...");
        try {
            const matches = await this.fetchUnsyncedContacts();

            if (matches.length === 0) {
                new Notice("No se encontraron contactos pendientes de sincronizar.");
                return;
            }

            new UnsyncedContactsBatchModal(this.app, matches, this.adapter, this.service).open();

        } catch (e) {
            console.error("Error fetching unsynced contacts:", e);
            new Notice(`Error: ${(e as Error).message}`);
        }
    }

    private async fetchUnsyncedContacts(): Promise<ContactMatch[]> {
        const matches: ContactMatch[] = [];
        let pageToken: string | undefined = undefined;
        let limit = 10;

        // Safety break to avoid infinite loops if all contacts are synced but we keep fetching
        let pagesFetched = 0;
        const MAX_PAGES = 20;

        while (matches.length < limit && pagesFetched < MAX_PAGES) {
            // Fetch a batch (larger than limit to reduce calls, e.g. 50? API default is 100 usually if not specified, let's ask for 30)
            const response = await this.adapter.listContacts(30, pageToken);

            if (!response.contacts || response.contacts.length === 0) {
                break;
            }

            for (const contact of response.contacts) {
                // Check if already synced
                if (contact.customFields && contact.customFields['eloSyncDate']) {
                    continue;
                }

                // Add to list
                const match: ContactMatch = {
                    contact: contact
                };

                // Try to find a suggested note
                const suggested = this.findSuggestedNote(contact.name);
                if (suggested) {
                    match.suggestedNote = suggested;
                }

                matches.push(match);

                if (matches.length >= limit) break;
            }

            pageToken = response.nextPageToken;
            pagesFetched++;

            if (!pageToken) break;
        }

        return matches;
    }

    private findSuggestedNote(contactName: string): TFile | undefined {
        if (!contactName) return undefined;
        const lowerName = contactName.toLowerCase();

        // Simple heuristic: Exact match or "Name" contained in "Note Name"
        // Iterate all markdown files (can be slow in large vaults, but okay for this I guess for now)
        const files = this.app.vault.getMarkdownFiles();

        // Prioritize "Personas" folder?
        // Let's first try exact match (case insensitive)
        let exact = files.find(f => f.basename.toLowerCase() === lowerName);
        if (exact) return exact;

        // Prioritize files starting with the name
        return files.find(f => f.basename.toLowerCase().includes(lowerName) || lowerName.includes(f.basename.toLowerCase()));
    }
}

class UnsyncedContactsBatchModal extends Modal {
    private matches: ContactMatch[];
    private adapter: GoogleContactAdapter;
    private service: GoogleContactSyncService;

    constructor(app: App, matches: ContactMatch[], adapter: GoogleContactAdapter, service: GoogleContactSyncService) {
        super(app);
        this.matches = matches;
        this.adapter = adapter;
        this.service = service;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Contactos de Google No Sincronizados" });
        contentEl.createEl("p", { text: "Se muestran hasta 10 contactos pendientes. Elige una acción para cada uno." });

        const container = contentEl.createDiv({ cls: "elo-google-contacts-list" });

        this.matches.forEach(match => {
            this.renderContactItem(container, match);
        });
    }

    private renderContactItem(container: HTMLElement, match: ContactMatch) {
        const itemDiv = container.createDiv({ cls: "elo-contact-item", attr: { style: "display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--background-modifier-border);" } });

        const infoDiv = itemDiv.createDiv();
        infoDiv.createEl("strong", { text: match.contact.name });
        const details = [match.contact.email?.[0], match.contact.phone?.[0]].filter(Boolean).join(", ");
        if (details) {
            infoDiv.createEl("small", { text: ` (${details})`, attr: { style: "color: var(--text-muted);" } });
        }

        if (match.suggestedNote) {
            infoDiv.createDiv({ text: `💡 Sugerencia: [[${match.suggestedNote.basename}]]`, attr: { style: "color: var(--text-accent); font-size: 0.9em;" } });
        }

        const actionsDiv = itemDiv.createDiv({ attr: { style: "display: flex; gap: 5px;" } });

        // LINK
        new ButtonComponent(actionsDiv)
            .setButtonText(match.suggestedNote ? "Enlazar" : "Enlazar...")
            .setIcon("link")
            .setTooltip(match.suggestedNote ? `Enlazar con ${match.suggestedNote.basename}` : "Buscar nota para enlazar")
            .onClick(async () => {
                if (match.suggestedNote) {
                    await this.service.linkContactToNote(match.contact, match.suggestedNote);
                    itemDiv.remove();
                } else {
                    this.close();
                    new NoteSelectionModal(this.app, match.contact, async (file) => {
                        await this.service.linkContactToNote(match.contact, file);
                        // Re-open not implemented in original logic, just closes.
                    }).open();
                }
            });

        // CREATE
        new ButtonComponent(actionsDiv)
            .setButtonText("Crear")
            .setIcon("file-plus")
            .setCta()
            .setTooltip("Crear nueva nota en Personas/Conocidos-mios")
            .onClick(async () => {
                const newFile = await this.service.createNoteFromContact(match.contact);
                new Notice(`Nota creada: ${newFile.basename}`);
                itemDiv.remove();
            });

        // MOVE (Create + Delete)
        new ButtonComponent(actionsDiv)
            .setButtonText("Mover")
            .setIcon("import")
            .setTooltip("Crear nota y eliminar de Google")
            .onClick(async () => {
                if (confirm(`¿Crear nota para "${match.contact.name}" y eliminarlo de Google?`)) {
                    await this.service.createNoteFromContact(match.contact);
                    if (match.contact.id) {
                        await this.adapter.deleteContact(match.contact.id);
                        new Notice(`Movido a Obsidian: ${match.contact.name}`);
                    }
                    itemDiv.remove();
                }
            });

        // DELETE
        new ButtonComponent(actionsDiv)
            .setButtonText("Eliminar")
            .setIcon("trash")
            .setWarning()
            .setTooltip("Eliminar de Google Contacts")
            .onClick(async () => {
                if (confirm(`¿Seguro que quieres eliminar a "${match.contact.name}" de Google Contacts?`)) {
                    if (match.contact.id) {
                        await this.adapter.deleteContact(match.contact.id);
                        new Notice(`Eliminado de Google: ${match.contact.name}`);
                    }
                    itemDiv.remove();
                }
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class NoteSelectionModal extends FuzzySuggestModal<TFile> {
    constructor(app: App, private contact: Contact, private onSelect: (file: TFile) => void) {
        super(app);
        this.setPlaceholder(`Selecciona nota para enlazar con "${contact.name}"`);
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(item);
    }
}
