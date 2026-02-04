import {
    App as ObsidianApp,
    TFile,
} from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { InputModal } from '@/Infrastructure/Obsidian/Views/Modals/InputModal';
import {
    UnresolvedLinkGeneratorSettings,
} from '@/Infrastructure/Obsidian/settings';
import type { LlmPort } from "@elo/core";
import type { ImageEnricherService } from '@/Infrastructure/Obsidian/Services/ImageEnricherService';
import { ApplyTemplateCommand } from './ApplyTemplateCommand';
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';

export class ApplyTemplateWithUrlCommand {
    constructor(
        private readonly llm: LlmPort,
        private readonly imageEnricher: ImageEnricherService,
        private readonly obsidian: ObsidianApp,
        private readonly settings: UnresolvedLinkGeneratorSettings,
    ) { }

    async execute(targetFile?: TFile) {
        console.log('[ApplyTemplateWithUrlCommand] Start');
        const view = getActiveMarkdownView(this.obsidian, targetFile);
        const file = targetFile ?? view?.file;

        if (!file) {
            showMessage('Open a markdown note to apply a template.');
            return;
        }

        new InputModal(
            this.obsidian,
            {
                title: 'Apply Template with Context URL',
                label: 'Enter URL (e.g. source information)',
                placeholder: 'https://...',
                submitText: 'Next'
            },
            async (url) => {
                if (!url) {
                    showMessage('URL is required.');
                    return;
                }

                const applyTemplateCommand = new ApplyTemplateCommand(
                    this.llm,
                    this.imageEnricher,
                    this.obsidian,
                    this.settings
                );

                await applyTemplateCommand.execute(file, url);
            }
        ).open();
    }
}
