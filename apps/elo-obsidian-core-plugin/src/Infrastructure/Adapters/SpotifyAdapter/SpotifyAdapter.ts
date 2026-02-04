import { requestUrl, RequestUrlParam } from 'obsidian';
import { MusicProviderPort, MusicTrack, MusicPlaylist, MusicArtist } from "@elo/core";

export interface SpotifyTrack {
    uri: string;
    name: string;
    artists: string[];
    album: string;
}

// Local interface can be removed if strictly using MusicArtist, or kept if needed for internal specific fields not in MusicArtist.
// But since MusicArtist covers it, let's just use MusicArtist.
// We'll remove SpotifyArtist definition and usage.

export interface SpotifyPlaylist {
    uri: string;
    name: string;
    id: string;
    tracks: {
        total: number;
    };
}

export class SpotifyAdapter implements MusicProviderPort {
    private clientId: string;
    private accessToken: string;
    private refreshToken: string;
    private tokenExpirationTime: number;
    private onTokenRefreshed: (token: string, expirationTime: number) => Promise<void>;
    private onAuthNeeded: () => void;

    constructor(
        clientId: string,
        accessToken: string,
        refreshToken: string = '',
        tokenExpirationTime: number = 0,
        onTokenRefreshed: (token: string, expirationTime: number) => Promise<void> = async () => { },
        onAuthNeeded: () => void = () => { }
    ) {
        this.clientId = clientId;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.tokenExpirationTime = tokenExpirationTime;
        this.onTokenRefreshed = onTokenRefreshed;
        this.onAuthNeeded = onAuthNeeded;
    }

    public updateCredentials(clientId: string, accessToken: string) {
        this.clientId = clientId;
        this.accessToken = accessToken;
    }

    public isAuthenticated(): boolean {
        // If we have an access token and it is not expired (with buffer), we are good.
        if (this.accessToken && this.tokenExpirationTime > Date.now()) {
            return true;
        }
        // If we have a refresh token, we can considered "potentially authenticated" 
        // because we can get a new token.
        // However, if the intention is "ready to request immediately without user interaction",
        // then having a refresh token is enough assuming refresh works.
        // BUT, if refresh fails, we are not authenticated.

        // Let's say: Authenticated if we have EITHER a valid access token OR a refresh token.
        if (this.refreshToken) {
            return true;
        }

        return false;
    }

    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken) {
            console.warn('Cannot refresh Spotify token: No refresh token available.');
            return;
        }

        const params = new URLSearchParams({
            client_id: this.clientId,
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
        });

        try {
            const response = await requestUrl({
                url: 'https://accounts.spotify.com/api/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            if (response.status === 200) {
                const data = response.json;
                this.accessToken = data.access_token;
                // Expiration is usually 3600 seconds (1 hour)
                this.tokenExpirationTime = Date.now() + (data.expires_in * 1000);

                await this.onTokenRefreshed(this.accessToken, this.tokenExpirationTime);
                console.log('Spotify access token refreshed successfully.');
            } else {
                console.error(`Failed to refresh Spotify token: ${response.status} - ${response.text}`);
                throw new Error(`Token refresh failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Error refreshing Spotify token:', error);
            this.onAuthNeeded();
            throw error;
        }
    }

    getAuthUrl(redirectUri: string, challenge: string): string {
        const scopes = 'user-read-private user-read-email playlist-read-private user-library-read';
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: scopes,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            show_dialog: 'true'
        });
        return `https://accounts.spotify.com/authorize?${params.toString()}`;
    }

    async generateAuthUrl(redirectUri: string, options?: any): Promise<string> {
        const challenge = options?.challenge || '';
        return this.getAuthUrl(redirectUri, challenge);
    }

    public async exchangeCode(code: string, redirectUri: string, verifier: string): Promise<{ accessToken: string, refreshToken: string, expiresIn: number }> {
        const params = new URLSearchParams({
            client_id: this.clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
        });

        const response = await requestUrl({
            url: 'https://accounts.spotify.com/api/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (response.status === 200) {
            const data = response.json;
            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token; // Capture refresh token

            // Calculate absolute expiration time
            const expiresIn = data.expires_in;

            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresIn: expiresIn
            };
        } else {
            throw new Error(`Token exchange failed: ${response.status} - ${response.text}`);
        }
    }

    public generatePkceVerifier(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let text = '';
        for (let i = 0; i < 128; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public async generatePkceChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const base64 = btoa(String.fromCharCode.apply(null, hashArray))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        return base64;
    }

    private async request<T>(url: string, method: string = 'GET', body?: any): Promise<T> {
        // Check for token expiration (add a 5-minute buffer)
        if (this.refreshToken && this.tokenExpirationTime && Date.now() > (this.tokenExpirationTime - 5 * 60 * 1000)) {
            console.log('Spotify token expired or about to expire. Refreshing...');
            await this.refreshAccessToken();
        }

        if (!this.accessToken) {
            throw new Error('Spotify access token is missing.');
        }

        const params: RequestUrlParam = {
            url: url,
            method: method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            params.body = JSON.stringify(body);
        }

        try {
            const response = await requestUrl(params);
            if (response.status >= 200 && response.status < 300) {
                return response.json as T;
            } else {
                throw new Error(`Spotify API Error: ${response.status} - ${response.text}`);
            }
        } catch (error) {
            console.error('Spotify API Request Failed:', error);
            throw error;
        }
    }

    public async searchTracks(query: string): Promise<MusicTrack[]> {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
        const response = await this.request<any>(url);

        return response.tracks.items.map((item: any) => ({
            id: item.id,
            uri: item.uri,
            name: item.name,
            artists: item.artists.map((artist: any) => artist.name),
            album: item.album.name
        }));
    }

    public async getUserPlaylists(): Promise<MusicPlaylist[]> {
        const url = 'https://api.spotify.com/v1/me/playlists?limit=50';
        const response = await this.request<any>(url);

        return response.items.map((item: any) => ({
            uri: item.uri,
            name: item.name,
            id: item.id,
            totalTracks: item.tracks.total
        }));
    }

    public async getPlaylistTracks(playlistId: string): Promise<MusicTrack[]> {
        const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
        const response = await this.request<any>(url);

        return response.items.map((item: any) => ({
            id: item.track.id,
            uri: item.track.uri,
            name: item.track.name,
            artists: item.track.artists.map((artist: any) => artist.name),
            album: item.track.album.name
        }));
    }

    public async searchArtists(query: string): Promise<MusicArtist[]> {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=5`;
        const response = await this.request<any>(url);

        return response.artists.items.map((item: any) => ({
            uri: item.uri,
            name: item.name,
            popularity: item.popularity,
            genres: item.genres,
            images: item.images
        }));
    }
}
