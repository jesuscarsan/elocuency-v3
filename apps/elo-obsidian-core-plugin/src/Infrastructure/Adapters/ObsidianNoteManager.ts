import { App, TFile, normalizePath } from 'obsidian';
import { NoteManagerPort, NoteItem, NoteMetadata } from "@elo/core";
import { MetadataService } from '../Services/MetadataService';
import { HeaderMetadata } from "@elo/core";

export class ObsidianNoteManager implements NoteManagerPort {
    constructor(private app: App) { }

    getActiveNote(): NoteItem | null {
        const file = this.app.workspace.getActiveFile();
        if (!file) return null;
        return this.mapToNoteItem(file);
    }

    async getActiveNoteContent(): Promise<string | null> {
        const file = this.app.workspace.getActiveFile();
        if (!file) return null;
        return await this.app.vault.read(file);
    }

    async readNote(path: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        throw new Error(`File not found: ${path}`);
    }

    async getNoteMetadata(path: string): Promise<NoteMetadata> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            const metaService = new MetadataService(this.app);
            return await metaService.getFileMetadata(file);
        }
        return {};
    }

    async renameFile(fileItem: NoteItem, newPath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(fileItem.path);
        if (file instanceof TFile) {
            await this.app.fileManager.renameFile(file, newPath);
        } else {
            throw new Error(`File not found to rename: ${fileItem.path}`);
        }
    }

    async ensureFolderExists(path: string): Promise<void> {
        const folders = path.split('/').slice(0, -1);
        if (folders.length === 0) return;

        let currentPath = '';
        for (const folder of folders) {
            currentPath = currentPath === '' ? folder : `${currentPath}/${folder}`;
            const normalized = normalizePath(currentPath);
            const exists = this.app.vault.getAbstractFileByPath(normalized);
            if (!exists) {
                await this.app.vault.createFolder(normalized);
            }
        }
    }

    normalizePath(path: string): string {
        return normalizePath(path);
    }

    async getNoteHeadings(path: string): Promise<any[]> { // using any[] or specific type mapping
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            const cache = this.app.metadataCache.getFileCache(file);
            return cache?.headings || [];
        }
        return [];
    }

    async updateBlockMetadata(path: string, blockId: string, metadata: HeaderMetadata): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            const metaService = new MetadataService(this.app);
            await metaService.updateBlockMetadata(file, blockId, metadata);
        }
    }

    private mapToNoteItem(file: TFile): NoteItem {
        return {
            path: file.path,
            name: file.name,
            extension: file.extension,
            basename: file.basename
        };
    }
}
