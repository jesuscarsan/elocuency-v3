import { App, Modal, Notice, Setting, MarkdownView, TFile } from 'obsidian';
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { GoogleGeminiImagesAdapter, ImageContent } from "@elo/core";
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import * as fs from 'fs';
import * as path from 'path';
import { ImageSource, ImageSourceModal } from '@/Infrastructure/Obsidian/Views/Modals/ImageSourceModal';
import { ImageProcessor } from '@/Infrastructure/Obsidian/Utils/ImageProcessor';



export class CreateNoteFromImagesCommand {
    constructor(
        private readonly app: App,
        private readonly adapter: GoogleGeminiImagesAdapter
    ) { }

    async execute(file?: TFile) {
        console.log('[CreateNoteFromImagesCommand] Start');
        new ImageSourceModal(this.app, async (source) => {
            if (source.type === 'path') {
                await this.processFromPath(source.path, file);
            } else if (source.type === 'files') {
                await this.processFromFiles(source.files, source.folderName, file);
            } else if (source.type === 'clipboard') {
                // Wrap simplistic single-image processing or reuse processFromFiles logic by mocking File?
                // Or just implement processFromBlob
                await this.processFromBlob(source.blob, file);
            }
        }).open();
        console.log('[CreateNoteFromImagesCommand] End');
    }

    private async processFromBlob(blob: Blob, targetFile?: TFile) {
        const activeView = getActiveMarkdownView(this.app, targetFile);
        if (!activeView) {
            showMessage('No hay una nota activa para añadir el contenido.');
            return;
        }

        showMessage('Procesando imagen del portapapeles...');

        const imageContent = await ImageProcessor.processBlob(blob);

        if (imageContent) {
            await this.generateAndAppend([imageContent], 'Clipboard', activeView);
        } else {
            showMessage('Error al procesar la imagen del portapapeles.');
        }
    }


    private async processFromPath(folderPath: string, targetFile?: TFile) {
        const activeView = getActiveMarkdownView(this.app, targetFile);
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
                    const processedImage = await ImageProcessor.processImage(arrayBuffer, extension);
                    if (processedImage) {
                        imageContents.push(processedImage);
                    }
                } catch (error) {
                    console.error(`Failed to process image ${imageName}`, error);
                    showMessage(`Error al procesar la imagen ${imageName}`);
                }
            }

            await this.generateAndAppend(imageContents, folderName, activeView);

        } catch (error) {
            console.error('Error reading folder:', error);
            showMessage('Error al leer la carpeta.');
        }
    }

    private async processFromFiles(fileList: FileList, folderName: string, targetFile?: TFile) {
        const activeView = getActiveMarkdownView(this.app, targetFile);
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
                const processedImage = await ImageProcessor.processImage(arrayBuffer, extension);
                if (processedImage) {
                    imageContents.push(processedImage);
                }
            } catch (error) {
                console.error(`Failed to process image ${file.name}`, error);
                showMessage(`Error al procesar la imagen ${file.name}`);
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


}
