import { App, TFile, getAllTags, parseYaml } from 'obsidian';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { FrontmatterRegistry } from "@elo/core";
import { TagFolderMappingRegistry } from "@elo/core";
import { showMessage, moveFile } from '@/Infrastructure/Obsidian/Utils';

export class RelocateNoteByLinkFieldCommand {
    constructor(private readonly app: App) { }

    async execute(targetFile?: TFile): Promise<void> {
        console.log('[RelocateNoteByLinkFieldCommand] Start');
        const view = getActiveMarkdownView(this.app, targetFile);
        if (!view?.file) {
            showMessage('No active file');
            console.log('[RelocateNoteByLinkFieldCommand] End (No active view)');
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

            // CACHE BASED TAGS
            const cache = this.app.metadataCache.getFileCache(activeFile);
            let tags: string[] = [];
            if (cache) {
                tags = getAllTags(cache) || [];
            }
            console.log('RelocateNote: Cache found:', !!cache);
            console.log('RelocateNote: getAllTags result:', tags);

            // FRONTMATTER BASED TAGS (CACHE)
            const fmTags = frontmatter['tags'] || frontmatter['Tags'] || frontmatter['tag'];
            let fmTagList = Array.isArray(fmTags) ? fmTags : (fmTags ? [fmTags] : []);
            console.log('RelocateNote: Frontmatter tags (cache):', fmTagList);

            // MANUAL FALLBACK: PARSE EDITOR CONTENT
            // Use this if cache seems empty but we suspect tags might exist, or just always as a safety net
            try {
                const content = view.editor.getValue();
                const match = content.match(/^---\n([\s\S]*?)\n---/);
                if (match) {
                    const yamlRaw = match[1];
                    const parsed = parseYaml(yamlRaw);
                    if (parsed) {
                        const manualTags = parsed['tags'] || parsed['Tags'] || parsed['tag'];
                        const manualTagList = Array.isArray(manualTags) ? manualTags : (manualTags ? [manualTags] : []);
                        if (manualTagList.length > 0) {
                            console.log('RelocateNote: Manual YAML parse found tags:', manualTagList);
                            // Merge distinct tags
                            fmTagList = [...new Set([...fmTagList, ...manualTagList])];
                        }
                    }
                }
            } catch (e) {
                console.error('RelocateNote: Manual YAML parsing failed', e);
            }

            const allTags = [...tags, ...fmTagList];
            console.log('RelocateNote: Combined tag list final:', allTags);

            const normalizedTags = new Set(
                allTags
                    .filter(t => t !== null && t !== undefined)
                    .map(t => String(t).trim().normalize('NFC').toLowerCase().replace(/^#/, ''))
            );

            let targetFolderSuffix: string | undefined;

            // Iterate registry keys in order to respect priority (more specific tags first)
            for (const [tagKey, folderSuffix] of Object.entries(TagFolderMappingRegistry)) {
                if (normalizedTags.has(tagKey.normalize('NFC').toLowerCase())) {
                    targetFolderSuffix = folderSuffix;
                    break;
                }
            }

            console.log('RelocateNote: determined suffix:', targetFolderSuffix);

            const isTargetLugar = targetFolder.path.startsWith('Lugares');

            let finalFolderPath = targetFolder.path;

            if (isTargetLugar && targetFolderSuffix) {
                finalFolderPath = `${targetFolder.path}/${targetFolderSuffix}`;

                if (finalFolderPath !== targetFolder.path) {
                    const folderExists = await this.app.vault.adapter.exists(finalFolderPath);
                    if (!folderExists) {
                        await this.app.vault.createFolder(finalFolderPath);
                    }
                }
            }


            // Si la nota esta en una carpeta con el mismo nombre, no hace el relocate (es folder note ya ubicada)
            if (activeFile.parent?.name === activeFile.basename) {
                console.log('RelocateNote: Note is in a folder with the same name (Folder Note), skipping relocation.');
                return;
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
        console.log('[RelocateNoteByLinkFieldCommand] End');
    }
}
