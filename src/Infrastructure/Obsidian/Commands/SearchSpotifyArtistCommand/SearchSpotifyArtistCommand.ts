import { Command, Editor, MarkdownView, Notice, TFile, App } from 'obsidian';
import { SpotifyAdapter } from "@/Infrastructure/Adapters/SpotifyAdapter/SpotifyAdapter";
import { MusicArtist } from "@/Infrastructure/../Domain/Ports/MusicProviderPort";
import { SpotifyArtistSelectionModal } from "@/Infrastructure/Obsidian/Views/Modals/SpotifyArtistSelectionModal";
import { FrontmatterKeys } from "@/Infrastructure/../Domain/Constants/FrontmatterRegistry";

export class SearchSpotifyArtistCommand implements Command {
    id: string = 'search-spotify-artist';
    name: string = 'Search Spotify Artist';

    constructor(
        private app: App,
        private spotifyAdapter: SpotifyAdapter,
        private onAuthRequired: () => void
    ) { }

    checkCallback(checking: boolean): boolean | void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            if (!checking) {
                this.execute(view);
            }
            return true;
        }
        return false;
    }

    async execute(view: MarkdownView) {
        if (!this.spotifyAdapter.isAuthenticated()) {
            this.onAuthRequired();
            return;
        }

        const file = view.file;
        if (!file) return;

        // Use the file basename as the query, assuming the note name is the artist name
        const query = file.basename;

        new Notice(`Searching for artist: ${query}...`);

        try {
            const artists = await this.spotifyAdapter.searchArtists(query);

            if (artists.length === 0) {
                new Notice('No artists found on Spotify.');
                return;
            }

            if (artists.length === 1) {
                this.updateFrontmatter(file, artists[0]);
                new Notice(`Spotify artist data updated for: ${artists[0].name}`);
            } else {
                new SpotifyArtistSelectionModal(view.app, artists, (selectedArtist) => {
                    this.updateFrontmatter(file, selectedArtist);
                    new Notice(`Spotify artist data updated for: ${selectedArtist.name}`);
                }).open();
            }

        } catch (error) {
            console.error(error);
            new Notice('Error searching Spotify actions.');
        }
    }

    private async updateFrontmatter(file: TFile, artist: MusicArtist) {
        await this.app.fileManager.processFrontMatter(file, (frontmatter: any) => {
            frontmatter[FrontmatterKeys.SpotifyUri] = artist.uri;
            frontmatter[FrontmatterKeys.EstilosMusicales] = artist.genres;
            frontmatter[FrontmatterKeys.ImagenesUrls] = artist.images ? artist.images.map((img) => img.url) : [];
            frontmatter[FrontmatterKeys.SpotifyPopularity] = artist.popularity;
        });

        if (file.basename !== artist.name) {
            const parentPath = file.parent ? file.parent.path : '';
            const newPath = (parentPath === '/' ? '' : parentPath + '/') + artist.name + ".md";
            try {
                await this.app.fileManager.renameFile(file, newPath);
                new Notice(`Renamed note to: ${artist.name}`);
            } catch (error) {
                console.error("Failed to rename file:", error);
                new Notice(`Failed to rename note to ${artist.name}. File might already exist.`);
            }
        }
    }
}
