import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianRoleRepository } from './ObsidianRoleRepository';
import { TFile, TFolder } from 'obsidian';

describe('ObsidianRoleRepository', () => {
	let adapter: ObsidianRoleRepository;
	let mockApp: any;

	beforeEach(() => {
		mockApp = {
			vault: {
				getAbstractFileByPath: vi.fn(),
				read: vi.fn(),
			},
			metadataCache: {
				getFileCache: vi.fn(),
			},
		};
		const mockSettings = {
			getGeminiRolesFolder: vi.fn().mockReturnValue('Roles'),
		};
		adapter = new ObsidianRoleRepository(mockApp, mockSettings as any);
	});

	it('should get roles from YAML note', async () => {
		const mockFile = new (TFile as any)('Roles/Role1.md');
		mockFile.basename = 'Role1';
		mockFile.extension = 'md';

		const mockFolder = new (TFolder as any)('Roles');
		mockFolder.children = [mockFile];

		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: {
				'!!prompt': 'Role1 prompt',
			},
		});

		const roles = await adapter.loadRoles();
		expect(roles.length).toBe(1);
		expect(roles[0].name).toBe('Role1');
		expect(roles[0].prompt).toBe('Role1 prompt');
	});

	it('should return empty array if Roles folder not found', async () => {
		mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
		const roles = await adapter.loadRoles();
		expect(roles).toEqual([]);
	});

	it('should return empty array if roles folder setting is missing', async () => {
		(adapter as any).settings.getGeminiRolesFolder.mockReturnValue('');
		const roles = await adapter.loadRoles();
		expect(roles).toEqual([]);
	});

	it('should ignore non-markdown files', async () => {
		const mockFile = new (TFile as any)('Roles/other.txt');
		mockFile.basename = 'other';
		mockFile.extension = 'txt';

		const mockFolder = new (TFolder as any)('Roles');
		mockFolder.children = [mockFile];

		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
		const roles = await adapter.loadRoles();
		expect(roles).toEqual([]);
	});

	it('should ignore files without prompt', async () => {
		const mockFile = new (TFile as any)('Roles/Role1.md');
		mockFile.basename = 'Role1';
		mockFile.extension = 'md';

		const mockFolder = new (TFolder as any)('Roles');
		mockFolder.children = [mockFile];

		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: {
				// No prompt
			},
		});

		const roles = await adapter.loadRoles();
		expect(roles).toEqual([]);
	});

	it('should return empty array if Roles folder is not a TFolder', async () => {
		const mockFile = new (TFile as any)('Roles');
		mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
		const roles = await adapter.loadRoles();
		expect(roles).toEqual([]);
	});
});
