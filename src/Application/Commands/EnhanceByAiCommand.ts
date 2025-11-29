import { App, MarkdownView, normalizePath, TFile } from 'obsidian';
import { LlmPort } from '../../Domain/Ports/LlmPort';
import { UnresolvedLinkGeneratorSettings } from '../../settings';
import { getTemplatesFolder, isFolderMatch } from '../Utils/Vault';
import { showMessage } from '../Utils/Messages';
import {
    formatFrontmatterBlock,
    mergeFrontmatterSuggestions,
    parseFrontmatter,
    splitFrontmatter
} from '../Utils/Frontmatter';
import { getTemplateConfigForFolder } from '../Utils/TemplateConfig';

export class EnhanceByAiCommand {
    constructor(
        private readonly app: App,
        private readonly settings: UnresolvedLinkGeneratorSettings,
        private readonly llm: LlmPort
    ) { }

    async execute() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
            showMessage('Open a markdown note to enhance it.');
            return;
        }

        const file = view.file;
        const parentPath = file.parent ? file.parent.path : '/';

        const templateResult = await getTemplateConfigForFolder(this.app, this.settings, parentPath);

        if (!templateResult) {
            showMessage('No template configured for this folder or template file not found.');
            return;
        }

        const { config } = templateResult;

        if (!config.prompt) {
            showMessage('No prompt configured in the template file.');
            return;
        }

        showMessage('Enhancing note with AI...');

        const editor = view.editor;
        const content = editor.getValue();
        const split = splitFrontmatter(content);
        const frontmatter = parseFrontmatter(split.frontmatterText);

        const prompt = this.buildPrompt(file.basename, config.prompt, frontmatter, split.body);

        const response = await this.llm.requestEnrichment({ prompt });

        if (response) {
            const updatedFrontmatter = mergeFrontmatterSuggestions(
                frontmatter,
                response.frontmatter
            );

            const frontmatterBlock = updatedFrontmatter
                ? formatFrontmatterBlock(updatedFrontmatter)
                : '';

            const newContent = [frontmatterBlock, split.body, response.body].filter(Boolean).join('\n\n');

            editor.setValue(newContent);
            showMessage('Note enhanced!');
        } else {
            showMessage('AI enhancement failed.');
        }
    }

    private buildPrompt(title: string, settingPrompt: string, frontmatter: any, body: string): string {
        return [
            `Genera contenido para una nota de Obsidian: "${title}".`,
            `${settingPrompt}`,
            `Frontmatter actual (JSON): ${JSON.stringify(frontmatter)}`,
            `Cuerpo actual: "${body}"`,
            'Devuelve un JSON con los campos:',
            '"body": contenido para el cuerpo de la nota (no elimines información del cuerpo actual, si ves infromación incorrecta, comenta la incrrección explicitamente).',
            '"frontmatter": objeto con claves y valores sugeridos SOLO para los campos que falten o estén vacíos en el frontmatter actual.',
            'No añadas texto fuera del JSON y evita marcar código.'
        ].join('\n');
    }
}
