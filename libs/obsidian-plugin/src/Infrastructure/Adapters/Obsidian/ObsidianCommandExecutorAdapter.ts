import { App, MarkdownView, Notice } from 'obsidian';
import { CommandExecutorPort } from '../../../Domain/Ports/CommandExecutorPort';

export class ObsidianCommandExecutorAdapter implements CommandExecutorPort {
	constructor(private readonly app: App) { }

	async executeCommand(commandId: string): Promise<void> {
		let command = (this.app as any).commands?.findCommand(commandId);
		let finalCommandId = commandId;

		if (!command) {
			finalCommandId = `elocuency:${commandId}`;
			command = (this.app as any).commands?.findCommand(finalCommandId);
		}

		if (command) {
			try {
				console.log(`[ObsidianCommandExecutor] Executing ${finalCommandId}`);
				if (command.callback) {
					await command.callback();
				} else if (command.editorCallback) {
					// Requires editor. We try to find active view.
					const leaf = this.app.workspace.getLeavesOfType('markdown')[0]; // Simple approach
					const view = leaf?.view as MarkdownView; // Cast safely?
					if (view && view.editor) {
						await command.editorCallback(view.editor, view);
					} else {
						console.warn(
							`[ObsidianCommandExecutor] Skipping editor command ${finalCommandId} because no active markdown view found.`,
						);
					}
				} else if (command.checkCallback) {
					await command.checkCallback(false);
				} else {
					(this.app as any).commands.executeCommandById(finalCommandId);
				}
			} catch (e: any) {
				console.error(`Error executing command ${finalCommandId}:`, e);
				new Notice(`Error executing command ${finalCommandId}: ${e.message}`);
			}
		} else {
			console.warn(`Command not found: ${commandId}`);
			new Notice(`Command not found: ${commandId}`);
		}
	}
}
