import { App, TFile, MarkdownView } from 'obsidian';
import { AddImagesCommand } from './AddImagesCommand';
import { TestContext } from '../../Testing/TestContext';
import { ImageSearchPort } from 'src/Domain/Ports/ImageSearchPort';
import { FrontmatterKeys } from 'src/Domain/Constants/FrontmatterRegistry';

describe('AddImagesCommand', () => {
    let context: TestContext;
    let command: AddImagesCommand;
    let mockImageSearch: jest.Mocked<ImageSearchPort>;

    beforeEach(() => {
        context = new TestContext();

        mockImageSearch = {
            searchImages: jest.fn().mockResolvedValue([])
        };

        command = new AddImagesCommand(
            context.app as any,
            mockImageSearch
        );
    });

    test('should add found images to frontmatter', async () => {
        // Setup
        await context.createFolder('Notes');
        const file = await context.createFile('Notes/My Note.md', '---\ntags: [note]\n---\n# Content');

        // Setup View
        context.app.workspace.getLeaf(true);
        const leaf = (context.app.workspace as any).activeLeaf;
        leaf.view = new MarkdownView(file as any);

        // Mock Search Result
        const images = ['http://img1.jpg', 'http://img2.jpg'];
        mockImageSearch.searchImages.mockResolvedValue(images);

        await command.execute();

        const updatedContent = await context.app.vault.read(file);
        // "Imagenes urls" key should be present
        expect(updatedContent).toContain(FrontmatterKeys.ImagenesUrls);
        expect(updatedContent).toContain('http://img1.jpg');
        expect(updatedContent).toContain('http://img2.jpg');
    });

    test('should not add images if already present', async () => {
        // Setup
        await context.createFolder('Notes');
        const file = await context.createFile('Notes/My Note.md', `---\n"!!prompt": x\n${FrontmatterKeys.ImagenesUrls}: ["existing.jpg"]\n---\n# Content`);

        // Setup View
        context.app.workspace.getLeaf(true);
        const leaf = (context.app.workspace as any).activeLeaf;
        leaf.view = new MarkdownView(file as any);

        await command.execute();

        // Search should NOT be called
        expect(mockImageSearch.searchImages).not.toHaveBeenCalled();

        const updatedContent = await context.app.vault.read(file);
        expect(updatedContent).toContain('existing.jpg');
    });
});
