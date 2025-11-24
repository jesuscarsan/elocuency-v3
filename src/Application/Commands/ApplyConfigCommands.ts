import {
    Plugin as ObsidianPlugin,
    TFile,
} from 'obsidian';

async function applyConfigCommands(obsidianPlugin: ObsidianPlugin, file: TFile) {
    // Implementation of applying commands
    if (!(file instanceof TFile) || file.extension !== 'md') {
        return;
    }

    const parentPath = file.parent?.path;
    if (!parentPath) {
        return;
    }

    const matchingTemplate = obsidianPlugin.settings.templateOptions.find(
        (option) => option.targetFolder === parentPath,
    );

    if (
        matchingTemplate &&
        matchingTemplate.commands &&
        matchingTemplate.commands.length > 0
    ) {
        console.log(
            `[Elocuency] Note moved to ${parentPath}. Executing commands: ${matchingTemplate.commands.join(', ')}`,
        );

        const leaf = obsidianPlugin.app.workspace.getLeaf(false);
        await leaf.openFile(file);

        for (const commandId of matchingTemplate.commands) {
            const command = (obsidianPlugin as any).commands.findCommand(commandId);
            if (command) {
                (obsidianPlugin as any).commands.executeCommandById(commandId);
            } else {
                console.warn(`[Elocuency] Command not found: ${commandId}`);
            }
        }
    }
}