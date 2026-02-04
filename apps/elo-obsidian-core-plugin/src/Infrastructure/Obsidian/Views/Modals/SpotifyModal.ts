import { App, Modal, Setting, Notice } from 'obsidian';
import { MusicService } from '@/Application/Services/MusicService';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

export class SpotifyModal extends Modal {
    private musicService: MusicService;

    constructor(app: App, musicService: MusicService) {
        super(app);
        this.musicService = musicService;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Search Spotify Track' });

        let searchQuery = '';

        new Setting(contentEl)
            .setName('Search Query')
            .setDesc('Enter song name')
            .addText(text => text
                .setPlaceholder('Bohemian Rhapsody')
                .onChange(value => {
                    searchQuery = value;
                })
                .inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        this.performSearch(searchQuery, contentEl);
                    }
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Search')
                .setCta()
                .onClick(() => {
                    this.performSearch(searchQuery, contentEl);
                }));

        contentEl.createDiv({ cls: 'spotify-results-container' });
    }

    async performSearch(query: string, contentEl: HTMLElement) {
        if (!query) {
            showMessage('Please enter a search query');
            return;
        }

        const resultsContainer = contentEl.querySelector('.spotify-results-container');
        if (resultsContainer) {
            resultsContainer.empty();
            resultsContainer.createEl('p', { text: 'Searching...' });
        }

        try {
            const tracks = await this.musicService.searchTracks(query);

            if (resultsContainer) {
                resultsContainer.empty();

                if (tracks.length === 0) {
                    resultsContainer.createEl('p', { text: 'No results found.' });
                    return;
                }

                const list = resultsContainer.createEl('ul');
                list.style.listStyle = 'none';
                list.style.padding = '0';

                tracks.forEach(track => {
                    const item = list.createEl('li');
                    item.style.marginBottom = '10px';
                    item.style.padding = '10px';
                    item.style.border = '1px solid var(--background-modifier-border)';
                    item.style.borderRadius = '5px';
                    item.style.display = 'flex';
                    item.style.justifyContent = 'space-between';
                    item.style.alignItems = 'center';

                    const info = item.createDiv();
                    info.createEl('div', { text: track.name, cls: 'spotify-track-name' }).style.fontWeight = 'bold';
                    info.createEl('div', { text: `${track.artists.join(', ')} - ${track.album}`, cls: 'spotify-track-details' }).style.fontSize = '0.8em';

                    const copyBtn = item.createEl('button', { text: 'Copy URI' });
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(track.uri);
                        showMessage(`Copied ${track.uri} to clipboard`);
                        this.close();
                    });
                });
            }
        } catch (error) {
            showMessage('Error searching Spotify. Check console and settings.');
            console.error(error);
            if (resultsContainer) {
                resultsContainer.empty();
                resultsContainer.createEl('p', { text: 'Error occurred. Please check your API settings.' });
            }
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
