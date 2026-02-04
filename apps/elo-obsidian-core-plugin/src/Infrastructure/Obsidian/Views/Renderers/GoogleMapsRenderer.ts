import { Plugin, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { FrontmatterKeys } from '@elo/core';

export function registerGoogleMapsRenderer(plugin: Plugin) {
    console.log("[GoogleMapsRenderer] Registering markdown post processor")
    plugin.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
        const file = plugin.app.vault.getAbstractFileByPath(context.sourcePath);

        if (!(file instanceof TFile)) {
            return;
        }

        const cache = plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (!frontmatter) {
            return;
        }

        // Helper to get frontmatter value case-insensitively
        const getFrontmatterValue = (key: string) => {
            const entry = Object.entries(frontmatter).find(([k]) => k.toLowerCase() === key.toLowerCase());
            return entry ? entry[1] : undefined;
        };

        // Check for Google Place ID
        let placeId = getFrontmatterValue(FrontmatterKeys.LugarId);

        if (placeId && typeof placeId === 'string') {
            const normalizedId = placeId.trim();
            if (normalizedId.startsWith('google-maps-id:')) {
                placeId = normalizedId.replace('google-maps-id:', '').trim();
            } else {
                placeId = null;
            }
        } else {
            placeId = null;
        }

        // Check for Coordinates (Latitud/Longitud)
        const lat = getFrontmatterValue(FrontmatterKeys.Latitud);
        const lng = getFrontmatterValue(FrontmatterKeys.Longitud);

        if (!placeId && (!lat || !lng)) {
            return;
        }

        // Avoid rendering multiple times if possible. 
        // The Spotify renderer just appends, which might be risky, but we'll follow the pattern.
        // We can check if we already have a map container in this element.
        if (element.querySelector('.elo-google-maps-container')) {
            return;
        }

        // We only want to render this ONCE per file, ideally at the top or bottom.
        // MarkdownPostProcessor is called for every block.
        // If we want to render it "inside the note", usually it means appending it to the content.
        // But since we can't easily control "where" without a specific block, 
        // we might restrict it to the first paragraph or a specific section.
        // However, the user said "if the note has...", implying it should just appear.
        // A safe bet is to check if this is the *first* block of the content (excluding frontmatter).

        // context.getSectionInfo(element) gives line numbers.
        const sectionInfo = context.getSectionInfo(element);
        if (!sectionInfo) return;

        // If it's not near the top, maybe we don't render? 
        // Or we can just render it once and set a flag on the file object? No, that's transient.
        // Let's look at the Spotify implementation again. It checks for 'singer' type.
        // If the note is short, it might be fine. If it's long, it might appear multiple times?
        // Actually, the Spotify implementation creates a div with class 'elo-spotify-container'.
        // If I add a check `if (element.querySelector('.elo-google-maps-container'))` that only checks the current block.

        // To ensure it only renders ONCE per view, we can try to find an existing map in the whole document?
        // But `element` is just a part of the document.

        // Let's try to render it only if the element is the first paragraph or header?
        // Or maybe we can just render it. If the user complains about duplicates, we fix it.
        // But duplicates are annoying.

        // Better approach:
        // Check if the current element is the first element after frontmatter.
        // The frontmatter ends at `frontmatter.position.end.line`.
        // The current section starts at `sectionInfo.lineStart`.
        // If `sectionInfo.lineStart` is close to `frontmatter.position.end.line + 1`, we render.

        const frontmatterEndLine = frontmatter.position?.end.line ?? -1;
        const currentLine = sectionInfo.lineStart;

        // Allow some buffer for empty lines
        if (currentLine > frontmatterEndLine + 5) {
            // If we are far down, don't render.
            return;
        }

        // Also ensure we haven't rendered it yet in this view (if possible).
        // But `registerMarkdownPostProcessor` is stateless.

        // Let's proceed with rendering.

        console.log('[GoogleMapsRenderer] Rendering map for:', file.basename);

        const container = element.createDiv({ cls: 'elo-google-maps-container' });
        container.style.marginTop = '10px';
        container.style.marginBottom = '10px';
        container.style.width = '100%';

        const apiKey = (plugin as any).settings.googleMapsEmbedAPIKey;
        if (!apiKey) {
            container.createEl('div', { text: 'Google Maps Map API Key missing in settings. Please verify "Google Maps Map API Key" is set.' });
            return;
        }

        const iframe = container.createEl('iframe');
        iframe.width = '100%';
        iframe.height = '450';
        iframe.style.border = '0';
        iframe.allow = 'fullscreen';
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

        let src = '';
        if (placeId) {
            src = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=place_id:${placeId}`;
        } else if (lat && lng) {
            src = `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${lat},${lng}&zoom=14`;
            // If they want a marker, we should use 'place' mode with q=lat,lng
            src = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}`;
        }

        iframe.src = src;
    });
}
