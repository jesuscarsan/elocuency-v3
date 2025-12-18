import { App, TFile, HeadingCache } from "obsidian";
import { HeaderMetadataRegistry, HeaderMetadataKey } from "../../Domain/Constants/HeaderMetadataRegistry";

export class MetadataService {
    constructor(private app: App) { }

    /**
     * Ensures a block ID exists for the given header.
     * Returns the block ID (existing or newly generated).
     */
    public ensureBlockId(header: HeadingCache): string {
        // Check if the header matches the block ID pattern (e.g. "Header Text ^blockid")
        const blockIdMatch = header.heading.match(/\^([a-zA-Z0-9-]+)$/);
        if (blockIdMatch) {
            return blockIdMatch[1];
        }

        // Generate a simple unique ID (short UUID-like)
        return this.generateShortId();
    }

    /**
     * Generates a short random ID.
     */
    private generateShortId(): string {
        return Math.random().toString(36).substring(2, 8);
    }

    /**
     * Syncs metadata for all block IDs in the file to the sidecar JSON.
     * Preserves existing data, adds missing entries with defaults.
     */
    public async syncMetadata(file: TFile, blockIds: string[]): Promise<void> {
        const jsonPath = file.path.replace(/\.md$/, '.json');
        let currentData: Record<string, Record<string, any>> = {};

        // 1. Read existing JSON if valid
        if (await this.app.vault.adapter.exists(jsonPath)) {
            try {
                const content = await this.app.vault.adapter.read(jsonPath);
                const parsed = JSON.parse(content);
                // Expected format: { "blockId1": { ... }, "blockId2": { ... } }
                if (typeof parsed === 'object' && parsed !== null) {
                    currentData = parsed;
                }
            } catch (e) {
                console.warn(`[MetadataService] Failed to parse existing JSON at ${jsonPath}`, e);
                // Start fresh if corrupt
                currentData = {};
            }
        }

        // 2. Update data
        let hasChanges = false;

        // Ensure "progress" key exists or uses root? 
        // User requested: "Por cada titulo, quiero un { score: 0, difficulty: 0, importance:0 }"
        // The structure should probably be mapped by Block ID.
        // Let's use the root object as the map: { "xyz123": { score: 0, ... } }

        // OR wrapper? The user said "Por cada titulo...", implies a map.
        // Option 1 used block IDs.

        const defaultMetadata: Record<string, any> = {};
        Object.values(HeaderMetadataRegistry).forEach(field => {
            defaultMetadata[field.key] = field.defaultValue;
        });

        for (const id of blockIds) {
            if (!currentData[id]) {
                currentData[id] = { ...defaultMetadata };
                hasChanges = true;
            } else {
                // Check for missing keys in existing entries (migration support)
                let entryChanged = false;
                Object.keys(defaultMetadata).forEach(key => {
                    if (currentData[id][key] === undefined) {
                        currentData[id][key] = defaultMetadata[key];
                        entryChanged = true;
                    }
                });
                if (entryChanged) hasChanges = true;
            }
        }

        // 3. Write if changed
        if (hasChanges) {
            await this.app.vault.adapter.write(jsonPath, JSON.stringify(currentData, null, 2));
        }
    }

    /**
     * Handles the rename/move of a markdown file by moving the associated sidecar JSON.
     */
    public async handleRename(file: TFile, oldPath: string): Promise<void> {
        if (file.extension !== 'md') return;

        const oldJsonPath = oldPath.replace(/\.md$/, '.json');
        const newJsonPath = file.path.replace(/\.md$/, '.json');

        if (await this.app.vault.adapter.exists(oldJsonPath)) {
            try {
                await this.app.vault.adapter.rename(oldJsonPath, newJsonPath);
                // console.log(`[MetadataService] Renamed sidecar JSON from ${oldJsonPath} to ${newJsonPath}`);
            } catch (e) {
                console.warn(`[MetadataService] Failed to rename sidecar JSON from ${oldJsonPath} to ${newJsonPath}`, e);
            }
        }
    }
    /**
     * Updates specific metadata fields for a given block ID.
     */
    public async updateBlockMetadata(file: TFile, blockId: string, metadata: Record<string, any>): Promise<void> {
        const jsonPath = file.path.replace(/\.md$/, '.json');
        let currentData: Record<string, Record<string, any>> = {};

        if (await this.app.vault.adapter.exists(jsonPath)) {
            try {
                const content = await this.app.vault.adapter.read(jsonPath);
                currentData = JSON.parse(content);
            } catch (e) {
                console.warn(`[MetadataService] Failed to parse existing JSON at ${jsonPath}`, e);
            }
        }

        if (!currentData[blockId]) {
            currentData[blockId] = {};
        }

        currentData[blockId] = {
            ...currentData[blockId],
            ...metadata
        };

        await this.app.vault.adapter.write(jsonPath, JSON.stringify(currentData, null, 2));
    }
}
