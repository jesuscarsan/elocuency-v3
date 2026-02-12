"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianEditorAdapter = void 0;
class ObsidianEditorAdapter {
    constructor(view) {
        this.view = view;
    }
    get editor() {
        return this.view.editor;
    }
    getSelectedText() {
        return this.editor.getSelection();
    }
    replaceSelection(text) {
        this.editor.replaceSelection(text);
    }
    getCursorPosition() {
        return this.editor.getCursor();
    }
    setCursorPosition(line, ch) {
        this.editor.setCursor({ line, ch });
    }
    getValue() {
        return this.editor.getValue();
    }
    setValue(content) {
        this.editor.setValue(content);
    }
    insertAtCursor(text) {
        const cursor = this.getCursorPosition();
        this.editor.replaceRange(text, cursor);
    }
    getNoteTitle() {
        return this.view.file?.basename || '';
    }
    getNotePath() {
        return this.view.file?.path || '';
    }
}
exports.ObsidianEditorAdapter = ObsidianEditorAdapter;
