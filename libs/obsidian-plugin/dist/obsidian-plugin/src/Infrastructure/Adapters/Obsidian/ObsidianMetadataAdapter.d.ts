import { App, TFile, HeadingCache } from "obsidian";
import { HeaderMetadata } from "@elo/core";
import { MetadataPort } from '@elo/core';
export declare class ObsidianMetadataAdapter implements MetadataPort {
    private app;
    constructor(app: App);
    updateBlockMetadata(fileOrPath: TFile | string, blockId: string, metadata: HeaderMetadata): Promise<void>;
    getFileMetadata(fileOrPath: TFile | string): Promise<Record<string, Record<string, any>>>;
    /**
     * Ensures a block ID exists for the given header.
     * Returns the block ID (existing or newly generated).
     */
    ensureBlockId(header: HeadingCache): string;
    private generateShortId;
    /**
     * Syncs metadata for all block IDs in the file to the sidecar JSON.
     */
    syncMetadata(file: TFile, blockIds: string[]): Promise<void>;
    handleRename(file: TFile, oldPath: string): Promise<void>;
}
