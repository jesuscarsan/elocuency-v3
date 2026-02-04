import {
    App as ObsidianApp,
    TFile,
} from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import type { LlmPort } from "@elo/core";
import type { ImageEnricherService } from '@/Infrastructure/Obsidian/Services/ImageEnricherService';
import { FrontmatterKeys } from "@elo/core";
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { InputModal } from '@/Infrastructure/Obsidian/Views/Modals/InputModal';
import { UnresolvedLinkGeneratorSettings } from '@/Infrastructure/Obsidian/settings';
import { ApplyTemplateCommand } from '@/Infrastructure/Obsidian/Commands/ApplyTemplateCommand/ApplyTemplateCommand';

export class EnrichWithPromptUrlCommand {
    constructor(
        private readonly llm: LlmPort,
        private readonly imageEnricher: ImageEnricherService,
        private readonly obsidian: ObsidianApp,
        private readonly settings: UnresolvedLinkGeneratorSettings,
    ) { }

    async execute(targetFile?: TFile) {
        console.log('[EnrichWithPromptUrlCommand] Start');
        const view = getActiveMarkdownView(this.obsidian, targetFile);
        const file = targetFile ?? view?.file;

        if (!file) {
            showMessage('Open a markdown note to enrich.');
            return;
        }

        new InputModal(
            this.obsidian,
            {
                title: 'Enrich with Prompt URL',
                label: 'Enter URL (e.g. Wikipedia article)',
                placeholder: 'https://...',
                submitText: 'Enrich'
            },
            async (url) => {
                if (!url) {
                    showMessage('URL is required.');
                    return;
                }
                await this.processUrl(file, url);
            }
        ).open();
    }

    private async processUrl(file: TFile, url: string) {
        try {
            // 1. Update frontmatter
            const content = await this.obsidian.vault.read(file);
            const split = splitFrontmatter(content);
            const frontmatter = parseFrontmatter(split.frontmatterText) || {};

            frontmatter[FrontmatterKeys.EloPromptUrl] = url;

            const frontmatterBlock = formatFrontmatterBlock(frontmatter);
            // Reconstruct content. Ensure we handle empty body correctly.
            const body = split.body ? split.body.trim() : '';
            const newContent = frontmatterBlock + (body ? '\n\n' + body : '');

            await this.obsidian.vault.modify(file, newContent);

            // 2. Trigger ApplyTemplateCommand
            const command = new ApplyTemplateCommand(
                this.llm,
                this.imageEnricher,
                this.obsidian,
                this.settings
            );

            await command.execute(file);
        } catch (error) {
            console.error('[EnrichWithPromptUrlCommand] Error:', error);
            showMessage(`Error enriching with prompt URL: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
