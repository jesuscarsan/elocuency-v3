import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianEditorAdapter } from './ObsidianEditorAdapter';

describe('ObsidianEditorAdapter', () => {
	let adapter: ObsidianEditorAdapter;
	let mockEditor: any;
	let mockView: any;

	beforeEach(() => {
		mockEditor = {
			getValue: vi.fn(),
			setValue: vi.fn(),
			getSelection: vi.fn(),
			replaceSelection: vi.fn(),
			getCursor: vi.fn(),
			setCursor: vi.fn(),
			replaceRange: vi.fn(),
		};
		mockView = {
			editor: mockEditor,
			file: { basename: 'Test Note', path: 'folder/Test Note.md' },
		};
		adapter = new ObsidianEditorAdapter(mockView);
	});

	it('should get value from editor', () => {
		mockEditor.getValue.mockReturnValue('content');
		expect(adapter.getValue()).toBe('content');
	});

	it('should set value in editor', () => {
		adapter.setValue('new content');
		expect(mockEditor.setValue).toHaveBeenCalledWith('new content');
	});

	it('should get note title from view', () => {
		expect(adapter.getNoteTitle()).toBe('Test Note');
	});

	it('should get selected text', () => {
		mockEditor.getSelection.mockReturnValue('selected');
		expect(adapter.getSelectedText()).toBe('selected');
	});

	it('should replace selection', () => {
		adapter.replaceSelection('replacement');
		expect(mockEditor.replaceSelection).toHaveBeenCalledWith('replacement');
	});

	it('should get cursor position', () => {
		mockEditor.getCursor.mockReturnValue({ line: 1, ch: 2 });
		expect(adapter.getCursorPosition()).toEqual({ line: 1, ch: 2 });
	});

	it('should set cursor position', () => {
		adapter.setCursorPosition(3, 4);
		expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 3, ch: 4 });
	});

	it('should insert at cursor', () => {
		mockEditor.getCursor.mockReturnValue({ line: 1, ch: 1 });
		adapter.insertAtCursor('inserted');
		expect(mockEditor.replaceRange).toHaveBeenCalledWith('inserted', { line: 1, ch: 1 });
	});

	it('should get note path from view', () => {
		expect(adapter.getNotePath()).toBe('folder/Test Note.md');
	});

	it('should return empty string for title if file is null', () => {
		mockView.file = null;
		expect(adapter.getNoteTitle()).toBe('');
	});

	it('should return empty string for path if file is null', () => {
		mockView.file = null;
		expect(adapter.getNotePath()).toBe('');
	});
});
