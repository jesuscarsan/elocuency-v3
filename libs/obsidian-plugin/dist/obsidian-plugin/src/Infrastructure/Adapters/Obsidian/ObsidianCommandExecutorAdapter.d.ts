import { App } from 'obsidian';
import { CommandExecutorPort } from '../../../Domain/Ports/CommandExecutorPort';
export declare class ObsidianCommandExecutorAdapter implements CommandExecutorPort {
    private readonly app;
    constructor(app: App);
    executeCommand(commandId: string): Promise<void>;
}
