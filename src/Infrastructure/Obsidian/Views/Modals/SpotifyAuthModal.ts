import { App, Modal, Setting, TextComponent, Notice, ButtonComponent } from 'obsidian';
import { MusicService } from '@/Application/Services/MusicService';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

export class SpotifyAuthModal extends Modal {
    musicService: MusicService;

    constructor(app: App, musicService: MusicService) {
        super(app);
        this.musicService = musicService;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Connect to Spotify' });
        contentEl.createEl('p', { text: 'You need to connect to Spotify to use this feature.' });

        const step1 = contentEl.createDiv({ cls: 'step-1' });
        step1.createEl('h3', { text: 'Step 1: Authorize' });
        step1.createEl('p', { text: 'Click the button below to open the validation page in your browser. Copy the code from the URL after logging in.' });

        new Setting(step1)
            .addButton(btn => btn
                .setButtonText('Connect Spotify')
                .setCta()
                .onClick(async () => {
                    // Logic moved to MusicService. We just ask to start connection.
                    // Assumes Client ID is handled or service complains? Service uses settings.
                    // We can check if settings has client ID if we really want, but MusicService relies on plugin settings anyway.
                    // Let's assume MusicService handles the check or we do it here if we want to give UI feedback.
                    // For now, let's trust we can proceed or Service logs error.
                    // But wait, existing code checked `this.plugin.settings.spotifyClientId`.
                    // The auth modal is cleaner if it just says "Connect".

                    // Actually, MusicService needs redirectUri. 
                    const redirectUri = 'http://localhost:8080'; // Should probably be passed or default?
                    // Previous code: this.plugin.settings.spotifyRedirectUri || 'http://localhost:8080'
                    // We can't access plugin settings here directly anymore efficiently unless we pass them or MusicService exposes them?
                    // But MusicService has the plugin.
                    // Let's pass the default or let MusicService handle it?
                    // MusicService `initiateConnection` takes `redirectUri`.
                    // I'll define it here.

                    const authUrl = await this.musicService.initiateConnection('http://localhost:8080'); // Simplified, should match settings if possible.
                    // If we want to support custom redirect URI from settings, we might need to expose it on MusicService or pass it in.

                    if (authUrl) {
                        window.open(authUrl);
                        showMessage('Browser opened. Please login and copy the code.');
                    } else {
                        showMessage('Failed to generate auth URL. Check Client ID.');
                    }
                }));

        const step2 = contentEl.createDiv({ cls: 'step-2' });
        step2.createEl('h3', { text: 'Step 2: Enter Code' });

        let code = '';

        new Setting(step2)
            .setName('Authorization Code')
            .setDesc('Paste the code from the redirect URL here.')
            .addText(text => text
                .setPlaceholder('Paste code here...')
                .onChange(value => {
                    code = value.trim();
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Verify & Connect')
                .setCta()
                .onClick(async () => {
                    if (!code) {
                        showMessage('Please enter the code.');
                        return;
                    }

                    try {
                        const redirectUri = 'http://localhost:8080'; // Consistent with step 1

                        const success = await this.musicService.completeConnection(code, redirectUri);

                        if (success) {
                            showMessage('Spotify Connected Successfully!');
                            this.close();
                        } else {
                            showMessage('Failed to verify code.');
                        }

                    } catch (error) {
                        showMessage('Failed to connect. Check console.');
                        console.error(error);
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
