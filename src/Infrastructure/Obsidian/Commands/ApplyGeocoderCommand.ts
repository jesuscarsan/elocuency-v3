import { App as ObsidianApp, MarkdownView, Notice, TFile } from 'obsidian';
import { showMessage } from 'src/Infrastructure/Obsidian/Utils/Messages';
import {
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from 'src/Infrastructure/Obsidian/Utils/Frontmatter';
import type { GeocodingPort, GeocodingResponse } from 'src/Domain/Ports/GeocodingPort';
import type { LlmPort } from 'src/Domain/Ports/LlmPort';
import { LocationPathBuilder, PlaceMetadata } from 'src/Infrastructure/Obsidian/Utils/LocationPathBuilder';
import { ensureFolderExists } from 'src/Infrastructure/Obsidian/Utils/Vault';
import { capitalize } from '../Utils/Strings';
import { FrontmatterKeys, FrontmatterRegistry } from 'src/Domain/Constants/FrontmatterRegistry';
import { PlaceTypes } from 'src/Domain/Constants/PlaceTypes';
import { executeInEditMode } from '../Utils/ViewMode';
import { PlaceEnrichmentService } from 'src/Application/Services/PlaceEnrichmentService';



export class ApplyGeocoderCommand {
    protected readonly pathBuilder: LocationPathBuilder;
    protected readonly enrichmentService: PlaceEnrichmentService;

    constructor(
        protected readonly geocoder: GeocodingPort,
        protected readonly llm: LlmPort,
        protected readonly obsidian: ObsidianApp,
    ) {
        this.pathBuilder = new LocationPathBuilder(obsidian);
        this.enrichmentService = new PlaceEnrichmentService(geocoder, llm);
    }

    async execute() {
        const view = this.obsidian.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
            showMessage('Open a markdown note to apply geocoding.');
            return;
        }

        await executeInEditMode(view, async () => {
            const file = view.file;
            // Additional check because executeInEditMode might have a slight delay, though view.file should be stable
            if (!file) return;

            const content = await this.obsidian.vault.read(file);
            const split = splitFrontmatter(content);
            const currentFrontmatter = parseFrontmatter(split.frontmatterText);

            showMessage(`Fetching place details for ${file.basename}...`);

            // Use Service to Enrich
            const enriched = await this.enrichmentService.enrichPlace(file.basename);
            console.log({ enriched });

            if (!enriched) {
                showMessage('Could not enrich location data.');
                return;
            }

            const { refinedDetails, metadata, summary, tags } = enriched;

            // 1. Update Frontmatter
            const updatedFrontmatter = this.enrichmentService.mergeFrontmatter(currentFrontmatter, refinedDetails, tags);

            const frontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
            const normalizedBody = split.body.replace(/^[\n\r]+/, '');
            const segments: string[] = [];
            if (frontmatterBlock) segments.push(frontmatterBlock);

            // Add summary if present and not already in body (simple check)
            if (summary) {
                segments.push(summary);
            }

            if (normalizedBody) segments.push(normalizedBody);

            const finalContent = segments.join('\n\n');
            if (finalContent !== content) {
                await this.obsidian.vault.modify(file, finalContent);
            }

            // 2. Move File
            showMessage(`Determining location hierarchy for ${file.basename}...`);

            const newPath = this.pathBuilder.buildPath(file.basename, refinedDetails, metadata);

            if (newPath !== file.path) {
                await ensureFolderExists(this.obsidian, newPath);
                await this.obsidian.fileManager.renameFile(file, newPath);
                new Notice(`Moved to ${newPath}`);
            } else {
                showMessage('Place details applied. Location already correct.');
            }
        });
    }
}

