import { Plugin, MarkdownPostProcessorContext, TFile } from 'obsidian';

export function registerSpotifyRenderer(plugin: Plugin) {
    console.log("[SpotifyPlayer] Registering markdown post processor")
    plugin.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
        // console.log('[SpotifyPlayer] Processing file:', context.sourcePath);
        const file = plugin.app.vault.getAbstractFileByPath(context.sourcePath);

        if (!(file instanceof TFile)) {
            console.log('[SpotifyPlayer] Not a TFile');
            return;
        }

        const cache = plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (!frontmatter) {
            // console.log('[SpotifyPlayer] No frontmatter');
            return;
        }

        const type = frontmatter.type?.toLowerCase();
        console.log('[SpotifyPlayer] Note type:', type);
        const validTypes = ['singer', 'cantante', 'song', 'canción'];

        if (!validTypes.includes(type)) {
            return;
        }

        // Only render once per file (heuristic: check if we already added it to this element, or try to target a specific section)
        // For now, let's just see if it renders at all.
        console.log('[SpotifyPlayer] Rendering button for:', file.basename);

        const spotifyUri = frontmatter.spotify_uri;
        const container = element.createDiv({ cls: 'elo-spotify-container' });

        // Add some basic styling
        container.style.marginTop = '10px';
        container.style.marginBottom = '10px';
        container.style.display = 'flex';
        container.style.alignItems = 'center';

        if (spotifyUri) {
            // Convert spotify:type:id to https://open.spotify.com/embed/type/id
            const parts = spotifyUri.split(':');
            if (parts.length === 3 && parts[0] === 'spotify') {
                const type = parts[1];
                const id = parts[2];
                const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;

                const iframe = container.createEl('iframe');
                iframe.src = embedUrl;
                iframe.width = '100%';
                iframe.height = '152'; // Standard height for compact player. Use 352 for large.
                iframe.setAttribute('frameborder', '0');
                iframe.setAttribute('allowtransparency', 'true');
                iframe.setAttribute('allow', 'encrypted-media; clipboard-write; fullscreen; picture-in-picture');
                iframe.setAttribute('sandbox', 'allow-forms allow-presentation allow-same-origin allow-scripts allow-popups');
                iframe.setAttribute('loading', 'lazy');

                // Adjust container styling for the player
                container.style.width = '100%';
            } else {
                // Fallback for invalid URI format
                const button = container.createEl('button', { text: 'Invalid Spotify URI' });
                button.disabled = true;
            }
        } else {
            const button = container.createEl('button', { text: 'Search on Spotify' });
            button.style.backgroundColor = '#191414'; // Spotify Black
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '20px';
            button.style.padding = '8px 16px';
            button.style.cursor = 'pointer';
            button.style.fontWeight = 'bold';
            button.style.fontSize = '14px';

            button.addEventListener('click', () => {
                const query = encodeURIComponent(file.basename);
                window.open(`spotify:search:${query}`);
            });
        }
    });
}
