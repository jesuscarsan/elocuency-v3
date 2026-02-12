"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianNoteManager = void 0;
const obsidian_1 = require("obsidian");
const ObsidianMetadataAdapter_1 = require("./ObsidianMetadataAdapter");
class ObsidianNoteManager {
    constructor(app) {
        this.app = app;
    }
    getActiveNote() {
        const file = this.app.workspace.getActiveFile();
        if (!file)
            return null;
        return this.mapToNoteItem(file);
    }
    async getActiveNoteContent() {
        const file = this.app.workspace.getActiveFile();
        if (!file)
            return '';
        return await this.app.vault.read(file);
    }
    async readNote(path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof obsidian_1.TFile) {
            return await this.app.vault.read(file);
        }
        return '';
    }
    async getNoteMetadata(path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof obsidian_1.TFile) {
            const metaService = new ObsidianMetadataAdapter_1.ObsidianMetadataAdapter(this.app);
            return await metaService.getFileMetadata(file);
        }
        return {};
    }
    async renameFile(fileItem, newPath) {
        const path = typeof fileItem === 'string' ? fileItem : fileItem.path;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof obsidian_1.TFile) {
            await this.app.fileManager.renameFile(file, newPath);
        }
    }
    async ensureFolderExists(path) {
        const folders = path.split('/').filter((f) => f.length > 0);
        if (folders.length === 0)
            return;
        let currentPath = '';
        for (const folder of folders) {
            currentPath = currentPath === '' ? folder : `${currentPath}/${folder}`;
            const normalized = (0, obsidian_1.normalizePath)(currentPath);
            const exists = this.app.vault.getAbstractFileByPath(normalized);
            if (!exists) {
                await this.app.vault.createFolder(normalized);
            }
        }
    }
    normalizePath(path) {
        return (0, obsidian_1.normalizePath)(path);
    }
    async getNoteHeadings(path) {
        // using any[] or specific type mapping
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof obsidian_1.TFile) {
            const cache = this.app.metadataCache.getFileCache(file);
            return cache?.headings || [];
        }
        return [];
    }
    async updateBlockMetadata(path, blockId, metadata) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof obsidian_1.TFile) {
            const metaService = new ObsidianMetadataAdapter_1.ObsidianMetadataAdapter(this.app);
            await metaService.updateBlockMetadata(file, blockId, metadata);
        }
    }
    mapToNoteItem(file) {
        return {
            path: file.path,
            name: file.name,
            extension: file.extension,
            basename: file.basename,
        };
    }
}
exports.ObsidianNoteManager = ObsidianNoteManager;
