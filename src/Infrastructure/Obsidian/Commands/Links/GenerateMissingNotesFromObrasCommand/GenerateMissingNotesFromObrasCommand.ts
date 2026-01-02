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
import { LlmPort } from '@/Domain/Ports/LlmPort';
import { ImageSearchPort } from '@/Domain/Ports/ImageSearchPort';

export class GenerateMissingNotesFromObrasCommand {
    private applyTemplateCommand: ApplyTemplateCommand;

    constructor(
        private readonly app: App,
        private readonly settings: UnresolvedLinkGeneratorSettings,
        private readonly llm: LlmPort,
        private readonly imageSearch: ImageSearchPort,
    ) {
        this.applyTemplateCommand = new ApplyTemplateCommand(
            llm,
            imageSearch,
            app,
            settings
        );
    }

    async execute(file?: TFile): Promise<void> {
        console.log('[GenerateMissingNotesFromObrasCommand] Start');
        const activeFile = file ?? this.app.workspace.getActiveFile();
        if (!activeFile) {
            showMessage('No active file found.');
            return;
        }

        const content = await this.app.vault.read(activeFile);
        const split = splitFrontmatter(content);
        const frontmatter = parseFrontmatter(split.frontmatterText);

        if (!frontmatter || !frontmatter['Obras']) {
            showMessage('No "Obras" field found in the frontmatter.');
            return;
        }

        let obrasLinks: string[] = [];

        // Parse Obras field: it can be a list of strings like ["[[Obra1]]", "[[Obra2]]"] or just strings if the parser handled it already
        const obrasField = frontmatter['Obras'];

        if (Array.isArray(obrasField)) {
            obrasLinks = obrasField.map(link => this.extractLinkText(link)).filter(l => l !== null) as string[];
        } else if (typeof obrasField === 'string') {
            // Could be a comma separated list or a single link? 
            // Or if it's a valid list in YAML it should be parsed as array.
            // If it's "[[Obra1]], [[Obra2]]" string, we might need to regex.
            // Assuming well formed list for now.
            const extracted = this.extractLinkText(obrasField);
            if (extracted) obrasLinks.push(extracted);
        }

        if (obrasLinks.length === 0) {
            showMessage('No links found in "Obras".');
            return;
        }

        const missingNotes: string[] = [];
        for (const link of obrasLinks) {
            if (!this.linkExists(link)) {
                missingNotes.push(link);
            }
        }

        if (missingNotes.length === 0) {
            showMessage('All notes in "Obras" already exist.');
            return;
        }

        showMessage(`Found ${missingNotes.length} missing notes. Select template...`);

        // Ask for template
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
                (item) => item.templateFile.basename,
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
                // Create file in current folder (or root if active file path is weird)
                // Or maybe follow some convention. User said: "cifrarlo igual que GenerateMissingNotesFromLinksCommand"? No, user request was specific about "aplicarle una template"
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
        console.log('[GenerateMissingNotesFromObrasCommand] End');
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
