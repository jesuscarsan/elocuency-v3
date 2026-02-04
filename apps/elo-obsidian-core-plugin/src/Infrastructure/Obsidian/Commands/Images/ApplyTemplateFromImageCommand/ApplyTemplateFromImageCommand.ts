import {
    App as ObsidianApp,
    MarkdownView,
    normalizePath,
    TFile,
} from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
    UnresolvedLinkGeneratorSettings,
} from '@/Infrastructure/Obsidian/settings';
import {
    formatFrontmatterBlock,
    mergeFrontmatterSuggestions,
    parseFrontmatter,
    splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import { FrontmatterKeys } from "@elo/core";
import {
    getAllTemplateConfigs,
    TemplateMatch
} from '@/Infrastructure/Obsidian/Utils/TemplateConfig';
import { ensureFolderExists } from '@/Infrastructure/Obsidian/Utils/Vault';
import { mergeNotes } from '@/Infrastructure/Obsidian/Utils/Notes';
import { PersonasNoteOrganizer } from '@/Application/Services/PersonasNoteOrganizer';
import { GenericFuzzySuggestModal } from '@/Infrastructure/Obsidian/Views/Modals/GenericFuzzySuggestModal';
import { ObsidianNoteManager } from '@/Infrastructure/Adapters/ObsidianNoteManager';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { TemplateContext } from '@/Infrastructure/Obsidian/Utils/TemplateContext';
import { GoogleGeminiImagesAdapter, ImageContent } from "@elo/core";
import { ImageSourceModal } from '@/Infrastructure/Obsidian/Views/Modals/ImageSourceModal';
import { ImageProcessor } from '@/Infrastructure/Obsidian/Utils/ImageProcessor';
import * as fs from 'fs';
import * as path from 'path';

export class ApplyTemplateFromImageCommand {
    constructor(
        private readonly geminiImages: GoogleGeminiImagesAdapter,
        private readonly obsidian: ObsidianApp,
        private readonly settings: UnresolvedLinkGeneratorSettings,
    ) { }

    async execute(targetFile?: TFile) {
        console.log('[ApplyTemplateFromImageCommand] Start');
        const view = getActiveMarkdownView(this.obsidian, targetFile);
        // Note: We might allow running without active view if we create a new file,
        // but ApplyTemplate logic heavily relies on merging with active note.
        // If user wants to create NEW note, they should probably open a new note first?
        // "Derived from Apply Template" suggests similar UX.
        if (!view?.file) {
            showMessage('Open a markdown note to apply a template.');
            console.log('[ApplyTemplateFromImageCommand] End (No active view)');
            return;
        }

        const file = view.file;

        // 1. Select Template
        const matches = await getAllTemplateConfigs(this.obsidian);

        if (matches.length === 0) {
            showMessage(`No templates found.`);
            return;
        }

        let templateResult: TemplateMatch | null = null;
        if (matches.length === 1) {
            templateResult = matches[0];
        } else {
            templateResult = await new Promise<TemplateMatch | null>((resolve) => {
                new GenericFuzzySuggestModal<TemplateMatch>(
                    this.obsidian,
                    matches,
                    (item) => item.templateFile.basename,
                    () => { },
                    resolve
                ).open();
            });
        }

        if (!templateResult) {
            showMessage('No template selected.');
            return;
        }

        const { config, cleanedContent, templateFile } = templateResult;
        const promptTemplate = config.prompt;

        if (!promptTemplate) {
            showMessage('The selected template does not have a !!prompt configuration.');
            return;
        }

        // 2. Select Image
        new ImageSourceModal(this.obsidian, async (source) => {
            let images: ImageContent[] = [];

            try {
                if (source.type === 'clipboard') {
                    const processed = await ImageProcessor.processBlob(source.blob);
                    if (processed) images.push(processed);
                } else if (source.type === 'path') {
                    if (fs.existsSync(source.path)) {
                        const files = await fs.promises.readdir(source.path);
                        for (const f of files) {
                            const ext = path.extname(f).slice(1).toLowerCase();
                            if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                                const buffer = await fs.promises.readFile(path.join(source.path, f));
                                // Convert Buffer to ArrayBuffer
                                const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                                const processed = await ImageProcessor.processImage(arrayBuffer, ext);
                                if (processed) images.push(processed);
                            }
                        }
                    }
                } else if (source.type === 'files') {
                    for (let i = 0; i < source.files.length; i++) {
                        const f = source.files[i];
                        const ext = f.name.split('.').pop()?.toLowerCase() || '';
                        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                            const arrayBuffer = await f.arrayBuffer();
                            const processed = await ImageProcessor.processImage(arrayBuffer, ext);
                            if (processed) images.push(processed);
                        }
                    }
                }
            } catch (e) {
                console.error(e);
                showMessage('Error processing images.');
                return;
            }

            if (images.length === 0) {
                showMessage('No valid images selected.');
                return;
            }

            // 3. Process with AI
            showMessage(`Applying template ${templateFile.basename} with ${images.length} images...`);

            const prompt = this.buildPrompt(file.basename, promptTemplate);

            try {
                const enrichment = await this.geminiImages.generateEnrichmentFromImages(images, prompt);

                if (enrichment) {
                    await executeInEditMode(view, async () => {
                        const editor = view.editor;
                        // Merge template content first
                        const mergedContent = mergeNotes(cleanedContent, editor.getValue(), false);
                        const mergedSplit = splitFrontmatter(mergedContent);
                        const mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);

                        let finalFrontmatter = mergedFrontmatter;

                        if (enrichment.frontmatter) {
                            finalFrontmatter = mergeFrontmatterSuggestions(mergedFrontmatter, enrichment.frontmatter);
                        }

                        // Recompose
                        const recomposedSegments: string[] = [];
                        if (finalFrontmatter) {
                            recomposedSegments.push(formatFrontmatterBlock(finalFrontmatter));
                        }

                        if (mergedSplit.body) {
                            recomposedSegments.push(mergedSplit.body);
                        }

                        if (enrichment.body) {
                            recomposedSegments.push(enrichment.body);
                        }

                        const finalContent = recomposedSegments.join('\n\n');
                        editor.setValue(finalContent);

                        // Post-processing (Organizer, Path, Commands) - Copied from ApplyTemplateCommand
                        if (finalFrontmatter) {
                            const noteManager = new ObsidianNoteManager(this.obsidian);
                            const organizer = new PersonasNoteOrganizer(noteManager);
                            await organizer.organize(file, finalFrontmatter);
                        }

                        if (config.path) {
                            // ... path logic ...
                            // Simplified reusing existing logic if possible or copy
                            try {
                                const targetPath = config.path.endsWith('.md')
                                    ? normalizePath(config.path)
                                    : normalizePath(`${config.path}/${file.name}`);

                                await ensureFolderExists(this.obsidian, targetPath);

                                const existing = this.obsidian.vault.getAbstractFileByPath(targetPath);
                                if (!existing || existing === file) {
                                    await this.obsidian.fileManager.renameFile(file, targetPath);
                                } else {
                                    showMessage(`File already exists at ${targetPath}. Cannot move.`);
                                }

                            } catch (e: any) {
                                console.error("Error moving file based on template config:", e);
                                showMessage(`Error moving file: ${e.message}`);
                            }
                        }

                        if (config.commands && Array.isArray(config.commands)) {
                            TemplateContext.activeConfig = config;
                            try {
                                for (const commandId of config.commands) {
                                    // ... command execution logic ...
                                    (this.obsidian as any).commands.executeCommandById(commandId);
                                }
                            } finally {
                                TemplateContext.activeConfig = null;
                            }
                        }

                    });
                    showMessage('Template applied successfully!');

                } else {
                    showMessage('AI failed to generate content.');
                }

            } catch (e) {
                console.error('Error applying template from image:', e);
                showMessage('Error applying template.');
            }

        }).open();
        console.log('[ApplyTemplateFromImageCommand] End');
    }

    private buildPrompt(
        title: string,
        promptTemplate: string,
    ): string {
        return `Nota de obsidian:'${title}'\n\n${promptTemplate}\n\n`;
    }
}
