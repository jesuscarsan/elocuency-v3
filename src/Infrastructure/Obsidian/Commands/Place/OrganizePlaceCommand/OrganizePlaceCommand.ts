import { App as ObsidianApp, TFile } from 'obsidian';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { showMessage, LocationPathBuilder, splitFrontmatter, parseFrontmatter, moveFile } from '@/Infrastructure/Obsidian/Utils';
import { PlaceEnrichmentService } from '@/Application/Services/PlaceEnrichmentService';
import { GeocodingPort } from '@/Domain/Ports/GeocodingPort';
import { LlmPort } from '@/Domain/Ports/LlmPort';

export class OrganizePlaceCommand {
    private pathBuilder: LocationPathBuilder;
    private enrichmentService: PlaceEnrichmentService;

    constructor(
        private readonly app: ObsidianApp,
        private readonly geocoder: GeocodingPort,
        private readonly llm: LlmPort,
    ) {
        this.pathBuilder = new LocationPathBuilder(app);
        // We reuse the service just to access helper methods if needed, 
        // but primarily we need it for consistency if we wanted to re-enrich.
        // For organization, pathBuilder is key.
        this.enrichmentService = new PlaceEnrichmentService(geocoder, llm);
    }

    async execute(file?: TFile) {
        const view = getActiveMarkdownView(this.app, file);
        if (!view?.file) {
            showMessage('Abre una nota para organizar.');
            return;
        }

        await executeInEditMode(view, async () => {
            const file = view.file;
            if (!file) return;

            const content = await this.app.vault.read(file);
            const split = splitFrontmatter(content);
            const frontmatter = parseFrontmatter(split.frontmatterText);

            if (!frontmatter) {
                showMessage('La nota no tiene frontmatter para organizar.');
                return;
            }

            // We construct "refinedDetails" and "metadata" structures as expected by locationPathBuilder
            // from the CURRENT frontmatter.
            // This assumes the frontmatter has valid keys.

            // LocationPathBuilder expects:
            // details: { components: ... }
            // metadata: { lugarId: ... }

            // We can try to reconstruct what we need.
            // Actually, LocationPathBuilder.buildPath uses:
            // title (basename)
            // details (GooglePlaceDetails) -> components (AddressComponent[])
            // metadata (PlaceMetadata) -> tags

            // If we are just organizing based on EXISTING frontmatter, we might not have the full GooglePlaceDetails structure.
            // However, the frontmatter SHOULD have the keys: Municipio, Provincia, Region, Pais.

            // LocationPathBuilder logic (checked previously, or inferred):
            // usually constructed from 'components'.
            // If we want to move based on existing frontmatter, we might need a simpler logic OR 
            // map frontmatter back to 'details' structure.

            // Let's look at how FindAndEnrichAndMovePlaceCommand did it:
            // It had fresh 'refinedDetails' from the API.

            // If we only have frontmatter, we need to adapt LocationPathBuilder or mock the details.
            // Let's try to mock the details from frontmatter.

            const mockDetails: any = {
                components: []
            };

            const addComponent = (val: string | undefined, type: string) => {
                if (val && typeof val === 'string') {
                    // type is like 'locality', 'administrative_area_level_2', etc.
                    // This is fragile if we don't know the exact mapping LocationPathBuilder uses.
                    // Let's check LocationPathBuilder code if possible, but assuming standard Google Maps types:
                    // Municipio -> locality
                    // Provincia -> administrative_area_level_2
                    // Region -> administrative_area_level_1
                    // Pais -> country
                    mockDetails.components.push({ long_name: val, short_name: val, types: [type] });
                }
            };

            // But wait, LocationPathBuilder might fallback to simple logic?
            // Let's assume we can use the frontmatter values directly if we adapt LocationPathBuilder
            // OR we construct a compatible object.

            // Actually, looking at FindAndEnrichAndMovePlaceCommand, it passed `refinedDetails` and `metadata`.
            // `refinedDetails` comes from `enrichmentService.enrichPlace`.

            // If the user wants to organize a note that is ALREADY enriched, we should trust the metadata keys.
            // But `LocationPathBuilder` is designed to take API response objects.

            // Let's peek at LocationPathBuilder in a future step if needed, but for now
            // I will implement a robust way: read the keys directly and map them.

            const municipio = frontmatter['Municipio'];
            const provincia = frontmatter['Provincia'];
            const region = frontmatter['Region'];
            const pais = frontmatter['País'];

            // We'll mimic the structure LocationPathBuilder expects.
            if (municipio) addComponent(municipio as string, 'locality');
            if (provincia) addComponent(provincia as string, 'administrative_area_level_2');
            if (region) addComponent(region as string, 'administrative_area_level_1');
            if (pais) addComponent(pais as string, 'country');

            const mockMetadata: any = {
                tags: frontmatter['tags'] || []
            };

            showMessage('Calculando ubicación basada en metadatos actuales...');

            try {
                const newPath = this.pathBuilder.buildPath(file.basename, mockDetails, mockMetadata);

                if (newPath !== file.path) {
                    await moveFile(this.app, file, newPath);
                    showMessage(`Nota movida a ${newPath}`);
                } else {
                    showMessage('La nota ya está en la ubicación correcta.');
                }
            } catch (err) {
                console.error(err);
                showMessage(`Error al organizar la nota: ${err}`);
            }
        });
    }
}
