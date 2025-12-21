import { App, TFile, MarkdownView } from 'obsidian';
import { EnhanceByAiCommand } from './EnhanceByAiCommand';
import { TestContext } from '../../Testing/TestContext';
import { LlmPort } from 'src/Domain/Ports/LlmPort';
import { FrontmatterKeys } from 'src/Domain/Constants/FrontmatterRegistry';

describe('EnhanceByAiCommand', () => {
    let context: TestContext;
    let command: EnhanceByAiCommand;
    let mockLlm: jest.Mocked<LlmPort>;
    let settings: any;

    beforeEach(() => {
        context = new TestContext();

        mockLlm = {
            requestEnrichment: jest.fn(),
            requestStreamBrief: jest.fn(),
            request: jest.fn(),
            requestJson: jest.fn()
        } as unknown as jest.Mocked<LlmPort>;

        settings = {
            templateOptions: [
                { targetFolder: 'Notes/**', templateFilename: 'Standard Template' }
            ]
        };

        // Mock internal plugins for templates folder
        (context.app as any).internalPlugins = {
            getPluginById: jest.fn((id: string) => {
                if (id === 'templates') {
                    return {
                        instance: {
                            options: {
                                folder: 'Templates'
                            }
                        }
                    };
                }
                return null;
            })
        };

        command = new EnhanceByAiCommand(
            context.app as any,
            settings,
            mockLlm
        );
    });

    test('should enhance note using frontmatter prompt', async () => {
        // Setup
        await context.createFolder('Notes');
        const file = await context.createFile('Notes/My Note.md', '---\n"!!prompt": Custom Prompt\n---\n# Content');

        // Setup active leaf
        context.app.workspace.getLeaf(true);
        // Note: GenericFuzzySuggestModal mock resolved first item in previous tests, but here we don't use modal explicitly unless required.
        // EnhanceByAiCommand only uses modal if... wait, it doesn't use modal. ApplyTemplateCommand does.
        // EnhanceByAiCommand uses getActiveViewOfType.

        // We need to set the view's file and editor content
        const leaf = (context.app.workspace as any).activeLeaf;
        leaf.view = new MarkdownView(file as any);
        // Note: new MarkdownView(file) in mock already creates Editor with file content.

        // Mock LLM response
        mockLlm.requestEnrichment.mockResolvedValue({
            frontmatter: { summary: 'New Summary' },
            body: 'Enhanced Content'
        });

        await command.execute();

        const updatedContent = await context.app.vault.read(file);

        // Verify Content
        expect(updatedContent).toContain('summary: New Summary');
        expect(updatedContent).toContain('Enhanced Content');
        expect(updatedContent).toContain('# Content'); // It appends body in join?
        // EnhanceByAiCommand logic: 
        // const newContent = [frontmatterBlock, split.body, response.body].filter(Boolean).join('\n\n');
        // split.body is "# Content" (original body).
        // response.body is "Enhanced Content".
        // formatting: frontmatter + body + response.
    });

    test('should fallback to template prompt if frontmatter prompt missing', async () => {
        // Setup Template
        await context.createFolder('Templates');
        await context.createFile('Templates/Standard Template.md', '---\n"!!prompt": Template Prompt\n---\n# Template');

        await context.createFolder('Notes');
        const file = await context.createFile('Notes/My Note.md', '# Just Content');

        context.app.workspace.getLeaf(true);
        const leaf = (context.app.workspace as any).activeLeaf;
        leaf.view = new MarkdownView(file as any);

        // Mock LLM
        mockLlm.requestEnrichment.mockResolvedValue({
            frontmatter: { tags: ['enhanced'] },
            body: 'Template Enhanced'
        });

        await command.execute();

        // Verify LLM called with Template Prompt
        const callArgs = mockLlm.requestEnrichment.mock.calls[0][0];
        expect(callArgs.prompt).toContain('Template Prompt');

        const updatedContent = await context.app.vault.read(file);
        expect(updatedContent).toContain('Template Enhanced');
    });
});
