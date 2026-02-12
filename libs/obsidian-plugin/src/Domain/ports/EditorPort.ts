export interface EditorPort {
    getSelectedText(): string;
    replaceSelection(text: string): void;
    getCursorPosition(): { line: number; ch: number };
    setCursorPosition(line: number, ch: number): void;
    getValue(): string;
    setValue(content: string): void;
    insertAtCursor(text: string): void;
    getNoteTitle(): string;
    getNotePath(): string;
}
