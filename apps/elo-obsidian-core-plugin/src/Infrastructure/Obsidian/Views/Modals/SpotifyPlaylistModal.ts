import { App, Modal, Notice } from 'obsidian';
import { MusicService } from '@/Application/Services/MusicService';
import { MusicPlaylist, MusicTrack } from "@elo/core";
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

export class SpotifyPlaylistModal extends Modal {
    private musicService: MusicService;
    private playlists: MusicPlaylist[] = [];
    private selectedPlaylist: MusicPlaylist | null = null;
    private onImport?: (tracks: MusicTrack[]) => void;

    constructor(app: App, musicService: MusicService, onImport?: (tracks: MusicTrack[]) => void) {
        super(app);
        this.musicService = musicService;
        this.onImport = onImport;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Select a Playlist' });
        contentEl.createEl('p', { text: 'Loading playlists...' });

        try {
            this.playlists = await this.musicService.getUserPlaylists();
            this.displayPlaylists();
        } catch (error) {
            contentEl.empty();
            contentEl.createEl('h2', { text: 'Error' });
            contentEl.createEl('p', { text: 'Failed to load playlists. Please check your connection and settings.' });
            console.error(error);
        }
    }

    displayPlaylists() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Select a Playlist' });

        const list = contentEl.createEl('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';

        this.playlists.forEach(playlist => {
            const item = list.createEl('li');
            item.style.marginBottom = '10px';
            item.style.padding = '10px';
            item.style.border = '1px solid var(--background-modifier-border)';
            item.style.borderRadius = '5px';
            item.style.cursor = 'pointer';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';

            item.createDiv({ text: playlist.name, cls: 'spotify-playlist-name' }).style.fontWeight = 'bold';
            item.createDiv({ text: `${playlist.totalTracks} tracks`, cls: 'spotify-playlist-count' }).style.fontSize = '0.8em';

            item.addEventListener('click', () => {
                this.selectedPlaylist = playlist;
                this.displayTracks(playlist);
            });
        });
    }

    async displayTracks(playlist: MusicPlaylist) {
        const { contentEl } = this;
        contentEl.empty();

        const header = contentEl.createDiv();
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.marginBottom = '20px';

        const backBtn = header.createEl('button', { text: '← Back' });
        backBtn.style.marginRight = '10px';
        backBtn.addEventListener('click', () => this.displayPlaylists());

        header.createEl('h2', { text: playlist.name });

        contentEl.createEl('p', { text: 'Loading tracks...' });

        try {
            const tracks = await this.musicService.getPlaylistTracks(playlist.id);

            // Clear loading message
            contentEl.lastChild?.remove();

            if (tracks.length === 0) {
                contentEl.createEl('p', { text: 'No tracks found in this playlist.' });
                return;
            }

            const copyAllBtn = contentEl.createEl('button', { text: 'Copy All to Clipboard' });
            copyAllBtn.style.marginBottom = '15px';
            copyAllBtn.addEventListener('click', () => {
                const text = tracks.map(t => `${t.artists.join(', ')} - ${t.name}`).join('\n');
                navigator.clipboard.writeText(text);
                showMessage('Copied all tracks to clipboard');
                this.close();
            });

            if (this.onImport) {
                const importBtn = contentEl.createEl('button', { text: 'Import to Note' });
                importBtn.style.marginBottom = '15px';
                importBtn.style.marginLeft = '10px';
                importBtn.classList.add('mod-cta'); // Make it look like a primary action
                importBtn.addEventListener('click', () => {
                    this.onImport!(tracks);
                    this.close();
                });
            }

            const list = contentEl.createEl('ul');
            list.style.listStyle = 'none';
            list.style.padding = '0';

            tracks.forEach(track => {
                const item = list.createEl('li');
                item.style.marginBottom = '5px';
                item.style.padding = '5px';
                item.style.borderBottom = '1px solid var(--background-modifier-border)';
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';

                const info = item.createDiv();
                info.createEl('span', { text: track.name }).style.fontWeight = 'bold';
                info.createEl('span', { text: ` - ${track.artists.join(', ')}` });
            });

        } catch (error) {
            contentEl.empty();
            contentEl.createEl('h2', { text: 'Error' });
            contentEl.createEl('p', { text: 'Failed to load tracks.' });
            console.error(error);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
