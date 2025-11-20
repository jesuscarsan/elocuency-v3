import { App as ObsidianApp, MarkdownView } from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';
import {
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from 'src/Application/Utils/Notes';
import type { GeocodingPort } from 'src/Domain/Ports/GeocodingPort';

export class ApplyGeocoderCommand {
    constructor(
        private readonly geocoder: GeocodingPort,
        private readonly obsidian: ObsidianApp,
    ) { }

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

        const updatedFrontmatter = await this.enrichPlaceDetails(
            file.basename,
            currentFrontmatter,
        );

        if (!updatedFrontmatter) {
            showMessage('No place details found or no changes needed.');
            return;
        }

        const frontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
        const normalizedBody = split.body.replace(/^[\n\r]+/, '');

        const segments: string[] = [];
        if (frontmatterBlock) {
            segments.push(frontmatterBlock);
        }
        if (normalizedBody) {
            segments.push(normalizedBody);
        }

        const finalContent = segments.join('\n\n');
        editor.setValue(finalContent);
        showMessage('Place details applied.');
    }

    private async enrichPlaceDetails(
        placeName: string,
        currentFrontmatter: Record<string, any> | null,
    ): Promise<Record<string, any> | null> {
        const placeDetails = await this.geocoder.requestPlaceDetails({
            placeName,
        });

        if (!placeDetails) {
            return null;
        }

        const base = currentFrontmatter ? { ...currentFrontmatter } : {};
        let hasChanges = false;

        for (const [key, value] of Object.entries(placeDetails)) {
            const currentValue = base[key];
            const hasMeaningfulValue =
                currentValue !== undefined &&
                currentValue !== null &&
                !(typeof currentValue === 'string' && currentValue.trim().length === 0);

            if (!hasMeaningfulValue) {
                base[key] = value;
                hasChanges = true;
            }
        }

        return hasChanges ? base : null;
    }
}
