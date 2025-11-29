import { App, normalizePath } from 'obsidian';
import { GeocodingResponse } from 'src/Domain/Ports/GeocodingPort';

export type PlaceMetadata = {
    continent: string;
    isRegionFamous: boolean;
};

export class LocationPathBuilder {
    constructor(private readonly app: App) { }

    buildPath(
        placeName: string,
        details: GeocodingResponse,
        metadata: PlaceMetadata
    ): string {
        const municipio = details.municipio?.trim();
        const provincia = details.provincia?.trim();
        const region = details.region?.trim();
        const pais = details.pais?.trim();

        const placeNameTrimmed = placeName.trim();

        const { continent, isRegionFamous } = metadata;

        // Base path: Lugares/Continente/Pais
        const parts = ['Lugares', continent, pais];

        // Region logic
        // Include if: Country is Spain OR Region is Famous OR Folder exists
        const regionPath = [...parts, region].join('/');
        const regionExists = this.folderExists(regionPath);

        if (pais === 'España' || isRegionFamous || regionExists) {
            if (region) parts.push(region);
        }

        // Province logic
        if (provincia) parts.push(provincia);

        // Municipality logic (Folder)
        if (municipio) parts.push(municipio);

        // File name logic (Disambiguation & Correction)
        let fileName = `${placeNameTrimmed}.md`;

        if (municipio) {
            // Only rename if the current name is "badly written" version of the municipality
            // (e.g. "san sebastian" -> "San Sebastián")
            // If it's a completely different name (e.g. "La playa de la concha"), keep it.
            const isSameName = placeNameTrimmed.localeCompare(municipio, undefined, { sensitivity: 'base' }) === 0;

            if (isSameName) {
                fileName = `${municipio}.md`;
                if (municipio === provincia) {
                    fileName = `${municipio} (Ciudad).md`;
                }
            }
        }

        return normalizePath([...parts, fileName].join('/'));
    }

    private folderExists(path: string): boolean {
        const normalized = normalizePath(path);
        const file = this.app.vault.getAbstractFileByPath(normalized);
        return !!file;
    }
}
