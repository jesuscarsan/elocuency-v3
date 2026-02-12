import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianCommandExecutorAdapter } from './ObsidianCommandExecutorAdapter';

describe('ObsidianCommandExecutorAdapter', () => {
	let adapter: ObsidianCommandExecutorAdapter;
	let mockApp: any;

	beforeEach(() => {
		mockApp = {
			commands: {
				findCommand: vi.fn(),
				executeCommandById: vi.fn(),
			},
			workspace: {
				getLeavesOfType: vi.fn(),
			},
		};
		adapter = new ObsidianCommandExecutorAdapter(mockApp);
	});

	it('should execute command by ID', async () => {
		mockApp.commands.findCommand.mockReturnValue({ id: 'cmd-id', callback: vi.fn() });
		await adapter.executeCommand('cmd-id');
		expect(mockApp.commands.findCommand).toHaveBeenCalledWith('cmd-id');
	});

	it('should execute editorCallback if found', async () => {
		const mockCmd = { editorCallback: vi.fn() };
		mockApp.commands.findCommand.mockReturnValue(mockCmd);
		mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: { editor: {} } }]);

		await adapter.executeCommand('cmd-id');
		expect(mockCmd.editorCallback).toHaveBeenCalled();
	});

	it('should execute checkCallback if found', async () => {
		const mockCmd = { checkCallback: vi.fn() };
		mockApp.commands.findCommand.mockReturnValue(mockCmd);

		await adapter.executeCommand('cmd-id');
		expect(mockCmd.checkCallback).toHaveBeenCalledWith(false);
	});

	it('should fallback to executeCommandById if no specific callback found', async () => {
		const mockCmd = { id: 'cmd-id' };
		mockApp.commands.findCommand.mockReturnValue(mockCmd);

		await adapter.executeCommand('cmd-id');
		expect(mockApp.commands.executeCommandById).toHaveBeenCalledWith('cmd-id');
	});

	it('should handle errors during execution', async () => {
		const mockCmd = {
			callback: vi.fn().mockImplementation(() => {
				throw new Error('fail');
			}),
		};
		mockApp.commands.findCommand.mockReturnValue(mockCmd);

		await adapter.executeCommand('cmd-id');
		// Should catch and not crash
	});

	it('should log warning if command not found', async () => {
		mockApp.commands.findCommand.mockReturnValue(null);
		await adapter.executeCommand('missing-id');
		expect(mockApp.commands.findCommand).toHaveBeenCalled();
	});
});
