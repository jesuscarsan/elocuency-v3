import { App, TFile, getAllTags } from 'obsidian';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { FrontmatterRegistry } from '@/Domain/Constants/FrontmatterRegistry';
import { showMessage, moveFile } from '@/Infrastructure/Obsidian/Utils';

export class RelocateNoteByLinkFieldCommand {
    constructor(private readonly app: App) { }

    async execute(targetFile?: TFile): Promise<void> {
        const view = getActiveMarkdownView(this.app, targetFile);
        if (!view?.file) {
            showMessage('No active file');
            return;
        }

        await executeInEditMode(view, async () => {
            const activeFile = view.file;
            console.log('RelocateteNoteCommand: Active file', activeFile?.path);
            // check again
            if (!activeFile) return;

            const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
            if (!frontmatter) {
                showMessage('No frontmatter found in active file');
                return;
            }

            // Find the first field with isRelocateField=true THAT EXISTS in the current note
            const registryValues = Object.values(FrontmatterRegistry);
            const candidateFields = registryValues.filter(entry => entry.isRelocateField);

            if (candidateFields.length === 0) {
                showMessage('No field configured for reallocation (isRelocateField=true) in registry');
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
                showMessage('No valid reallocation field found in current note');
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
                showMessage(`Value in '${targetFieldInfo.key}' is invalid`);
                return;
            }

            // Extract link path/name from [[Link]] or plain text
            // Regex to match [[Content]] or [[Content|Alias]]
            const linkMatch = linkText.match(/\[\[(.*?)(?:\|.*)?\]\]/);
            const pathOrName = linkMatch ? linkMatch[1] : linkText;

            const targetFile = this.app.metadataCache.getFirstLinkpathDest(pathOrName, activeFile.path);

            if (!targetFile) {
                showMessage(`Could not resolve link: ${pathOrName}`);
                return;
            }

            if (!(targetFile instanceof TFile)) {
                showMessage(`Target is not a file: ${pathOrName}`);
                return;
            }

            let targetFolder = targetFile.parent;
            if (!targetFolder) {
                showMessage('Target file has no parent folder (root?)');
                return;
            }

            // Check if note is a "Persona" and target is "Lugares"
            const tags = getAllTags(this.app.metadataCache.getFileCache(activeFile)!) || [];
            const isPersona = tags.some(tag => tag.startsWith('#Personas/') || tag === '#Personas');
            const isTargetLugar = targetFolder.path.startsWith('Lugares');

            let finalFolderPath = targetFolder.path;

            if (isPersona && isTargetLugar) {
                finalFolderPath = `${targetFolder.path}/(Personas)`;
                const folderExists = await this.app.vault.adapter.exists(finalFolderPath);
                if (!folderExists) {
                    await this.app.vault.createFolder(finalFolderPath);
                }
            }

            console.log('RelocateteNoteCommand: From', activeFile.parent?.path);
            console.log('RelocateteNoteCommand: To', finalFolderPath);

            if (activeFile.parent?.path === finalFolderPath) {
                showMessage('Note is already in the target folder');
                return;
            }

            try {
                const newPath = `${finalFolderPath}/${activeFile.name}`;
                await moveFile(this.app, activeFile, newPath);
                showMessage(`Moved note to ${finalFolderPath}`);
            } catch (error) {
                console.error(error);
                showMessage(`Failed to move note: ${error}`);
            }
        });
    }
}
