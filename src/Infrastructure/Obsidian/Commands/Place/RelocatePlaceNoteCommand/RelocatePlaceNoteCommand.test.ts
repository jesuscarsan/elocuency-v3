import { App, TFile, Vault } from 'obsidian';
import { RelocatePlaceNoteCommand } from './RelocatePlaceNoteCommand';
import { getActiveMarkdownView, executeInEditMode } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { showMessage, moveFile, splitFrontmatter, parseFrontmatter, LocationPathBuilder, ensureFolderNotes } from '@/Infrastructure/Obsidian/Utils';

// Mock dependencies
jest.mock('@/Infrastructure/Obsidian/Utils/ViewMode');
jest.mock('@/Infrastructure/Obsidian/Utils', () => {
    return {
        showMessage: jest.fn(),
        moveFile: jest.fn(),
        splitFrontmatter: jest.fn(),
        parseFrontmatter: jest.fn(),
        LocationPathBuilder: jest.fn().mockImplementation(() => ({
            buildPath: jest.fn()
        })),
        ensureFolderNotes: jest.fn()
    };
});

describe('RelocatePlaceNoteCommand', () => {
    let command: RelocatePlaceNoteCommand;
    let mockApp: App;
    let mockVault: any;
    let mockView: any;
    let mockFile: any;

    beforeEach(() => {
        mockVault = {
            read: jest.fn(),
            getAbstractFileByPath: jest.fn(),
        };
        mockApp = {
            vault: mockVault,
        } as unknown as App;

        mockFile = {
            path: 'old/path/file.md',
            basename: 'file',
        } as TFile;

        mockView = {
            file: mockFile,
        };

        // Reset mocks
        jest.clearAllMocks();
        (getActiveMarkdownView as jest.Mock).mockReturnValue(mockView);
        (executeInEditMode as jest.Mock).mockImplementation(async (view, callback) => callback());
        (splitFrontmatter as jest.Mock).mockReturnValue({ frontmatterText: 'yaml' });
        (parseFrontmatter as jest.Mock).mockReturnValue({});

        command = new RelocatePlaceNoteCommand(mockApp);
    });

    it('should show message if no active file', async () => {
        (getActiveMarkdownView as jest.Mock).mockReturnValue({ file: null });
        await command.execute();
        expect(showMessage).toHaveBeenCalledWith('Abre una nota para organizar.');
    });

    it('should show message if file has no frontmatter', async () => {
        (parseFrontmatter as jest.Mock).mockReturnValue(null);
        await command.execute();
        expect(showMessage).toHaveBeenCalledWith('La nota no tiene frontmatter para organizar.');
    });

    it('should move file if path changes', async () => {
        const mockFrontmatter = {
            Municipio: 'Mun',
            Provincia: 'Prov',
            Region: 'Reg',
            País: 'País',
        };
        (parseFrontmatter as jest.Mock).mockReturnValue(mockFrontmatter);

        // Mock LocationPathBuilder instance method
        const buildPathMock = jest.fn().mockReturnValue('new/path/file.md');
        (LocationPathBuilder as unknown as jest.Mock).mockImplementation(() => ({
            buildPath: buildPathMock
        }));

        // Re-instantiate to apply mock
        command = new RelocatePlaceNoteCommand(mockApp);

        await command.execute();

        expect(buildPathMock).toHaveBeenCalled();
        expect(moveFile).toHaveBeenCalledWith(mockApp, mockFile, 'new/path/file.md');
        expect(moveFile).toHaveBeenCalledWith(mockApp, mockFile, 'new/path/file.md');
        expect(showMessage).toHaveBeenCalledWith('Nota movida a new/path/file.md');
        expect(ensureFolderNotes).toHaveBeenCalledWith(mockApp, 'new/path/file.md');
    });

    it('should show message if file is already in correct place', async () => {
        const mockFrontmatter = {
            Municipio: 'Mun',
        };
        (parseFrontmatter as jest.Mock).mockReturnValue(mockFrontmatter);

        // Mock LocationPathBuilder to return SAME path
        const buildPathMock = jest.fn().mockReturnValue('old/path/file.md');
        (LocationPathBuilder as unknown as jest.Mock).mockImplementation(() => ({
            buildPath: buildPathMock
        }));

        command = new RelocatePlaceNoteCommand(mockApp);

        await command.execute();

        expect(moveFile).not.toHaveBeenCalled();
        expect(showMessage).toHaveBeenCalledWith('La nota ya está en la ubicación correcta.');
        expect(ensureFolderNotes).toHaveBeenCalledWith(mockApp, 'old/path/file.md');
    });
});
