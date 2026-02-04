import { App, normalizePath, TFile, Notice } from 'obsidian';
import {
    UnresolvedLinkGeneratorSettings,
} from '@/Infrastructure/Obsidian/settings';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { pathExists } from '@/Infrastructure/Obsidian/Utils/Vault';
import {
    getAllTemplateConfigs,
    TemplateMatch
} from '@/Infrastructure/Obsidian/Utils/TemplateConfig';
import { GenericFuzzySuggestModal } from '@/Infrastructure/Obsidian/Views/Modals/GenericFuzzySuggestModal';
import { ApplyTemplateCommand } from '../../ApplyTemplateCommand/ApplyTemplateCommand';
import { parseFrontmatter, splitFrontmatter } from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import { LlmPort } from "@elo/core";
import { ImageEnricherService } from '@/Infrastructure/Obsidian/Services/ImageEnricherService';

export class GenerateMissingNotesFromListFieldCommand {
    private applyTemplateCommand: ApplyTemplateCommand;

    constructor(
        private readonly app: App,
        private readonly settings: UnresolvedLinkGeneratorSettings,
        private readonly llm: LlmPort,
        private readonly imageEnricher: ImageEnricherService,
    ) {
        this.applyTemplateCommand = new ApplyTemplateCommand(
            llm,
            imageEnricher,
            app,
            settings
        );
    }

    async execute(file?: TFile): Promise<void> {
        console.log('[GenerateMissingNotesFromListFieldCommand] Start');
        const activeFile = file ?? this.app.workspace.getActiveFile();
        if (!activeFile) {
            showMessage('No active file found.');
            return;
        }

        const content = await this.app.vault.read(activeFile);
        const split = splitFrontmatter(content);
        const frontmatter = parseFrontmatter(split.frontmatterText);

        if (!frontmatter) {
            showMessage('No frontmatter found.');
            return;
        }

        // 1. Identify list fields
        const listFields: string[] = [];
        for (const [key, value] of Object.entries(frontmatter)) {
            if (Array.isArray(value)) {
                listFields.push(key);
            }
        }

        if (listFields.length === 0) {
            showMessage('No list fields found in the frontmatter.');
            return;
        }

        // 2. Prompt user to select a field
        let selectedField: string | null = null;

        selectedField = await new Promise<string | null>((resolve) => {
            new GenericFuzzySuggestModal<string>(
                this.app,
                listFields,
                (item: string) => item,
                () => { },
                resolve
            ).open();
        });

        if (!selectedField) {
            // User cancelled or no selection
            return;
        }

        // 3. Extract links from the selected field
        let links: string[] = [];
        const fieldData = frontmatter[selectedField];

        if (Array.isArray(fieldData)) {
            links = fieldData.map(link => this.extractLinkText(link)).filter(l => l !== null) as string[];
        }

        if (links.length === 0) {
            showMessage(`No links found in "${selectedField}".`);
            return;
        }

        // 4. Check for missing notes
        const missingNotes: string[] = [];
        for (const link of links) {
            if (!this.linkExists(link)) {
                missingNotes.push(link);
            }
        }

        if (missingNotes.length === 0) {
            showMessage(`All notes in "${selectedField}" already exist.`);
            return;
        }

        showMessage(`Found ${missingNotes.length} missing notes in "${selectedField}". Select template...`);

        // 5. Ask for template
        const matches = await getAllTemplateConfigs(this.app);
        if (matches.length === 0) {
            showMessage('No templates found.');
            return;
        }

        let templateResult: TemplateMatch | null = null;

        templateResult = await new Promise<TemplateMatch | null>((resolve) => {
            new GenericFuzzySuggestModal<TemplateMatch>(
                this.app,
                matches,
                (item: TemplateMatch) => item.templateFile.basename,
                () => { },
                resolve
            ).open();
        });

        if (!templateResult) {
            showMessage('No template selected. Aborting.');
            return;
        }

        showMessage(`Generating ${missingNotes.length} notes with template ${templateResult.templateFile.basename}...`);

        for (const noteName of missingNotes) {
            try {
                // Default: Same folder as active note.
                const parentPath = activeFile.parent ? activeFile.parent.path : '';
                const newFilePath = normalizePath(`${parentPath}/${noteName}.md`);

                // Double check existence to avoid race conditions or previous check failure
                if (await pathExists(this.app, newFilePath)) {
                    continue;
                }

                // Create empty file
                const newFile = await this.app.vault.create(newFilePath, '');

                // Apply template
                await this.applyTemplateCommand.applyTemplate(newFile, templateResult);

                console.log(`Created and processed ${newFilePath}`);

            } catch (e) {
                console.error(`Error creating note ${noteName}:`, e);
                new Notice(`Failed to create ${noteName}`);
            }
        }

        showMessage(`Finished generating notes.`);
        console.log('[GenerateMissingNotesFromListFieldCommand] End');
    }

    private extractLinkText(text: string): string | null {
        // [[LinkName]] -> LinkName
        // [[LinkName|Alias]] -> LinkName
        // PlainText -> PlainText (if valid?) Assuming links are bracketed.
        // If user put just "Title", we treat it as "Title"
        if (!text) return null;

        const output = text.trim();
        if (output.startsWith('[[') && output.endsWith(']]')) {
            const content = output.slice(2, -2);
            return content.split('|')[0];
        }
        // Fallback: assume it's just text if no brackets (common in some setups?)
        // But usually Link type in frontmatter suggests brackets or "path". 
        // If it's just "Name", we return "Name".
        return output;
    }

    private linkExists(linkName: string): boolean {
        // Check metadata cache for link resolution or file existence
        // linkName could be a path or just a name.
        const file = this.app.metadataCache.getFirstLinkpathDest(linkName, '');
        return !!file;
    }
}
