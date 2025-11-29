import {
    Plugin as ObsidianPlugin,
    TFile,
    TAbstractFile,
} from 'obsidian';
import { UnresolvedLinkGeneratorSettings } from '../../settings';
import { getTemplatesFolder, isFolderMatch } from '../Utils/Vault';
import { EnhanceByAiCommand } from './EnhanceByAiCommand';
import { LlmPort } from 'src/Domain/Ports/LlmPort';
import { getTemplateConfigForFolder } from '../Utils/TemplateConfig';
import { normalizePath } from 'obsidian';

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

        const parentPath = file.parent?.path;
        if (!parentPath) {
            return;
        }

        const templateResult = await getTemplateConfigForFolder(this.obsidianPlugin.app, this.obsidianPlugin.settings, parentPath);

        if (!templateResult) {
            return;
        }

        const { config } = templateResult;

        if (
            config.commands &&
            config.commands.length > 0
        ) {
            console.log(
                `[Elocuency] Note enhanced to ${parentPath}. Executing commands: ${config.commands.join(', ')}`,
            );

            const leaf = this.obsidianPlugin.app.workspace.getLeaf(false);
            const app = this.obsidianPlugin.app as any;
            await leaf.openFile(file);

            for (let commandId of config.commands) {
                commandId = commandId.indexOf(':') === -1 ? 'elocuency:' + commandId : commandId;
                const command = app.commands.findCommand(commandId);
                if (command) {
                    app.commands.executeCommandById(commandId);
                } else {
                    console.warn(`[Elocuency] Command not found: ${commandId}`);
                }
            }

        }
        if (config.prompt) {
            new EnhanceByAiCommand(this.obsidianPlugin.app, this.obsidianPlugin.settings, this.llm).execute();
        }
    }
}