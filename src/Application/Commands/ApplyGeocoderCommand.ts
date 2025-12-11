import { App as ObsidianApp, MarkdownView, Notice, TFile } from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';
import {
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from 'src/Application/Utils/Frontmatter';
import type { GeocodingPort, GeocodingResponse } from 'src/Domain/Ports/GeocodingPort';
import type { LlmPort } from 'src/Domain/Ports/LlmPort';
import { LocationPathBuilder, PlaceMetadata } from 'src/Application/Utils/LocationPathBuilder';
import { ensureFolderExists } from 'src/Application/Utils/Vault';
import { capitalize } from '../Utils/Strings';
import { FrontmatterKeys, FrontmatterRegistry } from 'src/Domain/Constants/FrontmatterRegistry';
import { PlaceTypes } from 'src/Domain/Constants/PlaceTypes';

export class ApplyGeocoderCommand {
    protected readonly pathBuilder: LocationPathBuilder;

    constructor(
        protected readonly geocoder: GeocodingPort,
        protected readonly llm: LlmPort,
        protected readonly obsidian: ObsidianApp,
    ) {
        this.pathBuilder = new LocationPathBuilder(obsidian);
    }

    async execute() {
        const view = this.obsidian.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
            showMessage('Open a markdown note to apply geocoding.');
            return;
        }

        const file = view.file;
        const content = await this.obsidian.vault.read(file);
        const split = splitFrontmatter(content);
        const currentFrontmatter = parseFrontmatter(split.frontmatterText);

        showMessage(`Fetching place details for ${file.basename}...`);

        const placeDetails = await this.geocoder.requestPlaceDetails({
            placeName: file.basename.trim(),
        });
        console.log({ placeDetails });

        if (!placeDetails) {
            showMessage('No place details found.');
            return;
        }

        showMessage(`Refining location data for ${file.basename}...`);
        const enriched = await this.getEnrichedData(file.basename.trim(), placeDetails);
        console.log({ enriched });

        if (!enriched) {
            showMessage('Could not refine location data.');
            return;
        }

        const { refinedDetails, metadata, summary, tags } = enriched;

        // 1. Update Frontmatter
        const updatedFrontmatter = this.mergeFrontmatter(currentFrontmatter, refinedDetails, tags);

        const frontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
        const normalizedBody = split.body.replace(/^[\n\r]+/, '');
        const segments: string[] = [];
        if (frontmatterBlock) segments.push(frontmatterBlock);

        // Add summary if present and not already in body (simple check)
        // We append it to the top of the body or replace if we find a previous summary?
        // User asked "que añada un parrafo", so just adding it.
        // Let's prepend it to the body or append? "añada" usually implies adding to existing.
        // But usually summary goes to top. Let's prepend to body.
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
    }

    private mergeFrontmatter(
        current: Record<string, any> | null,
        details: GeocodingResponse,
        tags?: string[]
    ): Record<string, any> {
        const base = current ? { ...current } : {};

        // Handle standard fields
        // Handle standard fields - map from geocoder response (lowercase) to FrontmatterKeys (Capitalized)
        const mapping: Record<string, string> = {
            'municipio': FrontmatterKeys.Municipio,
            'provincia': FrontmatterKeys.Provincia,
            'region': FrontmatterKeys.Region,
            'pais': FrontmatterKeys.Pais,
            'capital': FrontmatterKeys.Capital,
        };

        for (const [prop, key] of Object.entries(mapping)) {
            const value = (details as any)[prop];

            // Capitalize existing value
            if (typeof base[key] === 'string') {
                base[key] = capitalize(base[key]);
            }

            const currentValue = base[key];
            const hasMeaningfulValue =
                currentValue !== undefined &&
                currentValue !== null &&
                !(typeof currentValue === 'string' && currentValue.trim().length === 0);

            if (!hasMeaningfulValue) {
                const cleanValue = typeof value === 'string' ? value.trim() : value;

                if (cleanValue === '' || cleanValue === null || cleanValue === undefined) {
                    delete base[key];
                } else {
                    let finalValue = typeof cleanValue === 'string' ? capitalize(cleanValue) : cleanValue;

                    base[key] = finalValue;
                }
            }

            // Ensure link format if configured
            const finalVal = base[key];
            if (typeof finalVal === 'string' && FrontmatterRegistry[key]?.asLink) {
                if (!finalVal.startsWith('[[') || !finalVal.endsWith(']]')) {
                    base[key] = `[[${finalVal}]]`;
                }
            }
        }

        // Handle Google Maps specific fields
        if (details.googlePlaceId) {
            base[FrontmatterKeys.LugarId] = "google-maps-id:" + details.googlePlaceId;
        }
        if (details.lat) {
            base[FrontmatterKeys.Latitud] = details.lat;
        }
        if (details.lng) {
            base[FrontmatterKeys.Longitud] = details.lng;
        }

        // Handle Tags
        if (tags && tags.length > 0) {
            const currentTags = base[FrontmatterKeys.Tags] || [];
            const normalizedCurrentTags = Array.isArray(currentTags) ? currentTags : [currentTags];
            const newTags = new Set([...normalizedCurrentTags, ...tags]);
            base[FrontmatterKeys.Tags] = Array.from(newTags);
        }

        return base;
    }

    private async getEnrichedData(placeName: string, rawDetails: GeocodingResponse): Promise<{ refinedDetails: GeocodingResponse, metadata: PlaceMetadata, summary: string, tags: string[] } | null> {
        const prompt = `
        I have a place named "${placeName}".
        Raw Geocoding Data: ${JSON.stringify(rawDetails)}.

        Please refine this data and provide metadata.
        
        Rules for refinement:
        1. Correct any misclassifications. For example, "Inglaterra" might be returned as a province, but it should be a Region, and Country should be "Reino Unido".
        2. HIERARCHY RULE: If the place being geocoded IS ITSELF a higher level entity, clear all lower level fields.
           - If it is a Country -> region="", provincia="", municipio=""
           - If it is a Region -> provincia="", municipio=""
           - If it is a Province -> municipio=""
        3. 'pais' must be the sovereign country (e.g. "Reino Unido" for England).
        4. If the place is a Country, provide its Capital City in the 'capital' field of refinedDetails.
        
        Rules for metadata:
        1. Continent (in Spanish).
        2. isRegionFamous (boolean).

        Rules for summary:
        1. Write a SINGLE paragraph (approx 50-80 words) summarizing the most relevant aspects of this place (history, significance, tourism).
        2. In Spanish.

        Rules for tags:
        1. Choose 0 or more tags that is this place from the following list: ${JSON.stringify(PlaceTypes)}.
        2. ONLY use tags from this list.

        Return ONLY a JSON object:
        {
            "refinedDetails": {
                "municipio": "...",
                "provincia": "...",
                "region": "...",
                "pais": "...",
                "capital": "...", // Only if it is a country
                "googlePlaceId": "...",
                "lat": 0.0,
                "lng": 0.0
            },
            "metadata": {
                "continent": "Name",
                "isRegionFamous": true/false
            },
            "summary": "...",
            "tags": ["Lugares/..."]
        }
        `;

        const response = await this.llm.requestJson({ prompt });
        if (!response) return null;
        console.log({ response });
        try {
            return response as { refinedDetails: GeocodingResponse, metadata: PlaceMetadata, summary: string, tags: string[] };
        } catch (e) {
            console.error('Failed to parse LLM response for enriched data', e);
            return null;
        }
    }
}
