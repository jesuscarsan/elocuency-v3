"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianCommandExecutorAdapter = void 0;
const obsidian_1 = require("obsidian");
class ObsidianCommandExecutorAdapter {
    constructor(app) {
        this.app = app;
    }
    async executeCommand(commandId) {
        let command = this.app.commands?.findCommand(commandId);
        let finalCommandId = commandId;
        if (!command) {
            finalCommandId = `elocuency:${commandId}`;
            command = this.app.commands?.findCommand(finalCommandId);
        }
        if (command) {
            try {
                console.log(`[ObsidianCommandExecutor] Executing ${finalCommandId}`);
                if (command.callback) {
                    await command.callback();
                }
                else if (command.editorCallback) {
                    // Requires editor. We try to find active view.
                    const leaf = this.app.workspace.getLeavesOfType('markdown')[0]; // Simple approach
                    const view = leaf?.view; // Cast safely?
                    if (view && view.editor) {
                        await command.editorCallback(view.editor, view);
                    }
                    else {
                        console.warn(`[ObsidianCommandExecutor] Skipping editor command ${finalCommandId} because no active markdown view found.`);
                    }
                }
                else if (command.checkCallback) {
                    await command.checkCallback(false);
                }
                else {
                    this.app.commands.executeCommandById(finalCommandId);
                }
            }
            catch (e) {
                console.error(`Error executing command ${finalCommandId}:`, e);
                new obsidian_1.Notice(`Error executing command ${finalCommandId}: ${e.message}`);
            }
        }
        else {
            console.warn(`Command not found: ${commandId}`);
            new obsidian_1.Notice(`Command not found: ${commandId}`);
        }
    }
}
exports.ObsidianCommandExecutorAdapter = ObsidianCommandExecutorAdapter;
