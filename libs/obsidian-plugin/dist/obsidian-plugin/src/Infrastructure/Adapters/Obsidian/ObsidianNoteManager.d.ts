import { App } from 'obsidian';
import { NoteManagerPort, NoteItem, NoteMetadata } from '@elo/core';
import { HeaderMetadata } from '@elo/core';
export declare class ObsidianNoteManager implements NoteManagerPort {
    private app;
    constructor(app: App);
    getActiveNote(): NoteItem | null;
    getActiveNoteContent(): Promise<string | null>;
    readNote(path: string): Promise<string>;
    getNoteMetadata(path: string): Promise<NoteMetadata>;
    renameFile(fileItem: NoteItem | string, newPath: string): Promise<void>;
    ensureFolderExists(path: string): Promise<void>;
    normalizePath(path: string): string;
    getNoteHeadings(path: string): Promise<any[]>;
    updateBlockMetadata(path: string, blockId: string, metadata: HeaderMetadata): Promise<void>;
    private mapToNoteItem;
}
