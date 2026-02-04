import { Command, MarkdownView, App, Notice } from 'obsidian';
import { getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';
import { SpotifyAdapter } from "@/Infrastructure/Adapters/SpotifyAdapter/SpotifyAdapter";
import { SpotifyPlaylistModal } from "@/Infrastructure/Obsidian/Views/Modals/SpotifyPlaylistModal";
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { MusicService } from '@/Application/Services/MusicService';
import { MusicTrack } from "@elo/core";

import { CommandEnum } from "@elo/core";

export class ImportSpotifyPlaylistCommand implements Command {
    id: string = CommandEnum.ImportPlaylistTracks;
    name: string = 'Import Spotify Playlist';

    constructor(
        private app: App,
        private spotifyAdapter: SpotifyAdapter,
        private musicService: MusicService,
        private onAuthRequired: () => void
    ) { }

    checkCallback(checking: boolean): boolean | void {
        const view = getActiveMarkdownView(this.app);
        if (view) {
            if (!checking) {
                this.execute(view);
            }
            return true;
        }
        if (!checking) {
            new Notice('Please open a Markdown note (checklist) to import tracks.');
        }
        return false;
    }

    async execute(view: MarkdownView) {
        console.log('[ImportSpotifyPlaylistCommand] Start');

        if (!this.spotifyAdapter.isAuthenticated()) {
            this.onAuthRequired();
            console.log('[ImportSpotifyPlaylistCommand] End (Auth required)');
            return;
        }

        new SpotifyPlaylistModal(this.app, this.musicService, (tracks) => {
            this.importTracks(view, tracks);
        }).open();

        console.log('[ImportSpotifyPlaylistCommand] End');
    }

    private async importTracks(view: MarkdownView, tracks: MusicTrack[]) {
        if (!tracks || tracks.length === 0) {
            showMessage('No tracks to import.');
            return;
        }

        const editor = view.editor;
        const currentContent = editor.getValue();

        // Create checklist string with URI
        const trackList = tracks.map(track => {
            const artistNames = track.artists.join(', ');
            return `- [ ] ${track.name} - ${artistNames} (${track.uri})`;
        }).join('\n');

        // Append to the end of the file with a header if not present
        const header = '\n\n## Imported Spotify Tracks\n';
        const newContent = currentContent + header + trackList;

        editor.setValue(newContent);

        showMessage(`Imported ${tracks.length} tracks from Spotify.`);
    }
}
