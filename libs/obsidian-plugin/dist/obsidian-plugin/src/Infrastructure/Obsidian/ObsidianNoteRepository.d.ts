import { App } from "obsidian";
import { NoteMetadata, NoteRepository } from "../../Domain/ports/NoteRepository";
export declare class ObsidianNoteRepository implements NoteRepository {
    private app;
    constructor(app: App);
    getNoteMetadata(path: string): Promise<NoteMetadata | null>;
    readNote(path: string): Promise<string>;
    appendContent(path: string, content: string): Promise<void>;
    updateFrontmatter(path: string, callback: (frontmatter: any) => void): Promise<void>;
    createNote(path: string, content: string): Promise<NoteMetadata>;
    exists(path: string): Promise<boolean>;
    createFolder(path: string): Promise<void>;
    getTemplateContent(path: string): Promise<string | null>;
}
