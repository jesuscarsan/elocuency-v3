import { App as ObsidianApp, MarkdownView, SuggestModal, TFile } from 'obsidian';
import { PlaceEnrichmentService } from '@/Application/Services/PlaceEnrichmentService';
import { PlaceTypes, PlaceTypeRegistry, PlaceType } from "@elo/core";

import { FrontmatterKeys } from "@elo/core";
import type { GeocodingPort, GeocodingResponse } from "@elo/core";
import type { LlmPort } from "@elo/core";
import {
    showMessage,
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';

export class EnrichPlaceCommand {
    private enrichmentService: PlaceEnrichmentService;

    constructor(
        private readonly geocoder: GeocodingPort,
        private readonly llm: LlmPort,
        private readonly app: ObsidianApp,
    ) {
        this.enrichmentService = new PlaceEnrichmentService(geocoder, llm);
    }

    async execute(file?: TFile) {
        console.log('[EnrichPlaceCommand] Start');
        const view = getActiveMarkdownView(this.app, file);
        if (!view?.file) {
            showMessage('Abre una nota de markdown para enriquecer el lugar.');
            console.log('[EnrichPlaceCommand] End (No active view)');
            return;
        }

        await executeInEditMode(view, async () => {
            const file = view.file;
            if (!file) return;

            const content = await this.app.vault.read(file);
            const split = splitFrontmatter(content);
            const currentFrontmatter = parseFrontmatter(split.frontmatterText);

            // 1. Determine Search Query
            // Reuse logic from UpdatePlaceIdCommand: Smart search if ID missing, else verify ID.
            const existingIdRaw = currentFrontmatter?.[FrontmatterKeys.LugarId];
            let placeId: string | undefined;
            let searchName = file.basename;

            if (typeof existingIdRaw === 'string' && existingIdRaw.startsWith('google-maps-id:')) {
                placeId = existingIdRaw.replace('google-maps-id:', '');
                showMessage(`ID existente encontrado: ${placeId}. Verificando detalles...`);
                // If we have an ID, we might want to get the name from the API to be sure about classification
                const details = await this.geocoder.requestPlaceDetails({ placeName: searchName, placeId });
                if (details?.lugar) {
                    searchName = details.lugar;
                }
            } else {
                // Smart Search Construction
                const components: string[] = [file.basename];
                const keysToCheck = [
                    FrontmatterKeys.Municipio,
                    FrontmatterKeys.Provincia,
                    FrontmatterKeys.Region,
                    FrontmatterKeys.Pais
                ];
                for (const key of keysToCheck) {
                    const val = currentFrontmatter?.[key];
                    if (val && typeof val === 'string' && val.trim().length > 0) {
                        const cleanVal = val.replace(/^\[\[|\]\]$/g, '');
                        components.push(cleanVal);
                    }
                }
                searchName = components.join(', ');
                showMessage(`Buscando: "${searchName}"...`);
            }

            // 2. Classify Place Type
            // Reuse logic from ApplyPlaceTypeCommand: AI Classification -> User Disambiguation

            // First check if we already have a tag in the frontmatter
            let selectedTag: string | null = null;
            if (currentFrontmatter && currentFrontmatter[FrontmatterKeys.Tags]) {
                const rawTags = currentFrontmatter[FrontmatterKeys.Tags];
                const tags: string[] = Array.isArray(rawTags) ? rawTags : [rawTags as string];

                // Find the first valid PlaceType tag
                const found = tags.find((t: string) => PlaceTypes.includes(t as any));
                if (found) {
                    selectedTag = found;
                    showMessage(`Tipo detectado en frontmatter: ${selectedTag}`);
                }
            }

            if (!selectedTag) {
                const classification = await this.enrichmentService.classifyPlace(searchName);
                selectedTag = classification?.suggestedTag ?? null;

                if (!classification?.isConfident || !selectedTag || selectedTag === 'Other') {
                    selectedTag = await this.askUserForTag();
                } else {
                    showMessage(`Tipo detectado por IA: ${selectedTag}`);
                }
            }

            if (!selectedTag) {
                showMessage('No se seleccionó tipo de lugar. Abortando operación.');
                return;
            }

            // Map selectedTag to a search suffix for disambiguation using the Registry
            let placeTypeSuffix: string | undefined;
            if (selectedTag) {
                const config = PlaceTypeRegistry[selectedTag as PlaceType];
                placeTypeSuffix = config?.geocodingSuffix;
            }

            showMessage(`Obteniendo detalles completos y datos extendidos...${placeTypeSuffix ? ` (Tipo: ${placeTypeSuffix})` : ''}`);

            // Determine if we should exclude tags from enrichment (if they already exist)
            const existingTags = currentFrontmatter?.[FrontmatterKeys.Tags];
            const hasTags = Array.isArray(existingTags) ? existingTags.length > 0 : !!existingTags;

            // 3. Enrich Data
            // Reuse logic from ApplyGeocoderCommand: Fetch refined details, metadata, summary
            const enriched = await this.enrichmentService.enrichPlace(searchName, undefined, placeId, placeTypeSuffix, hasTags);

            if (!enriched) {
                showMessage('No se pudieron obtener datos enriquecidos.');
                return;
            }

            const { refinedDetails, summary, tags } = enriched;

            // Merge our selected tag with any tags returned by enrichment service
            const finalTags = tags || [];
            if (!finalTags.includes(selectedTag)) {
                finalTags.push(selectedTag);
            }

            // 4. Update Frontmatter
            const updatedFrontmatter = this.enrichmentService.mergeFrontmatter(currentFrontmatter, refinedDetails, finalTags);

            const frontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
            const normalizedBody = split.body.replace(/^[\n\r]+/, '');
            const segments: string[] = [];
            if (frontmatterBlock) segments.push(frontmatterBlock);
            if (summary) segments.push(summary); // Add summary if present
            if (normalizedBody) segments.push(normalizedBody);

            const finalContent = segments.join('\n\n');
            if (finalContent !== content) {
                await this.app.vault.modify(file, finalContent);
                showMessage('Nota enriquecida correctamente.');
                // Tip to user
                showMessage('Sugerencia: Usa "Organizar nota de Lugar" para moverla a su carpeta.');
            } else {
                showMessage('No hubo cambios en la nota.');
            }
        });
        console.log('[EnrichPlaceCommand] End');
    }

    private async askUserForTag(): Promise<string | null> {
        return new Promise((resolve) => {
            const modal = new PlaceTypeSuggestModal(this.app, (result) => {
                resolve(result);
            });
            modal.open();
        });
    }
}

class PlaceTypeSuggestModal extends SuggestModal<string> {
    constructor(app: ObsidianApp, private onChoose: (result: string) => void) {
        super(app);
    }

    getSuggestions(query: string): string[] {
        return PlaceTypes.filter(t => t.toLowerCase().includes(query.toLowerCase()));
    }

    renderSuggestion(value: string, el: HTMLElement) {
        el.createEl("div", { text: value });
    }

    onChooseSuggestion(item: string, evt: MouseEvent | KeyboardEvent) {
        this.onChoose(item);
    }
}
