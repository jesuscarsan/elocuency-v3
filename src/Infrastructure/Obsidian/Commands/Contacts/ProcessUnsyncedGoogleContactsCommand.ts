
import { App, Modal, Notice, TFile, Setting, ButtonComponent, FuzzySuggestModal, normalizePath, TFolder } from 'obsidian';
import { GoogleContactAdapter } from '../../Adapters/GoogleContactAdapter';
import UnresolvedLinkGeneratorPlugin from '../../main';
import { Contact } from '../../Adapters/ContactAdapter';
import { FrontmatterKeys } from '../../../../Domain/Constants/FrontmatterRegistry';

interface ContactMatch {
    contact: Contact;
    suggestedNote?: TFile;
}

export class ProcessUnsyncedGoogleContactsCommand {
    id: string = 'elo-process-unsynced-google-contacts';
    name: string = 'Contactos: Procesar No Sincronizados de Google';

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

    async execute(): Promise<void> {
        new Notice("Buscando contactos no sincronizados en Google...");
        try {
            const matches = await this.fetchUnsyncedContacts();

            if (matches.length === 0) {
                new Notice("No se encontraron contactos pendientes de sincronizar.");
                return;
            }

            new UnsyncedContactsBatchModal(this.app, matches, this.adapter, this.plugin).open();

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

        // Substring match
        // Note: this might be too loose. "Juan" matches "Juan Perez".
        // Let's stick to files in "Personas/" if possible? Or all files? 
        // User request: "buscando por texto de titulo similar en notas"
        // Let's filter by folder "Personas" if possible to reduce noise?
        // But the user might have people elsewhere. 
        // Let's look for "Personas" tag? That is expensive to check every file cache.
        // Let's stick to basename similarity.

        // Prioritize files starting with the name
        return files.find(f => f.basename.toLowerCase().includes(lowerName) || lowerName.includes(f.basename.toLowerCase()));
    }
}

class UnsyncedContactsBatchModal extends Modal {
    private matches: ContactMatch[];
    private adapter: GoogleContactAdapter;
    private plugin: UnresolvedLinkGeneratorPlugin;

    constructor(app: App, matches: ContactMatch[], adapter: GoogleContactAdapter, plugin: UnresolvedLinkGeneratorPlugin) {
        super(app);
        this.matches = matches;
        this.adapter = adapter;
        this.plugin = plugin;
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
                    await this.linkContactToNote(match.contact, match.suggestedNote);
                    itemDiv.remove();
                } else {
                    this.close();
                    new NoteSelectionModal(this.app, match.contact, async (file) => {
                        await this.linkContactToNote(match.contact, file);
                        // Re-open this modal? No, simpler to just close. 
                        // But we want to process batch.
                        // Ideally we should keep this modal open.
                        // But Modal on top of Modal is not standard.
                        // For now, let's just accept one action closes the flow for that item, 
                        // indeed we should remove the item from the list and keep the modal open.
                        // BUT NoteSelectionModal is a Modal...
                        // Re-opening this modal after selection might be tricky due to state.
                        // Let's try to notify user to re-run or just focus on "Enlazar..." -> closes this, opens selector.
                        // Then user has to run command again. That's annoying.
                        // Better: "Enlazar..." search could be inline? No, too complex.
                        // Let's stick to: if no suggestion, just close and open selector. User processes one by one in that case.
                        // OR: We provide a textual input? No.
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
                await this.createContactNote(match.contact);
                itemDiv.remove();
            });

        // DELETE
        new ButtonComponent(actionsDiv)
            .setButtonText("Eliminar")
            .setIcon("trash")
            .setWarning()
            .setTooltip("Eliminar de Google Contacts")
            .onClick(async () => {
                if (confirm(`¿Seguro que quieres eliminar a "${match.contact.name}" de Google Contacts?`)) {
                    await this.deleteContact(match.contact);
                    itemDiv.remove();
                }
            });
    }

    private async linkContactToNote(contact: Contact, file: TFile) {
        // 1. Update Obsidian Note
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['!!googleContactId'] = contact.id;
            fm['!!googleSyncDate'] = new Date().toISOString();

            // Populate missing fields
            if (!fm[FrontmatterKeys.Telefono] && contact.phone && contact.phone.length > 0) {
                fm[FrontmatterKeys.Telefono] = contact.phone;
            }
            if (!fm[FrontmatterKeys.Email] && contact.email && contact.email.length > 0) {
                fm[FrontmatterKeys.Email] = contact.email;
            }
            if (!fm[FrontmatterKeys.Cumpleanos] && contact.birthday) {
                fm[FrontmatterKeys.Cumpleanos] = contact.birthday;
            }
        });

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

    private async createContactNote(contact: Contact) {
        const templatePath = "!!metadata/templates/Personas/Persona conocidos mios.md";
        const templateFile = this.app.vault.getAbstractFileByPath(templatePath);

        let content = "";
        if (templateFile instanceof TFile) {
            content = await this.app.vault.read(templateFile);
        } else {
            new Notice(`⚠️ No se encontró la plantilla "${templatePath}". Creando nota vacía.`);
        }

        // Determine filename (handle duplicates)
        let filename = `Personas/${contact.name}.md`;
        // Ensure folder exists
        if (!await this.app.vault.adapter.exists("Personas")) {
            await this.app.vault.createFolder("Personas");
        }

        let i = 1;
        while (await this.app.vault.adapter.exists(filename)) {
            filename = `Personas/${contact.name} ${i}.md`;
            i++;
        }

        const newFile = await this.app.vault.create(filename, content);

        // Link logic same as above
        await this.linkContactToNote(contact, newFile);

        new Notice(`Nota creada: ${filename}`);
    }

    private async deleteContact(contact: Contact) {
        if (!contact.id) return;
        await this.adapter.deleteContact(contact.id);
        new Notice(`Eliminado de Google: ${contact.name}`);
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
