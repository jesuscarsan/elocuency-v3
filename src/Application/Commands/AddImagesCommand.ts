import { App as ObsidianApp, MarkdownView, Notice } from 'obsidian';
import type { ImageSearchPort } from 'src/Domain/Ports/ImageSearchPort';
import { FrontmatterKeys } from 'src/Domain/Constants/FrontmatterRegistry';
import { showMessage } from 'src/Application/Utils/Messages';
import { formatFrontmatterBlock, parseFrontmatter, splitFrontmatter } from 'src/Application/Utils/Frontmatter';

export class AddImagesCommand {
    constructor(
        private readonly app: ObsidianApp,
        private readonly imageSearch: ImageSearchPort,
    ) { }

    async execute() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
            showMessage('Open a markdown note to add images.');
            return;
        }

        const file = view.file;
        const editor = view.editor;
        const currentContent = editor.getValue();
        const split = splitFrontmatter(currentContent);
        const frontmatter = parseFrontmatter(split.frontmatterText) || {};

        const existingImages = frontmatter[FrontmatterKeys.ImagenesUrls];

        if (Array.isArray(existingImages) && existingImages.length > 0) {
            showMessage('La nota ya tiene imágenes.');
            return;
        }

        showMessage(`Buscando imágenes para: ${file.basename}...`);

        try {
            const images = await this.imageSearch.searchImages(file.basename, 3);

            if (images.length === 0) {
                showMessage('No se encontraron imágenes.');
                return;
            }

            const updatedFrontmatter = {
                ...frontmatter,
                [FrontmatterKeys.ImagenesUrls]: images,
            };

            const newFrontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
            const newContent = newFrontmatterBlock + '\n\n' + split.body;

            editor.setValue(newContent);
            showMessage(`Se añadieron ${images.length} imágenes.`);

        } catch (error) {
            console.error(error);
            showMessage('Error al buscar imágenes.');
        }
    }
}
