import { App } from 'obsidian';
import { UIServicePort } from '../../Domain/ports/UIServicePort';
export declare class ObsidianUIServiceAdapter implements UIServicePort {
    private readonly app;
    constructor(app: App);
    showMessage(message: string): void;
    showSelectionModal<T>(placeholder: string, items: T[], labelFn: (item: T) => string): Promise<T | null>;
}
