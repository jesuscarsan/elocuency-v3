import { MusicProviderPort, MusicTrack, MusicPlaylist } from "@elo/core";
import { SettingsPort } from "@elo/core";

export class MusicService {
    constructor(
        private provider: MusicProviderPort,
        private settings: SettingsPort
    ) { }

    isAuthenticated(): boolean {
        return this.provider.isAuthenticated();
    }

    async initiateConnection(redirectUri: string): Promise<string> {
        let options: any = {};

        // Handle PKCE generation if provider supports it/needs it
        if (this.provider.generatePkceVerifier && this.provider.generatePkceChallenge) {
            const verifier = this.provider.generatePkceVerifier();
            this.settings.setSpotifyPkceVerifier(verifier); // Persist verifier
            await this.settings.saveSettings();

            const challenge = await this.provider.generatePkceChallenge(verifier);
            options = { challenge };
        }

        return await this.provider.generateAuthUrl(redirectUri, options);
    }

    async completeConnection(code: string, redirectUri: string): Promise<boolean> {
        try {
            const verifier = this.settings.getSpotifyPkceVerifier();
            const { accessToken, refreshToken, expiresIn } = await this.provider.exchangeCode(code, redirectUri, verifier);

            this.settings.setSpotifyAccessToken(accessToken);
            this.settings.setSpotifyRefreshToken(refreshToken);
            this.settings.setSpotifyTokenExpirationTime(Date.now() + (expiresIn * 1000));
            this.settings.setSpotifyPkceVerifier('');

            await this.settings.saveSettings();

            this.provider.updateCredentials(this.settings.getSpotifyClientId(), accessToken);
            return true;
        } catch (error) {
            console.error('MusicService: Connection failed', error);
            return false;
        }
    }

    async searchTracks(query: string): Promise<MusicTrack[]> {
        if (!this.isAuthenticated()) return [];
        return await this.provider.searchTracks(query);
    }

    async getUserPlaylists(): Promise<MusicPlaylist[]> {
        if (!this.isAuthenticated()) return [];
        return await this.provider.getUserPlaylists();
    }

    async getPlaylistTracks(playlistId: string): Promise<MusicTrack[]> {
        if (!this.isAuthenticated()) return [];
        return await this.provider.getPlaylistTracks(playlistId);
    }
}
