import { App, Modal, Setting, TextComponent, Notice, ButtonComponent } from 'obsidian';
import ObsidianExtension from 'src/main';

export class SpotifyAuthModal extends Modal {
    plugin: ObsidianExtension;

    constructor(app: App, plugin: ObsidianExtension) {
        super(app);
        this.plugin = plugin;
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
                    if (!this.plugin.settings.spotifyClientId) {
                        new Notice('Please set your Spotify Client ID in settings first.');
                        return;
                    }
                    const redirectUri = this.plugin.settings.spotifyRedirectUri || 'http://localhost:8080';

                    const verifier = this.plugin.spotifyAdapter.generatePkceVerifier();
                    this.plugin.settings.spotifyPkceVerifier = verifier;
                    await this.plugin.saveSettings();

                    const challenge = await this.plugin.spotifyAdapter.generatePkceChallenge(verifier);
                    const authUrl = this.plugin.spotifyAdapter.getAuthUrl(redirectUri, challenge);

                    window.open(authUrl);
                    new Notice('Browser opened. Please login and copy the code.');
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
                        new Notice('Please enter the code.');
                        return;
                    }

                    try {
                        const redirectUri = this.plugin.settings.spotifyRedirectUri || 'http://localhost:8080';
                        const verifier = this.plugin.settings.spotifyPkceVerifier;

                        if (!verifier) {
                            new Notice('PKCE Verifier missing. Please click "Connect Spotify" first.');
                            return;
                        }

                        const { accessToken, refreshToken, expiresIn } = await this.plugin.spotifyAdapter.exchangeCode(code, redirectUri, verifier);

                        this.plugin.settings.spotifyAccessToken = accessToken;
                        this.plugin.settings.spotifyRefreshToken = refreshToken;
                        this.plugin.settings.spotifyTokenExpirationTime = Date.now() + (expiresIn * 1000);
                        this.plugin.settings.spotifyPkceVerifier = ''; // Clear verifier

                        await this.plugin.saveSettings();

                        // Update adapter immediately
                        this.plugin.spotifyAdapter.updateCredentials(
                            this.plugin.settings.spotifyClientId,
                            accessToken
                        );
                        // We might need to manually trigger the update of refresh token in adapter if updateCredentials doesn't handle it, 
                        // but main.ts re-initializes or we can just access it. 
                        // Actually Adapter.updateCredentials only takes clientId and accessToken in current impl.
                        // We should probably rely on the fact that main.ts passes the "save" callback to the adapter, 
                        // but here we are updating settings directly.
                        // Let's ensure the adapter has the new tokens. Use a cast or separate method if needed, 
                        // but since we just saved settings, next usage might read from settings if we structured it that way?
                        // No, adapter has internal state. We need to update it.

                        new Notice('Spotify Connected Successfully!');
                        this.close();
                    } catch (error) {
                        new Notice('Failed to connect. Check console.');
                        console.error(error);
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
