import { App, MarkdownView } from 'obsidian';
import { LlmPort } from '../../Domain/Ports/LlmPort';
import { UnresolvedLinkGeneratorSettings } from '../../settings';
import { isFolderMatch } from '../Utils/Vault';
import { showMessage } from '../Utils/Messages';
import {
    formatFrontmatterBlock,
    mergeFrontmatterSuggestions,
    parseFrontmatter,
    splitFrontmatter
} from '../Utils/Frontmatter';

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

        const matchingTemplate = this.settings.templateOptions.find(
            (option) => isFolderMatch(parentPath, option.targetFolder)
        );

        if (!matchingTemplate || !matchingTemplate.prompt) {
            showMessage('No prompt configured for this folder.');
            return;
        }

        showMessage('Enhancing note with AI...');

        const editor = view.editor;
        const content = editor.getValue();
        const split = splitFrontmatter(content);
        const frontmatter = parseFrontmatter(split.frontmatterText);

        const prompt = this.buildPrompt(file.basename, matchingTemplate.prompt, frontmatter, split.body);

        const response = await this.llm.requestEnrichment({ prompt });

        if (response) {
            const updatedFrontmatter = mergeFrontmatterSuggestions(
                frontmatter,
                response.frontmatter
            );

            const frontmatterBlock = updatedFrontmatter
                ? formatFrontmatterBlock(updatedFrontmatter)
                : '';

            let newBody = split.body;
            // Only fill body if it's empty or user explicitly asked (but here we follow "rellenar los campos vacios")
            if (!newBody.trim() && response.body) {
                newBody = response.body;
            }

            const newContent = [frontmatterBlock, newBody].filter(Boolean).join('\n\n');

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
