import { App, Notice, TFile, TFolder, MarkdownView } from 'obsidian';
import { executeInEditMode } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { FrontmatterRegistry } from '@/Domain/Constants/FrontmatterRegistry';

export class ReallocateNoteCommand {
    constructor(private readonly app: App) { }

    async execute(): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
            new Notice('No active file');
            return;
        }

        await executeInEditMode(view, async () => {
            const activeFile = view.file;
            // check again
            if (!activeFile) return;

            const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
            if (!frontmatter) {
                new Notice('No frontmatter found in active file');
                return;
            }

            // Find the first field with forRealocateNote=true THAT EXISTS in the current note
            const registryValues = Object.values(FrontmatterRegistry);
            const candidateFields = registryValues.filter(entry => entry.forRealocateNote);

            if (candidateFields.length === 0) {
                new Notice('No field configured for reallocation (forRealocateNote=true) in registry');
                return;
            }

            let targetFieldInfo = undefined;
            let rawValue = undefined;

            for (const candidate of candidateFields) {
                const val = frontmatter[candidate.key];
                // Check if value exists and is not empty/null/undefined
                if (val !== undefined && val !== null && val !== "") {
                    // Check for empty array
                    if (Array.isArray(val) && val.length === 0) {
                        continue;
                    }
                    targetFieldInfo = candidate;
                    rawValue = val;
                    break;
                }
            }

            if (!targetFieldInfo || !rawValue) {
                new Notice('No valid reallocation field found in current note');
                return;
            }

            let linkText: string = "";

            if (Array.isArray(rawValue)) {
                if (rawValue.length > 0) {
                    linkText = rawValue[0];
                }
            } else if (typeof rawValue === 'string') {
                linkText = rawValue;
            }

            if (!linkText) {
                new Notice(`Value in '${targetFieldInfo.key}' is invalid`);
                return;
            }

            // Extract link path/name from [[Link]] or plain text
            // Regex to match [[Content]] or [[Content|Alias]]
            const linkMatch = linkText.match(/\[\[(.*?)(?:\|.*)?\]\]/);
            const pathOrName = linkMatch ? linkMatch[1] : linkText;

            const targetFile = this.app.metadataCache.getFirstLinkpathDest(pathOrName, activeFile.path);

            if (!targetFile) {
                new Notice(`Could not resolve link: ${pathOrName}`);
                return;
            }

            if (!(targetFile instanceof TFile)) {
                new Notice(`Target is not a file: ${pathOrName}`);
                return;
            }

            const targetFolder = targetFile.parent;
            if (!targetFolder) {
                new Notice('Target file has no parent folder (root?)');
                // If root, targetFolder.path is "/" or empty?
                // targetFolder is TFolder.
                return;
            }

            if (activeFile.parent?.path === targetFolder.path) {
                new Notice('Note is already in the target folder');
                return;
            }

            const newPath = `${targetFolder.path}/${activeFile.name}`;

            try {
                await this.app.fileManager.renameFile(activeFile, newPath);
                new Notice(`Moved note to ${targetFolder.path}`);
            } catch (error) {
                console.error(error);
                new Notice(`Failed to move note: ${error}`);
            }
        });
    }
}
