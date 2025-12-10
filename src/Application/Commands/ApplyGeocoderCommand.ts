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
import { FrontmatterKeys } from 'src/Domain/Constants/FrontmatterRegistry';

export class ApplyGeocoderCommand {
    private readonly pathBuilder: LocationPathBuilder;

    constructor(
        private readonly geocoder: GeocodingPort,
        private readonly llm: LlmPort,
        private readonly obsidian: ObsidianApp,
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
        const editor = view.editor;
        const content = editor.getValue();
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
            return null
        }

        const { refinedDetails, metadata } = enriched;

        // 1. Update Frontmatter
        const updatedFrontmatter = this.mergeFrontmatter(currentFrontmatter, refinedDetails);

        const frontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
        const normalizedBody = split.body.replace(/^[\n\r]+/, '');
        const segments: string[] = [];
        if (frontmatterBlock) segments.push(frontmatterBlock);
        if (normalizedBody) segments.push(normalizedBody);

        const finalContent = segments.join('\n\n');
        if (finalContent !== content) {
            editor.setValue(finalContent);
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
        details: GeocodingResponse
    ): Record<string, any> {
        const base = current ? { ...current } : {};

        // Handle standard fields
        // Handle standard fields - map from geocoder response (lowercase) to FrontmatterKeys (Capitalized)
        const mapping: Record<string, string> = {
            'municipio': FrontmatterKeys.Municipio,
            'provincia': FrontmatterKeys.Provincia,
            'region': FrontmatterKeys.Region,
            'pais': FrontmatterKeys.Pais
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
                base[key] = typeof cleanValue === 'string' ? capitalize(cleanValue) : cleanValue;
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

        return base;
    }

    private async getEnrichedData(placeName: string, rawDetails: GeocodingResponse): Promise<{ refinedDetails: GeocodingResponse, metadata: PlaceMetadata } | null> {
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
        
        Rules for metadata:
        1. Continent (in Spanish).
        2. isRegionFamous (boolean).

        Return ONLY a JSON object:
        {
            "refinedDetails": {
                "municipio": "...",
                "provincia": "...",
                "region": "...",
                "pais": "...",
                "googlePlaceId": "...",
                "lat": 0.0,
                "lng": 0.0
            },
            "metadata": {
                "continent": "Name",
                "isRegionFamous": true/false
            }
        }
        `;

        const response = await this.llm.requestJson({ prompt });
        if (!response) return null;
        console.log({ response });
        try {
            return response as { refinedDetails: GeocodingResponse, metadata: PlaceMetadata };
        } catch (e) {
            console.error('Failed to parse LLM response for enriched data', e);
            return null;
        }
    }
}
