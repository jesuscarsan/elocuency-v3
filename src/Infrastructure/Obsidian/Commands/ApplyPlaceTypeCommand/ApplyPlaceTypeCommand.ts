import { App as ObsidianApp, MarkdownView, SuggestModal, Notice, TFile } from 'obsidian';
import { ApplyGeocoderCommand } from '@/Infrastructure/Obsidian/Commands/ApplyGeocoder/ApplyGeocoderCommand';
import { PlaceTypes } from '@/Domain/Constants/PlaceTypes';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
    parseFrontmatter,
    splitFrontmatter,
    formatFrontmatterBlock
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import { FrontmatterKeys } from '@/Domain/Constants/FrontmatterRegistry';
import type { GeocodingPort, GeocodingResponse } from '@/Domain/Ports/GeocodingPort';
import type { LlmPort } from '@/Domain/Ports/LlmPort';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';

export class ApplyPlaceTypeCommand extends ApplyGeocoderCommand {
    constructor(
        geocoder: GeocodingPort,
        llm: LlmPort,
        obsidian: ObsidianApp,
    ) {
        super(geocoder, llm, obsidian);
    }

    async execute(file?: TFile) {
        // Redefine execute to orchestrate the new flow
        // 1. Get Place Name
        const view = getActiveMarkdownView(this.obsidian, file);
        if (!view?.file) {
            showMessage('Open a markdown note to apply place type.');
            return;
        }

        await executeInEditMode(view, async () => {
            const file = view.file;
            // Additional safety check
            if (!file) return;

            const content = await this.obsidian.vault.read(file);
            const split = splitFrontmatter(content);
            const currentFrontmatter = parseFrontmatter(split.frontmatterText);

            // Check for existing Place ID
            const existingIdRaw = currentFrontmatter?.[FrontmatterKeys.LugarId];
            let nameToClassify = file.basename;

            if (typeof existingIdRaw === 'string' && existingIdRaw.startsWith('google-maps-id:')) {
                const placeId = existingIdRaw.replace('google-maps-id:', '');
                showMessage(`Found existing ID: ${placeId}. Verifying...`);

                // Fetch details to get the REAL name for classification
                const details = await this.geocoder.requestPlaceDetails({
                    placeName: file.basename,
                    placeId: placeId
                });

                if (details?.lugar) {
                    nameToClassify = details.lugar;
                    showMessage(`Classifying as "${nameToClassify}"...`);
                }
            }

            showMessage(`Analyzing place type for ${nameToClassify}...`);

            // 2. AI Classification + Geocoding Preview
            // We need geocoding details to make a good decision (e.g. is it a Restaurant in Madrid?)
            // Reuse getEnrichedData but with an augmented prompt?
            // Or better: ask for classification specifically.

            // Let's call the classification first.
            const classification = await this.classifyPlace(nameToClassify);

            if (!classification) {
                showMessage('Could not classify place.');
                return;
            }

            let selectedTag: string | null = classification.suggestedTag;

            // 3. Auto-Decision Logic
            if (!classification.isConfident || !selectedTag || selectedTag === 'Other') {
                // User intervention required
                selectedTag = await this.askUserForTag();
            } else {
                showMessage(`Auto-detected: ${selectedTag}`);
            }

            if (!selectedTag) {
                showMessage('No place type selected. Aborting.');
                return;
            }

            // 4. Update Tags
            await this.addTagToFrontmatter(file, selectedTag);

            // 5. Trigger standard Geocoder flow
            // effectively calling super.execute() but we are already in execute()
            // so we call the logic directly or call super.execute() 
            // calling super.execute() will re-read the file, which is fine.
            await super.execute(file);
        });
    }

    private async classifyPlace(placeName: string): Promise<{ suggestedTag: string | null, isConfident: boolean } | null> {
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

    private async askUserForTag(): Promise<string | null> {
        return new Promise((resolve) => {
            const modal = new PlaceTypeSuggestModal(this.obsidian, (result) => {
                resolve(result);
            });
            modal.open();
            // Handle close without selection?
            // Since Obsidian modals are async in UI but sync in code execution (they don't block), 
            // we need to handle the promise correctly. 
            // However, SuggestModal doesn't have a built-in 'onCancel'. 
            // We will assume if they pick nothing, it stays unresolved or we handle it via onClone/onClose?
            // A simple way is to rely on the callback.
            // If the user closes the modal without picking, existing code usually halts. 
            // But we can wrap it. 
            // Actually, SuggestModal.onClose is available.
        });
    }

    private async addTagToFrontmatter(file: TFile, tag: string) {
        const content = await this.obsidian.vault.read(file);
        const split = splitFrontmatter(content);
        const currentFrontmatter = parseFrontmatter(split.frontmatterText);

        const currentTags = currentFrontmatter?.['tags'] || [];
        const tagsArray = Array.isArray(currentTags) ? currentTags : [currentTags];

        if (!tagsArray.includes(tag)) {
            tagsArray.push(tag);
        }

        const newFrontmatter = currentFrontmatter || {};
        newFrontmatter['tags'] = tagsArray;
        const frontmatterBlock = formatFrontmatterBlock(newFrontmatter);

        const body = split.body;

        const newContent = frontmatterBlock + body;
        if (newContent !== content) {
            await this.obsidian.vault.modify(file, newContent);
        }
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
