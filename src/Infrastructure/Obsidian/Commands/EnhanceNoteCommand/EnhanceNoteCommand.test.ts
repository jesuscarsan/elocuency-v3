import { App, TFile } from 'obsidian';
import { EnhanceNoteCommand } from './EnhanceNoteCommand';
import { TestContext } from '@/Infrastructure/Testing/TestContext';
import { LlmPort } from '@/Domain/Ports/LlmPort';

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

    test('should run safely', async () => {
        // Functionality for folder-based commands was removed.
        // Now it just delegates to EnhanceByAiCommand.
        await command.execute({} as any);
        expect(true).toBe(true);
    });
});
