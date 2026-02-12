import { MarkdownView } from 'obsidian';
import { EditorPort } from '../../../Domain/Ports/EditorPort';
export declare class ObsidianEditorAdapter implements EditorPort {
    private readonly view;
    constructor(view: MarkdownView);
    private get editor();
    getSelectedText(): string;
    replaceSelection(text: string): void;
    getCursorPosition(): {
        line: number;
        ch: number;
    };
    setCursorPosition(line: number, ch: number): void;
    getValue(): string;
    setValue(content: string): void;
    insertAtCursor(text: string): void;
    getNoteTitle(): string;
    getNotePath(): string;
}
