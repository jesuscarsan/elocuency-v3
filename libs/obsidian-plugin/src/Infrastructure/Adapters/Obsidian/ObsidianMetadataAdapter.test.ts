import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianMetadataAdapter } from './ObsidianMetadataAdapter';
import { TFile } from 'obsidian';

describe('ObsidianMetadataAdapter', () => {
	let adapter: ObsidianMetadataAdapter;
	let mockApp: any;

	beforeEach(() => {
		mockApp = {
			vault: {
				getAbstractFileByPath: vi.fn(),
				adapter: {
					exists: vi.fn(),
					read: vi.fn(),
					write: vi.fn(),
					rename: vi.fn(),
				},
			},
			metadataCache: {
				getFileCache: vi.fn(),
			},
		};
		adapter = new ObsidianMetadataAdapter(mockApp);
	});

	it('should update block metadata', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.read.mockResolvedValue('{"id1": {}}');

		await adapter.updateBlockMetadata(mockFile, 'id1', { attempts: 1 });
		expect(mockApp.vault.adapter.write).toHaveBeenCalled();
	});

	it('should handle parse error in updateBlockMetadata', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.read.mockResolvedValue('invalid');
		await adapter.updateBlockMetadata(mockFile, 'id1', { attempts: 1 });
		expect(mockApp.vault.adapter.write).toHaveBeenCalled();
	});

	it('should update block metadata using string path', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.read.mockResolvedValue('{}');

		await adapter.updateBlockMetadata('test.md', 'id1', { attempts: 1 });
		expect(mockApp.vault.adapter.write).toHaveBeenCalled();
	});

	it('should not update block metadata if string path does not resolve to TFile', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		await adapter.updateBlockMetadata('missing.md', 'id1', { attempts: 1 });
		expect(mockApp.vault.adapter.write).not.toHaveBeenCalled();
	});

	it('should get file metadata from sidecar JSON', async () => {
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.read.mockResolvedValue('{"id1": {"k": "v"}}');

		const result = await adapter.getFileMetadata('test.md');
		expect(result.id1.k).toBe('v');
	});

	it('should handle parse error in getFileMetadata', async () => {
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.read.mockResolvedValue('invalid');
		const result = await adapter.getFileMetadata('test.md');
		expect(result).toEqual({});
	});

	it('should sync metadata for multiple blocks', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.read.mockResolvedValue('{}');

		await adapter.syncMetadata(mockFile, ['id1', 'id2']);
		expect(mockApp.vault.adapter.write).toHaveBeenCalled();
	});

	it('should handle parse error in syncMetadata', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.read.mockResolvedValue('invalid');
		await adapter.syncMetadata(mockFile, ['id1']);
		expect(mockApp.vault.adapter.write).toHaveBeenCalled();
	});

	it('should handle rename of sidecar JSON', async () => {
		const mockFile = new (TFile as any)('new.md');
		mockApp.vault.adapter.exists.mockResolvedValue(true);

		await adapter.handleRename(mockFile, 'old.md');
		expect(mockApp.vault.adapter.rename).toHaveBeenCalled();
	});

	it('should handle rename error', async () => {
		const mockFile = new (TFile as any)('new.md');
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		mockApp.vault.adapter.rename.mockRejectedValue(new Error('fail'));
		await adapter.handleRename(mockFile, 'old.md');
		// Should not crash
	});

	it('should avoid rename if old JSON does not exist', async () => {
		const mockFile = new (TFile as any)('new.md');
		mockApp.vault.adapter.exists.mockResolvedValue(false);
		await adapter.handleRename(mockFile, 'old.md');
		expect(mockApp.vault.adapter.rename).not.toHaveBeenCalled();
	});

	it('should do nothing in handleRename if file is not markdown', async () => {
		const mockFile = new (TFile as any)('image.png');
		mockFile.extension = 'png';
		await adapter.handleRename(mockFile, 'old.png');
		expect(mockApp.vault.adapter.rename).not.toHaveBeenCalled();
	});

	it('should ensure block id', () => {
		const header = { heading: 'Title ^id123' };
		expect(adapter.ensureBlockId(header as any)).toBe('id123');

		const noId = { heading: 'Title' };
		expect(adapter.ensureBlockId(noId as any)).toHaveLength(6);
	});

	it('should return empty metadata if sidecar missing', async () => {
		mockApp.vault.adapter.exists.mockResolvedValue(false);
		const result = await adapter.getFileMetadata('test.md');
		expect(result).toEqual({});
	});

	it('should merge missing keys in syncMetadata', async () => {
		const mockFile = new (TFile as any)('test.md');
		mockApp.vault.adapter.exists.mockResolvedValue(true);
		// Existing data has id1 but missing some keys
		mockApp.vault.adapter.read.mockResolvedValue('{"id1": {"attempts": 5}}');

		await adapter.syncMetadata(mockFile, ['id1']);

		expect(mockApp.vault.adapter.write).toHaveBeenCalled();
		const writeCall = (mockApp.vault.adapter.write as any).mock.calls[0];
		const writtenData = JSON.parse(writeCall[1]);
		expect(writtenData.id1.attempts).toBe(5);
		// Default values should be merged
		expect(writtenData.id1.score).toBeDefined();
	});
});
