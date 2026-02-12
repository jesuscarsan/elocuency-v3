import { App, TFile } from 'obsidian';
import { ContextProviderPort } from "@elo/core";
export declare class ObsidianContextAdapter implements ContextProviderPort {
    private app;
    constructor(app: App);
    cleanContext(text: string): string;
    getSectionContent(file: TFile, headerName: string): Promise<string>;
    getLinkedFileContent(path: string, range?: {
        start: number;
        end: number;
    }): Promise<string>;
    getVocabularyContent(items: Set<string>): Promise<string>;
}
