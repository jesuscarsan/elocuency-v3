import {
	isFolderMatch,
	ensureFolderExists,
	pathExists,
	getTemplatesFolder,
	moveFile,
	ensureFolderNotes,
} from './ObsidianFileSystemAdapter';
import { App, TFile, TFolder } from 'obsidian';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('Vault Utils', () => {
	let mockApp: App;

	beforeEach(() => {
		mockApp = {
			vault: {
				getAbstractFileByPath: vi.fn(),
				createFolder: vi.fn(),
				create: vi.fn(),
				adapter: {
					exists: vi.fn(),
					stat: vi.fn(),
				},
			},
			fileManager: {
				renameFile: vi.fn(),
			},
		} as any;
	});

	describe('isFolderMatch', () => {
		it('should match exact folders', () => {
			expect(isFolderMatch('A/B', 'A/B')).toBe(true);
			expect(isFolderMatch('A/B', 'A/C')).toBe(false);
		});

		it('should handle ** wildcard (match all subfolders)', () => {
			expect(isFolderMatch('A/B/C', 'A/**')).toBe(true);
			expect(isFolderMatch('A/B', 'A/**')).toBe(true);
			expect(isFolderMatch('X/Y', 'A/**')).toBe(false);
		});

		it('should handle * wildcard (match single depth)', () => {
			expect(isFolderMatch('A/B', 'A/*')).toBe(true);
			expect(isFolderMatch('A/B/C', 'A/*')).toBe(false);
		});

		it('should return false if folder is shorter than target', () => {
			expect(isFolderMatch('A', 'A/B')).toBe(false);
		});

		it('should be case sensitive (standard Obsidian behavior)', () => {
			expect(isFolderMatch('personas', 'Personas')).toBe(false);
		});
	});

	describe('ensureFolderExists', () => {
		it('should do nothing if parent folder path is empty', async () => {
			await ensureFolderExists(mockApp, 'file.md');
			expect(mockApp.vault.getAbstractFileByPath).not.toHaveBeenCalled();
		});

		it('should create folder recursively if it does not exist', async () => {
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			(mockApp.vault.adapter.exists as any).mockResolvedValue(false);

			await ensureFolderExists(mockApp, 'folder/subfolder/file.md');

			expect(mockApp.vault.createFolder).toHaveBeenCalledWith('folder');
			expect(mockApp.vault.createFolder).toHaveBeenCalledWith('folder/subfolder');
		});

		it('should not create folder if it already exists', async () => {
			const mockFolder = new (TFolder as any)('folder');
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(mockFolder);

			await ensureFolderExists(mockApp, 'folder/file.md');

			expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
		});

		it('should throw if path exists as a file', async () => {
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			(mockApp.vault.adapter.exists as any).mockResolvedValue(true);
			(mockApp.vault.adapter.stat as any).mockResolvedValue({ type: 'file' });

			await expect(ensureFolderExists(mockApp, 'folder/file.md')).rejects.toThrow(
				'Cannot create folder "folder" because a file already exists with that name.',
			);
		});

		it('should handle folder creation error', async () => {
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			(mockApp.vault.adapter.exists as any).mockResolvedValue(false);
			(mockApp.vault.createFolder as any).mockRejectedValue(new Error('Permission denied'));

			await expect(ensureFolderExists(mockApp, 'folder/file.md')).rejects.toThrow(
				'Permission denied',
			);
		});

		// Ignored error case
		it('should ignore folder exists error (race condition)', async () => {
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			(mockApp.vault.adapter.exists as any).mockReturnValueOnce(false);
			(mockApp.vault.createFolder as any).mockRejectedValue(new Error('Folder already exists'));

			await ensureFolderExists(mockApp, 'folder/file.md');
			expect(mockApp.vault.createFolder).toHaveBeenCalled();
		});
	});

	describe('pathExists', () => {
		it('should return true if file exists in cache', async () => {
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(
				new (TFile as any)('path/to/file.md'),
			);
			const result = await pathExists(mockApp, 'path/to/file.md');
			expect(result).toBe(true);
		});

		it('should check adapter if file not in cache', async () => {
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			(mockApp.vault.adapter.exists as any).mockResolvedValue(true);
			const result = await pathExists(mockApp, 'path/to/file.md');
			expect(result).toBe(true);
		});
	});

	describe('getTemplatesFolder', () => {
		it('should return null if templates plugin not enabled', () => {
			(mockApp as any).internalPlugins = {
				getPluginById: vi.fn().mockReturnValue(null),
			};
			expect(getTemplatesFolder(mockApp)).toBeNull();
		});

		it('should return folder from templates plugin options', () => {
			(mockApp as any).internalPlugins = {
				getPluginById: vi.fn().mockReturnValue({
					instance: {
						options: {
							folder: 'Templates',
						},
					},
				}),
			};
			expect(getTemplatesFolder(mockApp)).toBe('Templates');
		});

		it('should return null if options exist but no folder defined', () => {
			(mockApp as any).internalPlugins = {
				getPluginById: vi.fn().mockReturnValue({
					instance: {
						options: {},
					},
				}),
			};
			expect(getTemplatesFolder(mockApp)).toBeNull();
		});

		it('should return null if plugin found but no options', () => {
			(mockApp as any).internalPlugins = {
				getPluginById: vi.fn().mockReturnValue({
					instance: {},
				}),
			};
			expect(getTemplatesFolder(mockApp)).toBeNull();
		});
	});

	describe('moveFile', () => {
		it('should do nothing if target path same as current', async () => {
			const file = new (TFile as any)('same/path.md');
			(file as any).path = 'same/path.md';
			await moveFile(mockApp, file, 'same/path.md');
			expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
		});

		it('should throw if target file exists', async () => {
			const file = new (TFile as any)('old/path.md');
			(file as any).path = 'old/path.md';
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(
				new (TFile as any)('new/path.md'),
			);

			await expect(moveFile(mockApp, file, 'new/path.md')).rejects.toThrow(
				'Target file already exists',
			);
		});

		it('should rename file if target clear', async () => {
			const file = new (TFile as any)('old/path.md');
			(file as any).path = 'old/path.md';
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			// ensureFolderExists mocks
			(mockApp.vault.adapter.exists as any).mockResolvedValue(true);

			await moveFile(mockApp, file, 'new/path.md');
			expect(mockApp.fileManager.renameFile).toHaveBeenCalledWith(file, 'new/path.md');
		});
	});

	describe('ensureFolderNotes', () => {
		it('should create missing folder notes', async () => {
			// Mock path checks
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			(mockApp.vault.adapter.exists as any).mockResolvedValue(false);

			await ensureFolderNotes(mockApp, 'A/B/file.md');

			// Should try to create note for A and A/B
			expect(mockApp.vault.create).toHaveBeenCalledWith('A/A.md', '');
			expect(mockApp.vault.create).toHaveBeenCalledWith('A/B/B.md', '');
		});

		it('should handle folder note creation error', async () => {
			(mockApp.vault.getAbstractFileByPath as any).mockReturnValue(null);
			(mockApp.vault.adapter.exists as any).mockResolvedValue(false);
			(mockApp.vault.create as any).mockRejectedValue(new Error('Fail'));

			// Should not throw, just log
			await ensureFolderNotes(mockApp, 'A/B/file.md');
			expect(mockApp.vault.create).toHaveBeenCalled();
		});
	});
});
