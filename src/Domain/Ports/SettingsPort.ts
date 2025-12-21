export interface SettingsPort {
    getSpotifyClientId(): string;
    // getSpotifyClientSecret(): string; // Removed as it is not in settings
    getSpotifyAccessToken(): string;
    getSpotifyRefreshToken(): string;
    getSpotifyTokenExpirationTime(): number;
    getSpotifyPkceVerifier(): string;

    setSpotifyAccessToken(token: string): void;
    setSpotifyRefreshToken(token: string): void;
    setSpotifyTokenExpirationTime(time: number): void;
    setSpotifyPkceVerifier(verifier: string): void;

    getGeminiRolesFolder(): string;

    saveSettings(): Promise<void>;
}
