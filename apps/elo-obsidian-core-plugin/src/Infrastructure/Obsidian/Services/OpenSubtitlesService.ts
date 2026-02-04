import { requestUrl, RequestUrlParam } from 'obsidian';

export interface OpenSubtitlesSettings {
    apiKey: string;
    username: string;
    password: string;
}

export interface Subtitle {
    id: string; // file_id
    attributes: {
        language: string;
        format: string;
        url: string; // download link
        files: {
            file_id: number;
            file_name: string;
        }[];
    };
}

export class OpenSubtitlesService {
    private baseUrl = 'https://api.opensubtitles.com/api/v1';
    private token: string | null = null;

    constructor(private settings: OpenSubtitlesSettings) { }

    private async login(): Promise<void> {
        if (!this.settings.apiKey || !this.settings.username || !this.settings.password) {
            throw new Error('OpenSubtitles credentials are missing in settings.');
        }

        const response = await requestUrl({
            url: `${this.baseUrl}/login`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Api-Key': this.settings.apiKey,
            },
            body: JSON.stringify({
                username: this.settings.username,
                password: this.settings.password,
            }),
        });

        if (response.status !== 200) {
            throw new Error(`OpenSubtitles Login Failed: ${response.text}`);
        }

        this.token = response.json.token;
    }

    private async getAuthHeaders(): Promise<Record<string, string>> {
        if (!this.token) {
            await this.login();
        }
        return {
            'Content-Type': 'application/json',
            'Api-Key': this.settings.apiKey,
            'Authorization': `Bearer ${this.token}`,
        };
    }

    /**
     * Search for English subtitles for a specific episode.
     */
    async search(query: string, season: number, episode: number): Promise<Subtitle[]> {
        const headers = await this.getAuthHeaders();

        // languages=en for English
        const params = new URLSearchParams({
            query: query,
            season_number: season.toString(),
            episode_number: episode.toString(),
            languages: 'en',
        });

        const url = `${this.baseUrl}/subtitles?${params.toString()}`;

        const response = await requestUrl({
            url: url,
            method: 'GET',
            headers: headers,
        });

        if (response.status !== 200) {
            console.error('OpenSubtitles Search Failed', response);
            return [];
        }

        return response.json.data || [];
    }

    async download(fileId: number): Promise<string> {
        const headers = await this.getAuthHeaders();

        const response = await requestUrl({
            url: `${this.baseUrl}/download`,
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                file_id: fileId,
            }),
        });

        if (response.status !== 200) {
            throw new Error(`OpenSubtitles Download Step 1 Failed: ${response.text}`);
        }

        const downloadUrl = response.json.link;

        // Fetch the actual file content
        const fileResponse = await requestUrl({
            url: downloadUrl,
            method: 'GET',
        });

        return fileResponse.text;
    }
}
