
import { GeocodingPort, GeocodingResponse } from '@elo/core';
import { LlmPort } from '@elo/core';
import { PlaceMetadata } from '@elo/core';
import { FrontmatterKeys, FrontmatterRegistry } from '@elo/core';
import { PlaceTypes } from '@elo/core';
import { capitalize } from 'src/Infrastructure/Obsidian/Utils/Strings'; // Might need to move this utility to Application or Shared if it's pure logic

// We might need to handle the PlaceMetadata dependency. 
// Ideally LocationPathBuilder utility types should be in Domain or Application if used here.
// For now, I will import it, but I should verify if it pulls in Obsidian.
// Checking imports of LocationPathBuilder... (it was imported in Command).

export class PlaceEnrichmentService {
    constructor(
        private geocoder: GeocodingPort,
        private llm: LlmPort
    ) { }

    async enrichPlace(placeName: string, promptPlaceDetails?: GeocodingResponse, placeId?: string, placeType?: string, excludeTags: boolean = false): Promise<{ refinedDetails: GeocodingResponse, metadata: PlaceMetadata, summary: string, tags: string[] } | null> {
        let placeDetails: GeocodingResponse | null | undefined = promptPlaceDetails;

        if (!placeDetails) {
            const searchName = placeType ? `${placeName.trim()} ${placeType}` : placeName.trim();
            placeDetails = await this.geocoder.requestPlaceDetails({
                placeName: searchName,
                placeId: placeId
            });
        }

        if (!placeDetails) {
            return null;
        }

        return this.getEnrichedData(placeName.trim(), placeDetails, placeType, excludeTags);
    }

    private async getEnrichedData(placeName: string, rawDetails: GeocodingResponse, placeType?: string, excludeTags: boolean = false): Promise<{ refinedDetails: GeocodingResponse, metadata: PlaceMetadata, summary: string, tags: string[] } | null> {
        const tagsRules = excludeTags ? '' : `
        Rules for tags:
        1. Choose 0 or more tags that is this place from the following list: ${JSON.stringify(PlaceTypes)}.
        2. ONLY use tags from this list.
        `;

        const tagsField = excludeTags ? '' : `"tags": ["Lugares/..."]`;

        const prompt = `
        I have a place named "${placeName}"${placeType ? ` (Type: ${placeType})` : ''}.
        Raw Geocoding Data: ${JSON.stringify(rawDetails)}.

        Please refine this data and provide metadata.
        
        Rules for refinement:
        1. Correct any misclassifications. For example, "Inglaterra" might be returned as a province, but it should be a Region, and Country should be "Reino Unido".
        2. HIERARCHY RULE: If the place being geocoded IS ITSELF a higher level entity, clear all lower level fields.
           - If it is a Country -> region="", provincia="", municipio=""
           - If it is a Region -> provincia="", municipio=""
           - If it is a Province -> municipio=""
        3. 'pais' must be the sovereign country (e.g. "Reino Unido" for England).
        4. If the place is a Country, provide its Capital City in the 'capital' field of refinedDetails, and add the 'continent' field of refinedDetails.
    
        Rules for metadata:
        1. Continent (in Spanish).
        2. isRegionFamous (boolean).

        Rules for summary:
        1. Write a SINGLE paragraph (approx 50-80 words) summarizing the most relevant aspects of this place (history, significance, tourism).
        2. In Spanish.

        ${tagsRules}

        Return ONLY a JSON object:
        {
            "refinedDetails": {
                "municipio": "...",
                "provincia": "...",
                "region": "...",
                "pais": "...",
                "capital": "...", // Only if it is a country
                "continent": "...", // Only if it is a country
                "googlePlaceId": "...",
                "lat": 0.0,
                "lng": 0.0
            },
            "metadata": {
                "continent": "Name",
                "isRegionFamous": true/false
            },
            "summary": "...",
            ${tagsField}
        }
        `;

        const response = await this.llm.requestJson({ prompt });
        if (!response) return null;

        try {
            return response as { refinedDetails: GeocodingResponse, metadata: PlaceMetadata, summary: string, tags: string[] };
        } catch (e) {
            console.error('Failed to parse LLM response for enriched data', e);
            return null;
        }
    }

    public mergeFrontmatter(
        current: Record<string, any> | null,
        details: GeocodingResponse,
        tags?: string[]
    ): Record<string, any> {
        const base = current ? { ...current } : {};

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

    async classifyPlace(placeName: string): Promise<{ suggestedTag: string | null, isConfident: boolean } | null> {
        const prompt = `
        I have a place named "${placeName}".
        Function: Classify this place into one of the following categories:
        ${PlaceTypes.map(t => `- "${t}"`).join('\n')}

        Return a JSON object:
        {
            "suggestedTag": "Lugares/..." or null if none match,
            "isConfident": boolean // set to true ONLY if you are very sure (e.g. "McDonalds" is a Restaurant). If ambiguous, false.
        }
        `;

        const response = await this.llm.requestJson({ prompt });
        return response as any;
    }
}
