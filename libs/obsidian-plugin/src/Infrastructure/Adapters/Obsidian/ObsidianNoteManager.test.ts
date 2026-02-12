import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianNoteManager } from './ObsidianNoteManager';
import { TFile } from 'obsidian';

describe('ObsidianNoteManager', () => {
	let adapter: ObsidianNoteManager;
	let mockApp: any;

	beforeEach(() => {
		mockApp = {
			vault: {
				getAbstractFileByPath: vi.fn(),
				read: vi.fn(),
				rename: vi.fn(),
				createFolder: vi.fn(),
			},
			workspace: {
				getActiveFile: vi.fn(),
			},
			metadataCache: {
				getFileCache: vi.fn(),
			},
			fileManager: {
				renameFile: vi.fn(),
			},
		};
		adapter = new ObsidianNoteManager(mockApp);
	});

	it('should get active note content', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.workspace.getActiveFile.mockReturnValue(mockFile);
		mockApp.vault.read.mockResolvedValue('content');

		const result = await adapter.getActiveNoteContent();
		expect(result).toBe('content');
	});

	it('should return empty string if no active file', async () => {
		mockApp.workspace.getActiveFile.mockReturnValue(null);
		const result = await adapter.getActiveNoteContent();
		expect(result).toBe('');
	});

	it('should read note by path', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
		mockApp.vault.read.mockResolvedValue('content');

		const result = await adapter.readNote('test.md');
		expect(result).toBe('content');
	});

	it('should return empty string if readNote file not found', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		const result = await adapter.readNote('test.md');
		expect(result).toBe('');
	});

	it('should rename file', async () => {
		const mockFile = new (TFile as any)('old.md');
		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);

		await adapter.renameFile('old.md', 'new.md');
		expect(mockApp.fileManager.renameFile).toHaveBeenCalledWith(mockFile, 'new.md');
	});

	it('should do nothing in renameFile if file not found', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		await adapter.renameFile('old.md', 'new.md');
		expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
	});

	it('should get note headings', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
		mockApp.metadataCache.getFileCache.mockReturnValue({ headings: [{ heading: 'H1' }] });

		const headings = await adapter.getNoteHeadings('test.md');
		expect(headings[0].heading).toBe('H1');
	});

	it('should return empty headings if cache missing', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
		mockApp.metadataCache.getFileCache.mockReturnValue(null);
		const headings = await adapter.getNoteHeadings('test.md');
		expect(headings).toEqual([]);
	});

	it('should ensure folder exists', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		await adapter.ensureFolderExists('folder/subfolder/file.md');
		expect(mockApp.vault.createFolder).toHaveBeenCalledWith('folder');
		expect(mockApp.vault.createFolder).toHaveBeenCalledWith('folder/subfolder');
	});

	it('should skip createFolder if it already exists', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue({});
		await adapter.ensureFolderExists('folder');
		expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
	});

	it('should get active note item', () => {
		const mockFile = new (TFile as any)('test.md');
		mockFile.basename = 'test';
		mockFile.extension = 'md';
		mockApp.workspace.getActiveFile.mockReturnValue(mockFile);

		const result = adapter.getActiveNote();
		expect(result).not.toBeNull();
		expect(result?.name).toBe('test.md');
		expect(result?.basename).toBe('test');
	});

	it('should return null if no active note', () => {
		mockApp.workspace.getActiveFile.mockReturnValue(null);
		const result = adapter.getActiveNote();
		expect(result).toBeNull();
	});

	it('should get note metadata', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
	});

	it('should normalize path', () => {
		const path = adapter.normalizePath('folder\\file.md');
		expect(path).toBe('folder/file.md');
	});

	it('should return empty metadata if file not found for metadata', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		const result = await adapter.getNoteMetadata('missing.md');
		expect(result).toEqual({});
	});

	it('should return empty headings if file not found', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		const result = await adapter.getNoteHeadings('missing.md');
		expect(result).toEqual([]);
	});

	it('should do nothing in updateBlockMetadata if file not found', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		await adapter.updateBlockMetadata('missing.md', 'block-id', { attempts: 0 });
	});

	it('should do nothing in renameFile if file not found', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		await adapter.renameFile('missing.md', 'new.md');
		expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
	});
});
