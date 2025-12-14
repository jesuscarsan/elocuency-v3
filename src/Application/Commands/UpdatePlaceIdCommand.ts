
import { App as ObsidianApp, MarkdownView, Notice } from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';
import {
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from 'src/Application/Utils/Frontmatter';
import type { GeocodingPort, GeocodingResponse } from 'src/Domain/Ports/GeocodingPort';
import { FrontmatterKeys, FrontmatterRegistry } from 'src/Domain/Constants/FrontmatterRegistry';
import { executeInEditMode } from '../Utils/ViewMode';

export class UpdatePlaceIdCommand {
    constructor(
        protected readonly geocoder: GeocodingPort,
        protected readonly obsidian: ObsidianApp,
    ) { }

    async execute() {
        const view = this.obsidian.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
            showMessage('Open a markdown note to update place ID.');
            return;
        }

        await executeInEditMode(view, async () => {
            const file = view.file;
            // Check again for safety
            if (!file) return;

            const content = await this.obsidian.vault.read(file);
            const split = splitFrontmatter(content);
            const currentFrontmatter = parseFrontmatter(split.frontmatterText) ?? {};

            showMessage(`Calculando mejor coincidencia para ${file.basename}...`);

            // Construct query from frontmatter
            const components: string[] = [file.basename];

            // Order matters: specific to general
            const keysToCheck = [
                FrontmatterKeys.Municipio,
                FrontmatterKeys.Provincia,
                FrontmatterKeys.Region,
                FrontmatterKeys.Pais
            ];

            for (const key of keysToCheck) {
                const val = currentFrontmatter[key];
                if (val && typeof val === 'string' && val.trim().length > 0) {
                    // If it's a wiki link [[Val]], strip brackets
                    const cleanVal = val.replace(/^\[\[|\]\]$/g, '');
                    components.push(cleanVal);
                }
            }

            const query = components.join(', ');
            console.log(`[UpdatePlaceIdCommand] Searching for: "${query}"`);

            const placeDetails = await this.geocoder.requestPlaceDetails({
                placeName: query,
            });

            if (!placeDetails) {
                showMessage('No place details found for the refined query.');
                return;
            }

            if (placeDetails.googlePlaceId) {
                const base = { ...currentFrontmatter };

                base[FrontmatterKeys.LugarId] = "google-maps-id:" + placeDetails.googlePlaceId;

                // Also update coordinates if available, as they go hand in hand with ID
                if (placeDetails.lat) base[FrontmatterKeys.Latitud] = placeDetails.lat;
                if (placeDetails.lng) base[FrontmatterKeys.Longitud] = placeDetails.lng;

                const frontmatterBlock = formatFrontmatterBlock(base);
                const normalizedBody = split.body.replace(/^[\n\r]+/, '');
                const segments: string[] = [];
                if (frontmatterBlock) segments.push(frontmatterBlock);
                if (normalizedBody) segments.push(normalizedBody);

                const finalContent = segments.join('\n\n');
                if (finalContent !== content) {
                    await this.obsidian.vault.modify(file, finalContent);
                    new Notice(`Place ID updated for ${file.basename}`);
                } else {
                    showMessage('Place ID was already up to date.');
                }
            } else {
                showMessage('Google Maps did not return a Place ID.');
            }
        });
    }
}
