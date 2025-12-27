import {
    Plugin as ObsidianPlugin,
    TFile,
    TAbstractFile,
} from 'obsidian';
import { UnresolvedLinkGeneratorSettings } from '@/Infrastructure/Obsidian/settings';
import { getTemplatesFolder, isFolderMatch } from '@/Infrastructure/Obsidian/Utils/Vault';
import { EnhanceByAiCommand } from '@/Infrastructure/Obsidian/Commands/EnhanceByAiCommand/EnhanceByAiCommand';
import { LlmPort } from '@/Domain/Ports/LlmPort';

import { normalizePath, MarkdownView } from 'obsidian';
import { executeInEditMode } from '@/Infrastructure/Obsidian/Utils/ViewMode';

interface EloPlugin extends ObsidianPlugin {
    settings: UnresolvedLinkGeneratorSettings;
}

export class EnhanceNoteCommand {
    constructor(private readonly obsidianPlugin: EloPlugin, private readonly llm: LlmPort) { }

    async execute(file: TAbstractFile) {
        // Implementation of applying commands
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return;
        }

        if (true) {
            new EnhanceByAiCommand(this.obsidianPlugin.app, this.obsidianPlugin.settings, this.llm).execute();
        }
    }
}