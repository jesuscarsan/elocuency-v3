import { requestUrl, RequestUrlParam } from 'obsidian';

export interface SpotifyTrack {
    uri: string;
    name: string;
    artists: string[];
    album: string;
}

export interface SpotifyPlaylist {
    uri: string;
    name: string;
    id: string;
    tracks: {
        total: number;
    };
}

export class SpotifyAdapter {
    private clientId: string;
    private accessToken: string;

    constructor(clientId: string, accessToken: string) {
        this.clientId = clientId;
        this.accessToken = accessToken;
    }

    public updateCredentials(clientId: string, accessToken: string) {
        this.clientId = clientId;
        this.accessToken = accessToken;
    }

    public getAuthUrl(redirectUri: string, challenge: string): string {
        const scopes = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative';
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

    public async exchangeCode(code: string, redirectUri: string, verifier: string): Promise<string> {
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
            return data.access_token;
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

    public async searchTracks(query: string): Promise<SpotifyTrack[]> {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
        const response = await this.request<any>(url);

        return response.tracks.items.map((item: any) => ({
            uri: item.uri,
            name: item.name,
            artists: item.artists.map((artist: any) => artist.name),
            album: item.album.name
        }));
    }

    public async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
        const url = 'https://api.spotify.com/v1/me/playlists?limit=50';
        const response = await this.request<any>(url);

        return response.items.map((item: any) => ({
            uri: item.uri,
            name: item.name,
            id: item.id,
            tracks: {
                total: item.tracks.total
            }
        }));
    }

    public async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
        const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
        const response = await this.request<any>(url);

        return response.items.map((item: any) => ({
            uri: item.track.uri,
            name: item.track.name,
            artists: item.track.artists.map((artist: any) => artist.name),
            album: item.track.album.name
        }));
    }
}
