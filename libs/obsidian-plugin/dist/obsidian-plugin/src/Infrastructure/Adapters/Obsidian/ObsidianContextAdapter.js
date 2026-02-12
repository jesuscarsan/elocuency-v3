"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianContextAdapter = void 0;
const obsidian_1 = require("obsidian");
class ObsidianContextAdapter {
    constructor(app) {
        this.app = app;
    }
    cleanContext(text) {
        // Removes Obsidian block IDs (e.g., ^exiezi) from the end of lines
        return text.replace(/\s+\^[a-zA-Z0-9-]+$/gm, '');
    }
    async getSectionContent(file, headerName) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.headings)
            return '';
        const targetHeading = cache.headings.find(h => {
            const cleanHeading = h.heading.replace(/\s+\^[a-zA-Z0-9-]+$/, '');
            return cleanHeading === headerName;
        });
        if (!targetHeading)
            return '';
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const startLine = targetHeading.position.start.line;
        let endLine = lines.length;
        // Find the next heading that is at the same level or higher (numerically lower level)
        for (let i = cache.headings.indexOf(targetHeading) + 1; i < cache.headings.length; i++) {
            const h = cache.headings[i];
            if (h.level <= targetHeading.level) {
                endLine = h.position.start.line;
                break;
            }
        }
        return lines.slice(startLine, endLine).join('\n');
    }
    async getLinkedFileContent(path, range) {
        const sourceFile = this.app.vault.getAbstractFileByPath(path);
        if (!(sourceFile instanceof obsidian_1.TFile))
            return '';
        const cache = this.app.metadataCache.getFileCache(sourceFile);
        if (!cache)
            return '';
        let linksToProcess = [];
        if (range) {
            // If range is specified, only include links within that range.
            if (cache.links) {
                linksToProcess = cache.links.filter(l => l.position.start.line >= range.start &&
                    l.position.start.line < range.end);
            }
        }
        else {
            // No range? Include everything.
            if (cache.links)
                linksToProcess.push(...cache.links);
            if (cache.frontmatterLinks)
                linksToProcess.push(...cache.frontmatterLinks);
        }
        if (linksToProcess.length === 0)
            return '';
        let linkedContext = '';
        const processedFiles = new Set();
        for (const link of linksToProcess) {
            const fullLinkPath = link.link;
            // Generate clean path part by removing #header or ^blockId
            let linkPathPart = fullLinkPath;
            let headerName = undefined;
            // Check for anchors
            const hashIndex = fullLinkPath.indexOf('#');
            const caretIndex = fullLinkPath.indexOf('^');
            if (hashIndex !== -1) {
                // Has header
                linkPathPart = fullLinkPath.substring(0, hashIndex);
                // Extract header
                const endOfHeader = caretIndex > hashIndex ? caretIndex : fullLinkPath.length;
                headerName = fullLinkPath.substring(hashIndex + 1, endOfHeader);
            }
            else if (caretIndex !== -1) {
                // Has block ID only
                linkPathPart = fullLinkPath.substring(0, caretIndex);
            }
            // Resolve file from the path part
            const linkFile = this.app.metadataCache.getFirstLinkpathDest(linkPathPart, sourceFile.path);
            if (linkFile instanceof obsidian_1.TFile && linkFile.extension === 'md') {
                // Create a unique key for "File + Header" to allow linking different sections
                const uniqueKey = linkFile.path + (headerName ? `:${headerName}` : '');
                if (!processedFiles.has(uniqueKey)) {
                    processedFiles.add(uniqueKey);
                    try {
                        let content = '';
                        let displayTitle = linkFile.basename;
                        if (headerName) {
                            // Extract specific header content
                            content = await this.getSectionContent(linkFile, headerName);
                            displayTitle += ` > ${headerName}`;
                        }
                        else {
                            // Default: read entire file
                            content = await this.app.vault.read(linkFile);
                        }
                        if (content) {
                            linkedContext += `\n\n--- Nota Vinculada: [[${displayTitle}]] ---\n${this.cleanContext(content)}`;
                        }
                    }
                    catch (e) {
                        console.error(`Failed to read linked file: ${linkFile.path}`, e);
                    }
                }
            }
            else {
                console.warn(`ContextManager: Could not resolve link: ${fullLinkPath}`);
            }
        }
        return linkedContext;
    }
    async getVocabularyContent(items) {
        if (items.size === 0)
            return '';
        let vocabContext = '';
        const activeFile = this.app.workspace.getActiveFile();
        const resolvedPath = activeFile?.path || '';
        for (const item of items) {
            // Clean item string (remove [[ ]])
            const cleanItem = item.replace(/^\[\[|\]\]$/g, '');
            // Try to find file by name
            let file = this.app.metadataCache.getFirstLinkpathDest(cleanItem, resolvedPath);
            // Fallback: Try from root if not found relative
            if (!file) {
                file = this.app.metadataCache.getFirstLinkpathDest(cleanItem, '');
            }
            // Fallback: fuzzy match basename if still not found
            if (!file) {
                file = this.app.vault.getFiles().find(f => f.basename === cleanItem) || null;
            }
            if (file && file instanceof obsidian_1.TFile && file.extension === 'md') {
                try {
                    const content = await this.app.vault.read(file);
                    vocabContext += `\n-- VOCABULARIO que debes utilizar en la pregunta: ---- \n${cleanItem}\n${content}\n`;
                }
                catch (e) {
                    console.warn(`Failed to read vocabulary note: ${cleanItem}`, e);
                }
            }
            else {
                console.warn(`ObsidianContextAdapter: Could not find note for vocabulary item: "${item}"`);
            }
        }
        return vocabContext;
    }
}
exports.ObsidianContextAdapter = ObsidianContextAdapter;
