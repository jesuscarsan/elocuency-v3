import { App as ObsidianApp, MarkdownView, TFile } from 'obsidian';
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
    formatFrontmatterBlock,
    parseFrontmatter,
    splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import { FrontmatterKeys } from '@/Domain/Constants/FrontmatterRegistry';
import type { GeocodingPort } from '@/Domain/Ports/GeocodingPort';
import { InputModal } from '@/Infrastructure/Obsidian/Views/Modals/InputModal';

export class AddPlaceIdFromUrlCommand {
    constructor(
        private readonly geocoder: GeocodingPort,
        private readonly app: ObsidianApp,
    ) { }

    async execute(file?: TFile) {
        const view = getActiveMarkdownView(this.app, file);
        if (!view?.file) {
            showMessage('Abre una nota de markdown para añadir el Place ID.');
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
    }

    private async processUrl(url: string, file: TFile, view: MarkdownView) {
        const placeId = this.extractPlaceIdFromUrl(url);
        const placeName = this.extractNameFromUrl(url);

        if (!placeId && !placeName) {
            showMessage('No se encontró un Place ID o nombre válido en la URL.');
            return;
        }

        if (placeId) {
            showMessage(`ID encontrado: ${placeId}. Obteniendo detalles...`);
        } else {
            showMessage(`Lugar encontrado: ${placeName}. Obteniendo detalles...`);
        }

        const details = await this.geocoder.requestPlaceDetails({
            placeName: placeName,
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

            const base = { ...currentFrontmatter };
            base[FrontmatterKeys.LugarId] = "google-maps-id:" + details.googlePlaceId;

            // Update other fields if available and not set? or force update? 
            // Requirement says "extraiga el PlaceId y lo meta en el campo...".
            // Usually we want to enrich too. Let's enrich basic fields if they match what geocoder returns
            // Update logic similar to UpdatePlaceIdCommand
            if (details.lat) base[FrontmatterKeys.Latitud] = details.lat;
            if (details.lng) base[FrontmatterKeys.Longitud] = details.lng;
            if (details.municipio) base[FrontmatterKeys.Municipio] = details.municipio;
            if (details.provincia) base[FrontmatterKeys.Provincia] = details.provincia;
            if (details.pais) base[FrontmatterKeys.Pais] = details.pais;


            const frontmatterBlock = formatFrontmatterBlock(base);
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

    private extractPlaceIdFromUrl(url: string): string | null {
        // 1. Intentar buscar el formato estándar ChIJ (27 caracteres aprox.)
        const chijRegex = /ChIJ[a-zA-Z0-9_-]{23}/;
        const chijMatch = url.match(chijRegex);
        if (chijMatch) {
            console.log('Place ID encontrado chijMatch:', chijMatch[0]);
            return chijMatch[0];
        }

        // 2. Si no existe ChIJ, extraer el ID hexadecimal de la URL
        // En tu URL está después del parámetro !1s y antes del siguiente !
        const hexRegex = /!1s(0x[a-fA-F0-9]+:0x[a-fA-F0-9]+)/;
        const hexMatch = url.match(hexRegex);

        if (hexMatch && hexMatch[1]) {
            console.log('Place ID encontrado hexMatch:', hexMatch[1]);
            return hexMatch[1]; // Retorna algo como "0xd2f669cbd7ed74d:0x8abbf58f157b2d58"
        }
        console.log('No se encontró un Place ID válido en la URL.');
        return null;
    }

    private extractNameFromUrl(url: string): string {
        try {
            // Regex matches /place/NAME/
            const nameRegex = /\/place\/([^/]+)\//;
            const match = url.match(nameRegex);
            if (match && match[1]) {
                // Decode URI component and replace plus signs with spaces
                const decoded = decodeURIComponent(match[1].replace(/\+/g, ' '));
                return decoded;
            }
        } catch (e) {
            console.error('Error extracting name from URL', e);
        }
        return '';
    }
}
