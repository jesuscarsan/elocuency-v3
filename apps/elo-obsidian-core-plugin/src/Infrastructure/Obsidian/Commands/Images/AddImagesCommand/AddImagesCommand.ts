import { App as ObsidianApp, MarkdownView, Notice, TFile } from 'obsidian';
import type { ImageEnricherService } from '@/Infrastructure/Obsidian/Services/ImageEnricherService';
import { FrontmatterKeys } from "@elo/core";
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { formatFrontmatterBlock, parseFrontmatter, splitFrontmatter } from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';

export class AddImagesCommand {
    constructor(
        private readonly app: ObsidianApp,
        private readonly imageEnricher: ImageEnricherService,
    ) { }

    async execute(targetFile?: TFile) {
        console.log('[AddImagesCommand] Start');
        const view = getActiveMarkdownView(this.app, targetFile);
        if (!view?.file) {
            showMessage('Open a markdown note to add images.');
            console.log('[AddImagesCommand] End (No active view)');
            return;
        }
        const file = view.file;

        await executeInEditMode(view, async () => {
            const currentContent = await this.app.vault.read(file);
            const split = splitFrontmatter(currentContent);
            const frontmatter = parseFrontmatter(split.frontmatterText) || {};

            const existingImages = frontmatter[FrontmatterKeys.EloImages];

            if (Array.isArray(existingImages) && existingImages.length > 0) {
                showMessage('La nota ya tiene imágenes.');
                return;
            }

            const images = await this.imageEnricher.searchImages(file.basename, 3);

            if (images.length === 0) {
                return;
            }

            try {
                const updatedFrontmatter = {
                    ...frontmatter,
                    [FrontmatterKeys.EloImages]: images,
                };

                const newFrontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
                const newContent = newFrontmatterBlock + '\n' + split.body;

                await this.app.vault.modify(file, newContent);
                showMessage(`Se añadieron ${images.length} imágenes.`);

            } catch (error) {
                console.error(error);
                showMessage('Error al guardar imágenes.');
            }
        });
        console.log('[AddImagesCommand] End');
    }
}
