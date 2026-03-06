export interface CommandExecutorPort {
    executeCommand(commandId: string): Promise<boolean>;
}
