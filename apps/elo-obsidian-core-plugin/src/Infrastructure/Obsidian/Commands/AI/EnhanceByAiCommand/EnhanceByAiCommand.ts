import { App, MarkdownView, normalizePath, TFile } from 'obsidian';
import { LlmPort } from "@elo/core";
import { UnresolvedLinkGeneratorSettings } from '@/Infrastructure/Obsidian/settings';
import { getTemplatesFolder, isFolderMatch } from '@/Infrastructure/Obsidian/Utils/Vault';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
    formatFrontmatterBlock,
    applyFrontmatterUpdates,
    parseFrontmatter,
    splitFrontmatter
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';

import { FrontmatterKeys, FrontmatterRegistry } from "@elo/core";
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { TemplateContext } from '@/Infrastructure/Obsidian/Utils/TemplateContext';

export class EnhanceByAiCommand {
    constructor(
        private readonly app: App,
        private readonly settings: UnresolvedLinkGeneratorSettings,
        private readonly llm: LlmPort
    ) { }

    async execute(targetFile?: TFile) {
        console.log('[EnhanceByAiCommand] Start');
        const view = getActiveMarkdownView(this.app, targetFile);
        if (!view?.file) {
            showMessage('Open a markdown note to enhance it.');
            console.log('[EnhanceByAiCommand] End (No active view)');
            return;
        }

        await executeInEditMode(view, async () => {
            const file = view.file;
            const editor = view.editor;
            const content = editor.getValue();
            const split = splitFrontmatter(content);
            const frontmatter = parseFrontmatter(split.frontmatterText) || {};

            const customPrompt = frontmatter[FrontmatterKeys.EloPrompt];
            const customCommands = frontmatter[FrontmatterKeys.EloCommands];

            let promptToUse = '';
            let includeFrontmatter = false;

            // 0. Use context from ApplyTemplateCommand if available
            const contextConfig = TemplateContext.activeConfig;
            if (contextConfig && contextConfig.prompt) {
                promptToUse = contextConfig.prompt;
                includeFrontmatter = !!contextConfig.hasFrontmatter;
            }



            // 2. Fallback to custom prompt
            if (!promptToUse && customPrompt) {
                promptToUse = customPrompt as string;
                // If using custom prompt from CURRENT FILE, we check if current file has other frontmatter.
                // We have `frontmatter` object. We check if it has keys other than `!!` keys.
                const cleanKeys = Object.keys(frontmatter).filter(k => !k.startsWith('!!'));
                includeFrontmatter = cleanKeys.length > 0;
            }

            if (!promptToUse) {
                showMessage('No prompt configured in the template file or frontmatter (!!prompt).');
                return;
            }

            showMessage('Enhancing note with AI...');

            if (file) {
                // Filter out internal keys for the prompt context
                const frontmatterForContext = { ...frontmatter };
                delete frontmatterForContext[FrontmatterKeys.EloPrompt];
                delete frontmatterForContext[FrontmatterKeys.EloCommands];

                const prompt = this.buildPrompt(file.basename, promptToUse as string, frontmatterForContext, split.body, includeFrontmatter, customCommands as string | string[]);

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
        console.log('[EnhanceByAiCommand] End');
    }

    private buildPrompt(title: string, settingPrompt: string, frontmatter: any, body: string, includeFrontmatter: boolean, customCommands?: string | string[]): string {
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
            '"body": contenido para el cuerpo de la nota (no elimines información del cuerpo actual, si ves información incorrecta, comenta la incorrección explicitamente).',
        );

        if (includeFrontmatter) {
            parts.push('"frontmatter": objeto con claves y valores sugeridos para mejorar, corregir o completar el frontmatter actual. PUEDES SOBREMBSCRIBIR VALORES solo si tienes una mejor sugerencia.');
        }

        parts.push(
            'En el JSON, no envies caracteres que puedan hacer que el JSON no sea válido.'
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
