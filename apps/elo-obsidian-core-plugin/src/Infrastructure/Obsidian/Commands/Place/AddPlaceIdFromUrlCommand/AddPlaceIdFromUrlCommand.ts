import { App as ObsidianApp, MarkdownView, TFile } from 'obsidian';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import type { GeocodingPort } from "@elo/core";
import type { LlmPort } from "@elo/core";
import { InputModal } from '@/Infrastructure/Obsidian/Views/Modals/InputModal';
import { GoogleMapsUrlParser } from '@/Infrastructure/Obsidian/Utils/GoogleMapsUrlParser';
import { PlaceEnrichmentService } from '@/Application/Services/PlaceEnrichmentService';

export class AddPlaceIdFromUrlCommand {
    private enrichmentService: PlaceEnrichmentService;

    constructor(
        private readonly geocoder: GeocodingPort,
        private readonly llm: LlmPort,
        private readonly app: ObsidianApp,
    ) {
        this.enrichmentService = new PlaceEnrichmentService(geocoder, llm);
    }

    async execute(file?: TFile) {
        console.log('[AddPlaceIdFromUrlCommand] Start');
        const view = getActiveMarkdownView(this.app, file);
        if (!view?.file) {
            showMessage('Abre una nota de markdown para añadir el Place ID.');
            console.log('[AddPlaceIdFromUrlCommand] End (No active view)');
            return;
        }

        const activeFile = view.file;

        new InputModal(
            this.app,
            {
                title: 'Añadir Place ID desde URL',
                label: 'Google Maps URL',
                placeholder: 'Pega la URL aquí (ej: https://maps.app.goo.gl/...)',
                submitText: 'Buscar ID'
            },
            async (url) => {
                if (!url) return;
                await this.processUrl(url, activeFile, view);
            }
        ).open();
        console.log('[AddPlaceIdFromUrlCommand] End');
    }

    private async processUrl(url: string, file: TFile, view: MarkdownView) {
        const placeId = GoogleMapsUrlParser.extractPlaceId(url);
        const placeName = GoogleMapsUrlParser.extractName(url);

        if (!placeId && !placeName) {
            showMessage('No se encontró un Place ID o nombre válido en la URL.');
            return;
        }

        if (placeId) {
            showMessage(`ID encontrado: ${placeId}. Obteniendo detalles...`);
        } else {
            showMessage(`Lugar encontrado: ${placeName}. Obteniendo detalles...`);
        }

        // We use geocoder directly to get details first, similar to how it was before
        // but then we will use enrichment service to merge.
        const details = await this.geocoder.requestPlaceDetails({
            placeName: placeName ?? '',
            placeId: placeId ?? undefined
        });

        if (!details) {
            showMessage('No se pudieron obtener detalles del lugar.');
            return;
        }

        if (!details.googlePlaceId) {
            showMessage('La API no devolvió un Place ID confirmado.');
            return;
        }

        await executeInEditMode(view, async () => {
            const content = await this.app.vault.read(file);
            const split = splitFrontmatter(content);
            const currentFrontmatter = parseFrontmatter(split.frontmatterText) ?? {};

            // Use shared logic for merging frontmatter
            const updatedFrontmatter = this.enrichmentService.mergeFrontmatter(currentFrontmatter, details);

            const frontmatterBlock = formatFrontmatterBlock(updatedFrontmatter);
            const normalizedBody = split.body.replace(/^[\n\r]+/, '');

            const segments: string[] = [];
            if (frontmatterBlock) segments.push(frontmatterBlock);
            if (normalizedBody) segments.push(normalizedBody);

            const finalContent = segments.join('\n\n');
            if (finalContent !== content) {
                await this.app.vault.modify(file, finalContent);
                showMessage(`Place ID actualizado: ${details.googlePlaceId}`);
            } else {
                showMessage('La nota ya estaba actualizada.');
            }
        });
    }
}
