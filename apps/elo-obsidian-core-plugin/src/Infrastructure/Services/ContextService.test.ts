
import { App, TFile, MetadataCache, Vault, LinkCache, CachedMetadata, HeadingCache } from 'obsidian';
import { ContextService } from './ContextService';

// Mock TFile
class MockFile extends TFile {
    constructor(path: string, basename: string) {
        // @ts-ignore
        super(path);
        this.path = path;
        this.basename = basename;
        this.extension = 'md';
    }
}

describe('ContextManager Integration Test - Link Extraction', () => {
    let app: App;
    let contextService: ContextService;
    let mockVault: any;
    let mockMetadataCache: any;

    const sourceFile = new MockFile('folder/SourceNote.md', 'SourceNote');
    const linkedFile1 = new MockFile('folder/Present simple.md', 'Present simple');
    const linkedFile2 = new MockFile('folder/Family.md', 'Family');
    const linkedFile3 = new MockFile('folder/Hobbies.md', 'Hobbies');

    beforeEach(() => {
        // Mock Vault
        mockVault = {
            read: jest.fn(),
            getAbstractFileByPath: jest.fn((path: string) => {
                if (path === sourceFile.path) return sourceFile;
                if (path === linkedFile1.path) return linkedFile1;
                if (path === linkedFile2.path) return linkedFile2;
                if (path === linkedFile3.path) return linkedFile3;
                return null;
            }),
        };

        // Mock MetadataCache
        mockMetadataCache = {
            getFileCache: jest.fn(),
            getFirstLinkpathDest: jest.fn(),
        };

        // Mock App
        app = {
            vault: mockVault,
            metadataCache: mockMetadataCache,
        } as unknown as App;

        contextService = new ContextService(app);
    });

    it('should extract only links within the header range', async () => {
        // Setup Source File Content (Line numbers 0-indexed for simplicity in mental mapping, but simulating file structure)
        // Line 0: ## Presente simple y Familia
        // Line 1: [[Present simple#Present simple, Español-Ingles]] y [[Family]]
        // Line 2: ## Presente simple y Hobies
        // Line 3: [[Present simple#Present simple, Positiva-Negativa]] y [[Hobbies]]

        const sourceFileContent = `## Presente simple y Familia
[[Present simple#Present simple, Español-Ingles]] y [[Family]]
## Presente simple y Hobies
[[Present simple#Present simple, Positiva-Negativa]] y [[Hobbies]]`;

        mockVault.read.mockImplementation(async (file: TFile) => {
            if (file.path === sourceFile.path) return sourceFileContent;
            if (file.path === linkedFile1.path) return 'Content of Present simple'; // Simplified
            if (file.path === linkedFile2.path) return 'Content of Family';
            if (file.path === linkedFile3.path) return 'Content of Hobbies';
            return '';
        });

        // Setup Metadata Cache for Source File
        const sourceLinks: LinkCache[] = [
            {
                link: 'Present simple#Present simple, Español-Ingles',
                original: '[[Present simple#Present simple, Español-Ingles]]',
                position: { start: { line: 1, col: 0, offset: 0 }, end: { line: 1, col: 50, offset: 50 } }
            },
            {
                link: 'Family',
                original: '[[Family]]',
                position: { start: { line: 1, col: 54, offset: 54 }, end: { line: 1, col: 64, offset: 64 } }
            },
            {
                link: 'Present simple#Present simple, Positiva-Negativa',
                original: '[[Present simple#Present simple, Positiva-Negativa]]',
                position: { start: { line: 3, col: 0, offset: 0 }, end: { line: 3, col: 50, offset: 50 } }
            },
            {
                link: 'Hobbies',
                original: '[[Hobbies]]',
                position: { start: { line: 3, col: 54, offset: 54 }, end: { line: 3, col: 65, offset: 65 } }
            }
        ];

        const sourceHeadings: HeadingCache[] = [
            { heading: 'Presente simple y Familia', level: 2, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 28, offset: 28 } } },
            { heading: 'Presente simple y Hobies', level: 2, position: { start: { line: 2, col: 0, offset: 0 }, end: { line: 2, col: 27, offset: 27 } } }
        ];

        mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
            if (file.path === sourceFile.path) {
                return {
                    links: sourceLinks,
                    headings: sourceHeadings
                } as CachedMetadata;
            }
            if (file.path === linkedFile1.path) {
                return {
                    headings: [
                        { heading: 'Present simple, Español-Ingles ^ty3ufk', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } } }
                    ]
                };
            }
            if ([linkedFile2.path, linkedFile3.path].includes(file.path)) {
                return { headings: [] };
            }
            return null;
        });

        mockMetadataCache.getFirstLinkpathDest.mockImplementation((linkPath: string, sourcePath: string) => {
            if (linkPath.includes('Present simple')) return linkedFile1;
            if (linkPath.includes('Family')) return linkedFile2;
            if (linkPath.includes('Hobbies')) return linkedFile3;
            return null;
        });

        // Define the range for the first header
        // Start: Line 0 (Header itself)
        // End: Line 2 (Next Header)
        // Note: Logic in `QuizManager` or `ContextManager` might interpret range differently. 
        // Based on `ContextManager.getLinkedFileContent`:
        // if (cache.links) { linksToProcess = cache.links.filter(l => l.position.start.line >= range.start && l.position.start.line < range.end); }
        // So Links on Line 1 should be included. Links on Line 3 should feature be excluded.

        const range = { start: 0, end: 2 };

        // Act
        const result = await contextService.getLinkedFileContent(sourceFile.path, range);

        // Assert
        // Should contain linked content for "Present simple" and "Family"
        expect(result).toContain('Content of Present simple'); // From mock read
        expect(result).toContain('Content of Family');

        // Should NOT contain content for "Hobbies"
        expect(result).not.toContain('Content of Hobbies');

        // Should NOT contain content from the second link to Present Simple (which is arguably same file, but different link invocation line)
        // Wait, `getLinkedFileContent` aggregates content. If the same file is linked twice, it checks `processedFiles`.
        // The first link is `Present simple#Present simple, Español-Ingles`. 
        // The third link (in line 3, excluded) is `Present simple#Present simple, Positiva-Negativa`.
        // If our logic works, the first link is processed. The third is excluded by range filter.
        // So we are good.
    });
});
