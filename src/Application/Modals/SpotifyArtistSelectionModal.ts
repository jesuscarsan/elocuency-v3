
import { App, SuggestModal } from 'obsidian';
import { SpotifyArtist } from 'src/Infrastructure/Adapters/SpotifyAdapter/SpotifyAdapter';

export class SpotifyArtistSelectionModal extends SuggestModal<SpotifyArtist> {
    private artists: SpotifyArtist[];
    private onSelected: (artist: SpotifyArtist) => void;

    constructor(app: App, artists: SpotifyArtist[], onSelected: (artist: SpotifyArtist) => void) {
        super(app);
        this.artists = artists;
        this.onSelected = onSelected;
    }

    getSuggestions(query: string): SpotifyArtist[] {
        return this.artists.filter((artist) =>
            artist.name.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(artist: SpotifyArtist, el: HTMLElement) {
        console.log("artist", artist);
        const div = el.createDiv();
        div.createEl('b', { text: artist.name });
        div.createEl('br');
        const details = [];
        if (artist.genres && artist.genres.length > 0) {
            details.push(`Genres: ${artist.genres.slice(0, 3).join(', ')}`);
        }
        details.push(`Popularity: ${artist.popularity}`);
        div.createEl('small', { text: details.join(' | ') });
    }

    onChooseSuggestion(artist: SpotifyArtist, evt: MouseEvent | KeyboardEvent) {
        this.onSelected(artist);
    }
}
