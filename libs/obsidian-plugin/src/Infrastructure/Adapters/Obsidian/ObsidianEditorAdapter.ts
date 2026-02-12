
import { MarkdownView, Editor, EditorPosition } from 'obsidian';
import { EditorPort } from '../../../Domain/Ports/EditorPort';

export class ObsidianEditorAdapter implements EditorPort {
    constructor(private readonly view: MarkdownView) { }

    private get editor(): Editor {
        return this.view.editor;
    }

    getSelectedText(): string {
        return this.editor.getSelection();
    }

    replaceSelection(text: string): void {
        this.editor.replaceSelection(text);
    }

    getCursorPosition(): { line: number; ch: number } {
        return this.editor.getCursor();
    }

    setCursorPosition(line: number, ch: number): void {
        this.editor.setCursor({ line, ch } as EditorPosition);
    }

    getValue(): string {
        return this.editor.getValue();
    }

    setValue(content: string): void {
        this.editor.setValue(content);
    }

    insertAtCursor(text: string): void {
        const cursor = this.getCursorPosition();
        this.editor.replaceRange(text, cursor as EditorPosition);
    }

    getNoteTitle(): string {
        return this.view.file?.basename || '';
    }

    getNotePath(): string {
        return this.view.file?.path || '';
    }
}
