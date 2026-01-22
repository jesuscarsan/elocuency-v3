import { Plugin, MarkdownPostProcessorContext, TFile, setIcon } from 'obsidian';

export function registerSpotifyRenderer(plugin: Plugin) {
    console.log("[SpotifyPlayer] Registering markdown post processor")
    plugin.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {

        // 1. Existing Logic: Frontmatter-based full player
        // ----------------------------------------------------------------
        renderFrontmatterPlayer(plugin, element, context);

        // 2. New Logic: Inline URI replacement (in text nodes)
        // ----------------------------------------------------------------
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        const nodesToReplace: { node: Text, matches: RegExpMatchArray[] }[] = [];

        let node: Node | null;
        while (node = walker.nextNode()) {
            const textHTML = node.textContent || '';
            // Regex to match (spotify:type:id) e.g. (spotify:track:12345)
            // Capturing the full URI inside the parens
            const regex = /\((spotify:[a-zA-Z0-9]+:[a-zA-Z0-9]+)\)/g;
            const matches = [...textHTML.matchAll(regex)];

            if (matches.length > 0) {
                nodesToReplace.push({ node: node as Text, matches });
            }
        }

        // Process replacements in reverse order or just replace the node
        for (const { node, matches } of nodesToReplace) {
            const parent = node.parentNode;
            if (!parent) continue;

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            const textContent = node.textContent || '';

            for (const match of matches) {
                if (match.index === undefined) continue;

                // Text before match
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(textContent.slice(lastIndex, match.index)));
                }

                // The Play Button/Link
                const uri = match[1]; // content captured in group 1: spotify:track:xyz
                const container = fragment.createEl('span', { cls: 'elo-spotify-inline-play' });
                container.style.marginLeft = '5px';
                container.style.cursor = 'pointer';
                container.style.color = 'var(--text-accent)';
                container.setAttribute('aria-label', `Play on Spotify`);

                // Using an icon
                const iconSpan = container.createSpan();
                setIcon(iconSpan, 'play-circle');

                container.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.open(uri); // Opens deep link
                });

                lastIndex = match.index + match[0].length;
            }

            // Remaining text
            if (lastIndex < textContent.length) {
                fragment.appendChild(document.createTextNode(textContent.slice(lastIndex)));
            }

            parent.replaceChild(fragment, node);
        }
    });
}

function renderFrontmatterPlayer(plugin: Plugin, element: HTMLElement, context: MarkdownPostProcessorContext) {
    const file = plugin.app.vault.getAbstractFileByPath(context.sourcePath);

    if (!(file instanceof TFile)) {
        return;
    }

    const cache = plugin.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    if (!frontmatter) {
        return;
    }

    const type = frontmatter.type?.toLowerCase();
    const validTypes = ['singer', 'cantante', 'song', 'canción'];

    if (!validTypes.includes(type)) {
        return;
    }

    // Heuristic to avoid double rendering if possible, but element is usually a section.
    // We check if we already have a container in this exact element.
    if (element.querySelector('.elo-spotify-container')) return;

    // We only want to render this at the top or specific place? 
    // The previous implementation blindly appended to 'element'.
    // MarkdownPostProcessor is called for EACH block. 
    // Appending to every block is bad if validTypes matches.
    // We should probably check if 'element' is the first block or specific block?
    // OR, the previous implementation was flawed and rendered it multiple times?
    // For safety, let's restrict to when element contains the frontmatter/header? 
    // Actually, usually renderers target code blocks or specific sections.
    // If this is a general post processor, it runs on every paragraph.
    // Let's assume the previous behavior was "add it to the first block" or purely for specific note views.
    // To be safe and minimal change to existing logic:
    // We will leave it but add a check to only render if it's the "content" container or we are careful.
    // Actually, `element` is usually a <p> or <div> for a block.
    // If we append to `element` in every block `plugin.registerMarkdownPostProcessor`, we get a player after every paragraph.
    // That seems wrong. 
    // BUT I am just copying the existing logic (refactored). I won't change its behavior fundamentally unless needed.
    // Wait, the previous code had `console.log('[SpotifyPlayer] Rendering button for:', file.basename);`
    // It likely spammed.
    // Let's add a check: only render if element has attribute 'data-line="0"' (first line) or similar?
    // Or maybe just leave it as it was (it might be handled upstream or context).

    // START OF ORIGINAL LOGIC PRESERVATION
    const spotifyUri = frontmatter.spotify_uri;

    // Only render if we haven't rendered a player in this file view yet? 
    // That's hard to track. 
    // Let's just create it if it doesn't exist in the element, assuming the user knows what they are doing with this legacy code.

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
            iframe.height = '152';
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('allowtransparency', 'true');
            iframe.setAttribute('allow', 'encrypted-media; clipboard-write; fullscreen; picture-in-picture');
            iframe.setAttribute('sandbox', 'allow-forms allow-presentation allow-same-origin allow-scripts allow-popups');
            iframe.setAttribute('loading', 'lazy');

            container.style.width = '100%';
        } else {
            const button = container.createEl('button', { text: 'Invalid Spotify URI' });
            button.disabled = true;
        }
    } else {
        const button = container.createEl('button', { text: 'Search on Spotify' });
        button.style.backgroundColor = '#191414';
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
}
