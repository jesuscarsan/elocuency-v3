import { App, MarkdownView, normalizePath, TFile } from 'obsidian';
import { LlmPort } from '../../../Domain/Ports/LlmPort';
import { UnresolvedLinkGeneratorSettings } from '../settings';
import { getTemplatesFolder, isFolderMatch } from '../Utils/Vault';
import { showMessage } from '../Utils/Messages';
import {
    formatFrontmatterBlock,
    applyFrontmatterUpdates,
    parseFrontmatter,
    splitFrontmatter
} from '../Utils/Frontmatter';
import { getTemplateConfigForFolder } from '../Utils/TemplateConfig';
import { FrontmatterKeys, FrontmatterRegistry } from '../../../Domain/Constants/FrontmatterRegistry';
import { executeInEditMode } from '../Utils/ViewMode';

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

        await executeInEditMode(view, async () => {
            const file = view.file;
            const editor = view.editor;
            const content = editor.getValue();
            const split = splitFrontmatter(content);
            const frontmatter = parseFrontmatter(split.frontmatterText) || {};

            const customPrompt = frontmatter[FrontmatterKeys.AiPrompt];
            const customCommands = frontmatter[FrontmatterKeys.AiCommands];

            let promptToUse = customPrompt;

            // If no custom prompt, try to get from template
            if (!promptToUse && file) {
                const parentPath = file.parent ? file.parent.path : '/';
                const templateResult = await getTemplateConfigForFolder(this.app, this.settings, parentPath);

                if (templateResult && templateResult.config.prompt) {
                    promptToUse = templateResult.config.prompt;
                }
            }

            if (!promptToUse) {
                showMessage('No prompt configured in the template file or frontmatter (!!prompt).');
                return;
            }

            showMessage('Enhancing note with AI...');

            if (file) {
                const prompt = this.buildPrompt(file.basename, promptToUse as string, frontmatter, split.body, customCommands as string | string[]);

                const response = await this.llm.requestEnrichment({ prompt });

                if (response) {
                    const frontmatterToProcess = response.frontmatter || {};
                    const processedFrontmatter = this.processAiResponseFrontmatter(frontmatterToProcess);
                    const updatedFrontmatter = applyFrontmatterUpdates(
                        frontmatter,
                        processedFrontmatter
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
        });
    }

    private buildPrompt(title: string, settingPrompt: string, frontmatter: any, body: string, customCommands?: string | string[]): string {
        const parts = [
            `Genera contenido para una nota de Obsidian: "${title}".`,
            `${settingPrompt}`,
        ];

        if (customCommands) {
            if (Array.isArray(customCommands)) {
                parts.push(...customCommands);
            } else {
                parts.push(customCommands);
            }
        }

        parts.push(
            `Frontmatter actual (JSON): ${JSON.stringify(frontmatter)}`,
            `Cuerpo actual: "${body}"`,
            'Devuelve un JSON con los campos:',
            '"body": contenido para el cuerpo de la nota (no elimines información del cuerpo actual, si ves infromación incorrecta, comenta la incrrección explicitamente).',
            '"frontmatter": objeto con claves y valores sugeridos para mejorar, corregir o completar el frontmatter actual. PUEDES SOBREMBSCRIBIR VALORES si tienes una mejor sugerencia.',
            'No añadas texto fuera del JSON y evita marcar código.'
        );

        return parts.join('\n');
    }

    private processAiResponseFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
        if (!frontmatter) return frontmatter;

        const processed: Record<string, unknown> = {};
        const keyMap = new Map<string, string>();

        // Map lowercase keys to canonical keys from Registry
        Object.keys(FrontmatterRegistry).forEach(key => {
            keyMap.set(key.toLowerCase(), key);
        });

        for (const [key, value] of Object.entries(frontmatter)) {
            let targetKey = key;
            const lowerKey = key.toLowerCase();

            // Try to find canonical key
            if (keyMap.has(lowerKey)) {
                targetKey = keyMap.get(lowerKey)!;
            }

            const config = FrontmatterRegistry[targetKey];
            let finalValue = value;

            if (config && config.asLink) {
                if (typeof value === 'string') {
                    finalValue = this.ensureBrackets(value);
                } else if (Array.isArray(value)) {
                    finalValue = value.map(item => {
                        if (typeof item === 'string') {
                            return this.ensureBrackets(item);
                        }
                        return item;
                    });
                }
            }

            processed[targetKey] = finalValue;
        }

        return processed;
    }

    private ensureBrackets(value: string): string {
        const trimmed = value.trim();
        if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
            return trimmed;
        }
        return `[[${trimmed}]]`;
    }
}
