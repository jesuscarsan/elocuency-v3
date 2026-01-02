import { App, Editor, MarkdownView, TFile } from "obsidian";
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { MetadataService } from "@/Infrastructure/Services/MetadataService";
import { showMessage } from "@/Infrastructure/Obsidian/Utils/Messages";

export class GenerateHeaderMetadataCommand {
    private metadataService: MetadataService;

    constructor(private app: App) {
        this.metadataService = new MetadataService(app);
    }

    async execute(targetFile?: TFile): Promise<void> {
        console.log('[GenerateHeaderMetadataCommand] Start');
        const activeView = getActiveMarkdownView(this.app, targetFile);
        if (!activeView) {
            showMessage("No active markdown view");
            console.log('[GenerateHeaderMetadataCommand] End (No active view)');
            return;
        }

        const file = activeView.file;
        if (!file) {
            showMessage("No active file");
            console.log('[GenerateHeaderMetadataCommand] End (No active file)');
            return;
        }

        await this.processFile(file);
        console.log('[GenerateHeaderMetadataCommand] End');
    }

    private async processFile(file: TFile): Promise<void> {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.headings) {
            showMessage("No headings found in this file.");
            return;
        }

        const content = await this.app.vault.read(file);
        const lines = content.split("\n");
        const blockIds: string[] = [];
        let modified = false;

        // Process headings
        // We iterate and check if they have block IDs.

        for (const heading of cache.headings) {
            const lineIndex = heading.position.start.line;
            const lineContent = lines[lineIndex];

            // Check if already has ID
            const existingId = this.metadataService.ensureBlockId(heading);

            // ensureBlockId logic in Service checks for existence or generates new.
            // But if it generates new, it ignores the fact that it's not in the text yet.
            // We need to check if the TEXT implies an ID.

            const idRegex = /\^([a-zA-Z0-9-]+)$/;
            const match = lineContent.match(idRegex);

            if (match) {
                blockIds.push(match[1]);
            } else {
                // Determine the ID to add.
                // Since ensureBlockId generates a random one if missing, we use that.
                // Wait, ensureBlockId implementation: 
                //   if match return match[1] else generateShortId()
                // So if no match, it returns a NEW id.

                const newId = this.metadataService.ensureBlockId(heading);
                lines[lineIndex] = `${lineContent} ^${newId}`;
                blockIds.push(newId);
                modified = true;
            }
        }

        if (modified) {
            await this.app.vault.modify(file, lines.join("\n"));
            showMessage("Added missing Block IDs to headers.");
        }

        // Sync to JSON
        await this.metadataService.syncMetadata(file, blockIds);
        showMessage("Header metadata synced to JSON.");
    }
}
