import { App as ObsidianApp, TFile, TFolder } from 'obsidian';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { showMessage, LocationPathBuilder, splitFrontmatter, parseFrontmatter, moveFile, ensureFolderNotes } from '@/Infrastructure/Obsidian/Utils';
import { GeocodingResponse } from "@elo/core";
import { FrontmatterKeys } from "@elo/core";

/**
 * Ver './RelocatePlaceNoteCommand.md' para más información.
 */
export class RelocatePlaceNoteCommand {
    private pathBuilder: LocationPathBuilder;

    constructor(
        private readonly app: ObsidianApp,
    ) {
        this.pathBuilder = new LocationPathBuilder(app);
    }

    async execute(file?: TFile) {
        console.log('[RelocatePlaceNoteCommand] Start');
        const view = getActiveMarkdownView(this.app, file);
        if (!view?.file) {
            showMessage('Abre una nota para organizar.');
            console.log('[RelocatePlaceNoteCommand] End (No active view)');
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

            const rawTags = frontmatter[FrontmatterKeys.Tags];
            const tags: string[] = Array.isArray(rawTags)
                ? rawTags
                : (typeof rawTags === 'string' ? rawTags.split(',').map(t => t.trim()) : []);

            const hasLugaresTag = tags.some(tag => tag.startsWith('Lugares/'));
            if (!hasLugaresTag) {
                showMessage('Este comando solo se aplica a notas que tengan un tag que empiece por "Lugares/".');
                console.log('[RelocatePlaceNoteCommand] End (No "Lugares/" tag)');
                return;
            }

            // Directly map frontmatter to GeocodingResponse structure
            // Helper to safely get string from frontmatter and strip wiki-links
            const getString = (key: string): string => {
                const val = frontmatter[key];
                if (val === undefined || val === null) return '';
                const str = typeof val === 'string' ? val : String(val);
                // Regex to replace [[Link|Text]] with Text and [[Link]] with Link
                return str.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').trim();
            };

            // Directly map frontmatter to GeocodingResponse structure
            const details: GeocodingResponse = {
                municipio: getString(FrontmatterKeys.Municipio),
                provincia: getString(FrontmatterKeys.Provincia),
                region: getString(FrontmatterKeys.Region),
                pais: getString(FrontmatterKeys.Pais),
            };

            // Clean up empty strings if needed, though LocationPathBuilder handles empty checks slightly differently (using optional chaining), 
            // but explicit empty strings are fine since it checks `details.municipio?.trim()`.

            // Extract continent from País link if usually formatted like [[Lugares/Europe/Spain|Spain]]
            // We need to catch 'Europe' from that path.
            let continent = '';
            let paisRaw = frontmatter[FrontmatterKeys.Pais];

            // Handle array case for País
            if (Array.isArray(paisRaw)) {
                paisRaw = paisRaw.length > 0 ? paisRaw[0] : '';
            }

            // Function to search for continent in Lugares
            const findContinentForCountry = (country: string): string | null => {
                const lugaresFolder = this.app.vault.getAbstractFileByPath('Lugares');
                if (!lugaresFolder || !(lugaresFolder instanceof TFolder)) return null;

                for (const potentialContinent of lugaresFolder.children) {
                    if (potentialContinent instanceof TFolder) {
                        const countryFolder = this.app.vault.getAbstractFileByPath(`${potentialContinent.path}/${country}`);
                        if (countryFolder && countryFolder instanceof TFolder) {
                            return potentialContinent.name;
                        }
                    }
                }
                return null;
            };

            if (typeof paisRaw === 'string') {
                // 1. Try to find continent by searching folders
                // Regex to get clean country name from [[Link|Name]] or [[Link]] or Name
                const countryName = paisRaw.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').trim();

                const foundContinent = findContinentForCountry(countryName);
                if (foundContinent) {
                    continent = foundContinent;
                } else {
                    // 2. Fallback: regex to match [[Lugares/Continent/Country...
                    // e.g. [[Lugares/Europa/España|España]] -> Europa
                    // or [[Lugares/Europa/España]] -> Europa
                    const continentMatch = paisRaw.match(/\[\[Lugares\/([^\/]+)\//);
                    if (continentMatch && continentMatch[1]) {
                        continent = continentMatch[1];
                    }
                }
            }

            const mockMetadata: any = {
                tags: frontmatter[FrontmatterKeys.Tags] || [],
                continent: continent
            };

            showMessage('Calculando ubicación basada en metadatos actuales...');

            try {
                const newPath = this.pathBuilder.buildPath(file.basename, details, mockMetadata);

                if (newPath !== file.path) {
                    await moveFile(this.app, file, newPath);
                    showMessage(`Nota movida a ${newPath}`);
                } else {
                    showMessage('La nota ya está en la ubicación correcta.');
                }

                // Ensure structural consistency: every folder in path has a note
                await ensureFolderNotes(this.app, newPath);

            } catch (err) {
                console.error(err);
                showMessage(`Error al organizar la nota: ${err}`);
            }
        });
        console.log('[RelocatePlaceNoteCommand] End');
    }
}
