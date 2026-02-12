import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianContextAdapter } from './ObsidianContextAdapter';
import { TFile } from 'obsidian';

vi.mock('obsidian', () => ({
	TFile: class {},
}));

describe('ObsidianContextAdapter', () => {
	let adapter: ObsidianContextAdapter;
	let mockApp: any;

	beforeEach(() => {
		mockApp = {
			metadataCache: {
				getFileCache: vi.fn(),
				getFirstLinkpathDest: vi.fn(),
			},
			vault: {
				getAbstractFileByPath: vi.fn(),
				read: vi.fn(),
			},
			workspace: {
				getActiveFile: vi.fn(),
			},
		};
		adapter = new ObsidianContextAdapter(mockApp);
	});

	it('should clean context by removing block IDs', () => {
		const text = 'Line with block id ^exiezi\nNormal line';
		expect(adapter.cleanContext(text)).toBe('Line with block id\nNormal line');
	});

	it('should get section content', async () => {
		const mockFile = Object.assign(new TFile(), { path: 'test.md' });
		mockApp.metadataCache.getFileCache.mockReturnValue({
			headings: [
				{ heading: 'H1', level: 1, position: { start: { line: 0 } } },
				{ heading: 'H2', level: 2, position: { start: { line: 2 } } },
				{ heading: 'Next H1', level: 1, position: { start: { line: 5 } } },
			],
		});
		mockApp.vault.read.mockResolvedValue('line 0\nline 1\nline 2\nline 3\nline 4\nline 5\nline 6');

		const content = await adapter.getSectionContent(mockFile, 'H1');
		expect(content).toContain('line 0');
		expect(content).toContain('line 4');
		expect(content).not.toContain('line 5');
	});

	it('should return empty string for section if heading not found', async () => {
		const mockFile = Object.assign(new TFile(), { path: 'test.md' } as any);
		mockApp.metadataCache.getFileCache.mockReturnValue({ headings: [] });
		expect(await adapter.getSectionContent(mockFile, 'Missing')).toBe('');
	});

	it('should return vocabulary content', async () => {
		const mockFile = Object.assign(new TFile(), { path: 'vocab.md', extension: 'md' });
		mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);
		mockApp.vault.read.mockResolvedValue('Definition');

		const result = await adapter.getVocabularyContent(new Set(['[[word]]']));
		expect(result).toContain('Definition');
	});

	it('should return linked file content with anchors', async () => {
		const sourceFile = Object.assign(new TFile(), { path: 'source.md' });
		mockApp.vault.getAbstractFileByPath.mockReturnValue(sourceFile);
		mockApp.metadataCache.getFileCache.mockImplementation((file: any) => {
			if (file.path === 'source.md') {
				return { links: [{ link: 'linked.md#Header', position: { start: { line: 1 } } }] };
			}
			if (file.path === 'linked.md') {
				return { headings: [{ heading: 'Header', level: 1, position: { start: { line: 0 } } }] };
			}
			return null;
		});
		const linkedFile = Object.assign(new TFile(), {
			path: 'linked.md',
			extension: 'md',
			basename: 'linked',
		});
		mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(linkedFile);
		mockApp.vault.read.mockResolvedValue('Section Content');

		const result = await adapter.getLinkedFileContent('source.md');
		expect(result).toContain('linked > Header');
		expect(result).toContain('Section Content');
	});

	it('should handle range in linked file content', async () => {
		const sourceFile = Object.assign(new TFile(), { path: 'source.md' });
		mockApp.vault.getAbstractFileByPath.mockReturnValue(sourceFile);
		mockApp.metadataCache.getFileCache.mockReturnValue({
			links: [
				{ link: 'in.md', position: { start: { line: 5 } } },
				{ link: 'out.md', position: { start: { line: 15 } } },
			],
		});
		const linkedFile = Object.assign(new TFile(), {
			path: 'in.md',
			extension: 'md',
			basename: 'in',
		});
		mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(linkedFile);
		mockApp.vault.read.mockResolvedValue('In Content');

		const result = await adapter.getLinkedFileContent('source.md', { start: 0, end: 10 });
		expect(result).toContain('In Content');
		expect(result).not.toContain('out.md');
	});

	it('should fallback to fuzzy match in getVocabularyContent', async () => {
		mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(null);
		const mockFile = Object.assign(new TFile(), {
			path: 'fuzzy.md',
			extension: 'md',
			basename: 'word',
		});
		mockApp.vault.getFiles = vi.fn().mockReturnValue([mockFile]);
		mockApp.vault.read.mockResolvedValue('Fuzzy Content');

		const result = await adapter.getVocabularyContent(new Set(['word']));
		expect(result).toContain('Fuzzy Content');
	});

	it('should handle block anchors in linked file content', async () => {
		const sourceFile = Object.assign(new TFile(), { path: 'source.md' });
		mockApp.vault.getAbstractFileByPath.mockReturnValue(sourceFile);
		mockApp.metadataCache.getFileCache.mockReturnValue({
			links: [{ link: 'linked.md^block1', position: { start: { line: 1 } } }],
		});
		const linkedFile = Object.assign(new TFile(), {
			path: 'linked.md',
			extension: 'md',
			basename: 'linked',
		});
		mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(linkedFile);
		mockApp.vault.read.mockResolvedValue('Block Content');

		const result = await adapter.getLinkedFileContent('source.md');
		expect(result).toContain('Block Content');
		expect(result).not.toContain('>'); // Should NOT have header separator
	});
});
