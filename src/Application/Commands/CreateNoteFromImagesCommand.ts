import { App, Modal, Notice, Setting, MarkdownView } from 'obsidian';
import { GoogleGeminiImagesAdapter, ImageContent } from 'src/Infrastructure/Adapters/GoogleGeminiAdapter/GoogleGeminiImagesAdapter';
import { showMessage } from 'src/Application/Utils/Messages';
import * as fs from 'fs';
import * as path from 'path';

type ImageSource =
    | { type: 'path', path: string }
    | { type: 'files', files: FileList, folderName: string };

export class CreateNoteFromImagesCommand {
    constructor(
        private readonly app: App,
        private readonly adapter: GoogleGeminiImagesAdapter
    ) { }

    async execute() {
        new ImageSourceModal(this.app, async (source) => {
            if (source.type === 'path') {
                await this.processFromPath(source.path);
            } else {
                await this.processFromFiles(source.files, source.folderName);
            }
        }).open();
    }

    private async processFromPath(folderPath: string) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            showMessage('No hay una nota activa para añadir el contenido.');
            return;
        }

        showMessage(`Leyendo carpeta: ${folderPath}...`);

        if (!fs.existsSync(folderPath)) {
            showMessage('La carpeta no existe.');
            return;
        }

        try {
            const files = await fs.promises.readdir(folderPath);
            const folderName = path.basename(folderPath);

            // 1. Get and sort images
            const images = files
                .filter(file => this.isImage(file))
                .sort((a, b) => {
                    // Natural sort for numbered files (e.g. 1.jpg, 2.jpg, 10.jpg)
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                });

            if (images.length === 0) {
                showMessage('No se encontraron imágenes en la carpeta seleccionada.');
                return;
            }

            // 2. Process images (resize and convert to base64)
            const imageContents: ImageContent[] = [];
            showMessage(`Se encontraron ${images.length} imágenes. Preparando envío...`);

            for (const imageName of images) {
                const fullPath = path.join(folderPath, imageName);
                try {
                    const buffer = await fs.promises.readFile(fullPath);
                    // Convert Buffer to ArrayBuffer
                    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                    const extension = path.extname(imageName).slice(1); // remove dot
                    const processedImage = await this.processImage(arrayBuffer, extension);
                    if (processedImage) {
                        imageContents.push(processedImage);
                    }
                } catch (error) {
                    console.error(`Failed to process image ${imageName}`, error);
                    new Notice(`Error al procesar la imagen ${imageName}`);
                }
            }

            await this.generateAndAppend(imageContents, folderName, activeView);

        } catch (error) {
            console.error('Error reading folder:', error);
            showMessage('Error al leer la carpeta.');
        }
    }

    private async processFromFiles(fileList: FileList, folderName: string) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            showMessage('No hay una nota activa para añadir el contenido.');
            return;
        }

        const files = Array.from(fileList);
        // 1. Filter and sort images
        const images = files
            .filter(file => this.isImage(file.name))
            .sort((a, b) => {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });

        if (images.length === 0) {
            showMessage('No se encontraron imágenes en la selección.');
            return;
        }

        // 2. Process images
        const imageContents: ImageContent[] = [];
        showMessage(`Se encontraron ${images.length} imágenes. Preparando envío...`);

        for (const file of images) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const extension = this.getExtension(file.name);
                const processedImage = await this.processImage(arrayBuffer, extension);
                if (processedImage) {
                    imageContents.push(processedImage);
                }
            } catch (error) {
                console.error(`Failed to process image ${file.name}`, error);
                new Notice(`Error al procesar la imagen ${file.name}`);
            }
        }

        await this.generateAndAppend(imageContents, folderName, activeView);
    }

    private async generateAndAppend(imageContents: ImageContent[], folderName: string, activeView: MarkdownView) {
        if (imageContents.length === 0) {
            showMessage("No se pudieron procesar las imágenes.");
            return;
        }

        // 3. Send to Gemini
        showMessage('Enviando a Gemini (esto puede tardar unos segundos)...');
        const result = await this.adapter.generateContentFromImages(imageContents);

        if (!result) {
            showMessage('No se obtuvo respuesta de Gemini.');
            return;
        }

        // 4. Update Active Note
        const contentToAppend = `
## Transcripción Literal (${folderName})
${result.literal_transcription}

## Análisis (${folderName})
${result.analysis}
`.trim();

        try {
            await this.app.vault.append(activeView.file!, '\n' + contentToAppend);
            showMessage('Contenido añadido a la nota activa.');
        } catch (error) {
            console.error('Error updating note:', error);
            showMessage('Error al actualizar la nota.');
        }
    }

    private isImage(filename: string): boolean {
        const extensions = ['png', 'jpg', 'jpeg', 'webp'];
        return extensions.includes(this.getExtension(filename));
    }

    private getExtension(filename: string): string {
        const parts = filename.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }

    private async processImage(buffer: ArrayBuffer, extension: string): Promise<ImageContent | null> {
        return new Promise((resolve) => {
            const blob = new Blob([buffer], { type: `image/${extension === 'jpg' ? 'jpeg' : extension}` });
            const url = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 1024; // Resize to max 1024px to save tokens
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(null);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);

                // JPEG with 0.8 quality for good compression
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve({
                    data: dataUrl.split(',')[1], // Remove type prefix
                    mimeType: 'image/jpeg'
                });
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };

            img.src = url;
        });
    }
}

class ImageSourceModal extends Modal {
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
                            // Fallback catch: if user typed path but it looks like our label
                            if (this.pathResult.includes('archivos)')) {
                                // User didn't type, but we lost state? Unlikely if variable logic holds.
                                // If they typed over the label, mode is 'path' and result is the new path.
                            }
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
