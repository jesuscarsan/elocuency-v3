import { App, TFile } from 'obsidian';
import { EnhanceNoteCommand } from 'src/Application/Commands/EnhanceNoteCommand';
import { TestContext } from '../../TestContext';
import { LlmPort } from 'src/Domain/Ports/LlmPort';

describe('EnhanceNoteCommand', () => {
    let context: TestContext;
    let command: EnhanceNoteCommand;
    let mockLlm: jest.Mocked<LlmPort>;
    let plugin: any;

    beforeEach(() => {
        context = new TestContext();

        mockLlm = {
            requestEnrichment: jest.fn(),
            requestStreamBrief: jest.fn(),
            request: jest.fn(),
            requestJson: jest.fn()
        } as unknown as jest.Mocked<LlmPort>;

        // Setup plugin mock
        plugin = {
            app: context.app,
            settings: {
                templateOptions: [
                    { targetFolder: 'Notes/**', templateFilename: 'Standard Template' }
                ]
            }
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

        command = new EnhanceNoteCommand(plugin, mockLlm);
    });

    test('should execute configured commands', async () => {
        // Setup
        await context.createFolder('Templates');
        // Template config with !!commands
        const templateContent = '---\n"!!commands": ["test-command"]\n---\n# Template';
        await context.createFile('Templates/Standard Template.md', templateContent);

        await context.createFolder('Notes');
        const file = await context.createFile('Notes/My Note.md', '# Content');

        // Mock the command in app
        const executeSpy = jest.fn();
        (context.app as any).commands.findCommand.mockImplementation((id: string) => {
            if (id === 'elocuency:test-command' || id === 'test-command') return { id };
            return null;
        });
        (context.app as any).commands.executeCommandById = executeSpy;

        // Open file so getActiveViewOfType works if needed (EnhanceNoteCommand calls getLeaf(false).openFile(file))
        // Actually EnhanceNoteCommand opens the file.
        // It calls executeInEditMode which calls getMode.
        // So we should make sure openFile sets up the view correctly.

        // Ensure active leaf exists
        context.app.workspace.getLeaf(true);

        await command.execute(file as any);

        // Verify command execution
        // The command iterates configs. !!commands is ["test-command"].
        // It tries to find 'test-command' or 'elocuency:test-command'.
        expect((context.app as any).commands.findCommand).toHaveBeenCalled();
        expect(executeSpy).toHaveBeenCalledWith(expect.stringMatching(/test-command/));
    });
});
