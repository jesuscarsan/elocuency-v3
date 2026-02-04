import { SettingsPort } from "@elo/core";
import ObsidianExtension from '../Obsidian/main';

export class ObsidianSettingsAdapter implements SettingsPort {
    constructor(private plugin: ObsidianExtension) { }

    getSpotifyClientId(): string {
        return this.plugin.settings.spotifyClientId;
    }

    // getSpotifyClientSecret(): string {
    //     return this.plugin.settings.spotifyClientSecret;
    // }

    getSpotifyAccessToken(): string {
        return this.plugin.settings.spotifyAccessToken;
    }

    getSpotifyRefreshToken(): string {
        return this.plugin.settings.spotifyRefreshToken;
    }

    getSpotifyTokenExpirationTime(): number {
        return this.plugin.settings.spotifyTokenExpirationTime;
    }

    getSpotifyPkceVerifier(): string {
        return this.plugin.settings.spotifyPkceVerifier;
    }

    setSpotifyAccessToken(token: string): void {
        this.plugin.settings.spotifyAccessToken = token;
    }

    setSpotifyRefreshToken(token: string): void {
        this.plugin.settings.spotifyRefreshToken = token;
    }

    setSpotifyTokenExpirationTime(time: number): void {
        this.plugin.settings.spotifyTokenExpirationTime = time;
    }

    setSpotifyPkceVerifier(verifier: string): void {
        this.plugin.settings.spotifyPkceVerifier = verifier;
    }

    getGeminiRolesFolder(): string {
        return this.plugin.settings.geminiRolesFolder;
    }

    getUserLanguage(): string {
        return this.plugin.settings.userLanguage;
    }

    getToLearnLanguage(): string {
        return this.plugin.settings.toLearnLanguage;
    }

    setUserLanguage(lang: string): void {
        this.plugin.settings.userLanguage = lang;
    }

    setToLearnLanguage(lang: string): void {
        this.plugin.settings.toLearnLanguage = lang;
    }

    async saveSettings(): Promise<void> {
        await this.plugin.saveSettings();
    }
}
