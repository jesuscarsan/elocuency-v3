import { App as ObsidianApp, MarkdownView, Notice, TFile } from 'obsidian';
import type { ImageSearchPort } from '@/Domain/Ports/ImageSearchPort';
import { FrontmatterKeys } from '@/Domain/Constants/FrontmatterRegistry';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { formatFrontmatterBlock, parseFrontmatter, splitFrontmatter } from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import { executeInEditMode, getActiveMarkdownView } from '../../Utils/ViewMode';

export class AddImagesCommand {
    constructor(
        private readonly app: ObsidianApp,
        private readonly imageSearch: ImageSearchPort,
    ) { }

    async execute(targetFile?: TFile) {
        const view = getActiveMarkdownView(this.app, targetFile);
        if (!view?.file) {
            showMessage('Open a markdown note to add images.');
            return;
        }
        const file = view.file;

        await executeInEditMode(view, async () => {
            const currentContent = await this.app.vault.read(file);
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
                const newContent = newFrontmatterBlock + '\n' + split.body;

                await this.app.vault.modify(file, newContent);
                showMessage(`Se añadieron ${images.length} imágenes.`);

            } catch (error) {
                console.error(error);
                showMessage('Error al buscar imágenes.');
            }
        });
    }
}
