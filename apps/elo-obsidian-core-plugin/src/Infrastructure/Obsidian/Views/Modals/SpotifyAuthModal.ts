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
        step1.createEl('p', { text: 'Click the button below to open the validation page. You will be redirected to Google. Copy the URL from the address bar after the redirect.' });

        new Setting(step1)
            .addButton(btn => btn
                .setButtonText('Connect Spotify')
                .setCta()
                .onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText('Opening Browser...');

                    // Using google.com because user's dashboard has it whitelisted and localhost is restricted/missing.
                    const redirectUri = 'https://google.com';
                    const authUrl = await this.musicService.initiateConnection(redirectUri);

                    if (authUrl) {
                        window.open(authUrl);
                        showMessage('Browser opened. Please login and copy the code.');
                        // Re-enable after a delay in case they need to retry
                        setTimeout(() => {
                            btn.setDisabled(false);
                            btn.setButtonText('Connect Spotify (Retry)');
                        }, 5000);
                    } else {
                        showMessage('Failed to generate auth URL. Check Client ID.');
                        btn.setDisabled(false);
                        btn.setButtonText('Connect Spotify');
                    }
                }));

        const step2 = contentEl.createDiv({ cls: 'step-2' });
        step2.createEl('h3', { text: 'Step 2: Enter Code' });

        let code = '';

        new Setting(step2)
            .setName('Authorization Code')
            .setDesc('Paste the code or the full redirect URL here.')
            .addText(text => text
                .setPlaceholder('Paste code or URL...')
                .onChange(value => {
                    code = value.trim();
                    // Try to extract code from URL if present
                    try {
                        if (code.includes('code=')) {
                            const url = new URL(code);
                            const extracted = url.searchParams.get('code');
                            if (extracted) {
                                code = extracted;
                                // Optional: Update text field to show just the code, but might be jarring
                                // text.setValue(code); 
                            }
                        }
                    } catch (e) {
                        // Not a valid URL, treat as raw code
                    }
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
                        const redirectUri = 'https://google.com'; // Consistent with step 1

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
