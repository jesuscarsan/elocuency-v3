import { App, Modal, Setting, Notice } from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

export type ImageSource =
    | { type: 'path', path: string }
    | { type: 'files', files: FileList, folderName: string }
    | { type: 'clipboard', blob: Blob };

export class ImageSourceModal extends Modal {
    private mode: 'path' | 'files' = 'path';
    private pathResult: string = '';
    private filesResult: FileList | null = null;
    private folderNameResult: string = '';

    constructor(app: App, private onSubmit: (result: ImageSource) => void) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Fuente de imágenes' });

        // --- Clipboard ---
        new Setting(contentEl)
            .setName('Portapapeles')
            .setDesc('Usar imagen copiada recientemente.')
            .addButton((btn) =>
                btn
                    .setButtonText('Pegar del Portapapeles')
                    .setIcon('clipboard-paste')
                    .onClick(async () => {
                        try {
                            const clipboardItems = await navigator.clipboard.read();
                            for (const item of clipboardItems) {
                                if (item.types.some(t => t.startsWith('image/'))) {
                                    const blob = await item.getType(item.types.find(t => t.startsWith('image/'))!);
                                    this.close();
                                    this.onSubmit({
                                        type: 'clipboard',
                                        blob: blob
                                    });
                                    return;
                                }
                            }
                            showMessage('No se encontró ninguna imagen en el portapapeles.');
                        } catch (err) {
                            console.error('Error reading clipboard:', err);
                            showMessage('Error al leer el portapapeles. Asegúrate de dar permisos.');
                        }
                    })
            );

        contentEl.createEl('hr');

        // --- Folder / Files ---
        let pathInputText: any;

        const pathSetting = new Setting(contentEl)
            .setName('Carpeta')
            .setDesc('Selecciona una carpeta o introduce la ruta absoluta.')
            .addText((text) => {
                pathInputText = text;
                text
                    .setPlaceholder('/path/to/folder')
                    .setValue(this.pathResult)
                    .onChange((value) => {
                        this.mode = 'path';
                        this.pathResult = value;
                        this.filesResult = null; // Clear files if path is manually typed
                    });
            });

        // Hidden File Input
        const fileInput = contentEl.createEl('input', {
            type: 'file',
            attr: {
                webkitdirectory: '',
                style: 'display: none;'
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                this.mode = 'files';
                this.filesResult = fileInput.files;

                // Get folder name from the first file's relative path if available
                const firstFile = fileInput.files[0];
                const relPath = firstFile.webkitRelativePath;
                // e.g., "Folder/1.jpg"
                if (relPath) {
                    this.folderNameResult = relPath.split('/')[0];
                } else {
                    this.folderNameResult = 'Carpeta Seleccionada';
                }

                const label = `${this.folderNameResult} (${fileInput.files.length} archivos)`;
                this.pathResult = label; // Just for display
                if (pathInputText) {
                    pathInputText.setValue(label);
                }
            }
        });

        pathSetting.addButton((btn) =>
            btn
                .setButtonText('Explorar')
                .onClick(() => {
                    fileInput.click();
                })
        );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Procesar')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        if (this.mode === 'files' && this.filesResult) {
                            this.onSubmit({
                                type: 'files',
                                files: this.filesResult,
                                folderName: this.folderNameResult
                            });
                        } else if (this.pathResult && this.mode === 'path') {
                            this.onSubmit({
                                type: 'path',
                                path: this.pathResult
                            });
                        }
                    }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
