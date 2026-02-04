
import { App, Notice, TFile, FuzzySuggestModal, getAllTags } from 'obsidian';
import { GoogleAuthModal } from '../../Views/Modals/GoogleAuthModal';
import { CommandEnum } from "@elo/core";
import { FrontmatterKeys } from "@elo/core";
import { executeInEditMode, getActiveMarkdownView } from '../../Utils/ViewMode';
import { GoogleContactAdapter } from '../../Adapters/GoogleContactAdapter';
import UnresolvedLinkGeneratorPlugin from '../../main';
import { GoogleContactSyncService } from '../../Services/GoogleContactSyncService';
import { GoogleContactTransformer } from '../../Transformers/GoogleContactTransformer';
import { Contact } from '../../Adapters/ContactAdapter';

export class SyncGoogleContactsCommand {
    id: string = 'elo-sync-google-contacts';
    name: string = 'Contactos: Sincronizar Nota Activa con Google';

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
                await this.service.syncNoteWithGoogle(targetFile);
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
        // console.log("tags:", tags);
        if (tags && tags.some(t => t.startsWith("#Personas/"))) {
            return true;
        }
        return false;
    }
}


