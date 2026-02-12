"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianNoteRepository = void 0;
const obsidian_1 = require("obsidian");
class ObsidianNoteRepository {
    constructor(app) {
        this.app = app;
    }
    async getNoteMetadata(path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian_1.TFile))
            return null;
        const cache = this.app.metadataCache.getFileCache(file);
        return {
            path: file.path,
            basename: file.basename,
            frontmatter: cache?.frontmatter,
            tags: cache ? ((0, obsidian_1.getAllTags)(cache) || undefined) : undefined
        };
    }
    async readNote(path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian_1.TFile))
            throw new Error(`File not found: ${path}`);
        return await this.app.vault.read(file);
    }
    async appendContent(path, content) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian_1.TFile))
            throw new Error(`File not found: ${path}`);
        const currentContent = await this.app.vault.read(file);
        await this.app.vault.modify(file, currentContent + content);
    }
    async updateFrontmatter(path, callback) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian_1.TFile))
            throw new Error(`File not found: ${path}`);
        await this.app.fileManager.processFrontMatter(file, callback);
    }
    async createNote(path, content) {
        const file = await this.app.vault.create(path, content);
        // Wait for cache to update? simple return for now
        return {
            path: file.path,
            basename: file.basename,
            frontmatter: {},
            tags: []
        };
    }
    async exists(path) {
        return await this.app.vault.adapter.exists(path);
    }
    async createFolder(path) {
        // Obsidian can create nested folders? or need recursive?
        // simple createFolder usuall works if parent exists or specific recursive helper
        if (!(await this.exists(path))) {
            await this.app.vault.createFolder(path);
        }
    }
    async getTemplateContent(path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof obsidian_1.TFile) {
            return await this.app.vault.read(file);
        }
        return null;
    }
    async writeNote(path, content) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian_1.TFile))
            throw new Error(`File not found: ${path}`);
        await this.app.vault.modify(file, content);
    }
}
exports.ObsidianNoteRepository = ObsidianNoteRepository;
