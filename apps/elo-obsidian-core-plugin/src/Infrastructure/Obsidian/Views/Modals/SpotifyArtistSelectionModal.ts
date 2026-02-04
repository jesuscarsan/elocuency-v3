import { App, SuggestModal } from 'obsidian';
import { MusicArtist } from '@elo/core';

export class SpotifyArtistSelectionModal extends SuggestModal<MusicArtist> {
    private artists: MusicArtist[];
    private onSelected: (artist: MusicArtist) => void;

    constructor(app: App, artists: MusicArtist[], onSelected: (artist: MusicArtist) => void) {
        super(app);
        this.artists = artists;
        this.onSelected = onSelected;
    }

    getSuggestions(query: string): MusicArtist[] {
        return this.artists.filter((artist) =>
            artist.name.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(artist: MusicArtist, el: HTMLElement) {
        // console.log("artist", artist);
        const div = el.createDiv();
        div.createEl('b', { text: artist.name });
        div.createEl('br');
        const details = [];
        if (artist.genres && artist.genres.length > 0) {
            details.push(`Genres: ${artist.genres.slice(0, 3).join(', ')}`);
        }
        if (artist.popularity !== undefined) {
            details.push(`Popularity: ${artist.popularity}`);
        }
        div.createEl('small', { text: details.join(' | ') });
    }

    onChooseSuggestion(artist: MusicArtist, evt: MouseEvent | KeyboardEvent) {
        this.onSelected(artist);
    }
}
