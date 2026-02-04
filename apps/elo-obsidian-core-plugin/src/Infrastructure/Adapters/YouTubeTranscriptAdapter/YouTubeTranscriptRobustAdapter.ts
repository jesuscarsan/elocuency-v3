import { requestUrl, RequestUrlResponse } from 'obsidian';
import type { YouTubeTranscriptPort, YouTubeTranscriptParams } from '@elo/core';

const RE_YOUTUBE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';
const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

export class YoutubeTranscriptError extends Error {
    constructor(message: string) {
        super(`[elo-obsidian-ext] 🚨 ${message}`);
    }
}

export class YoutubeTranscriptTooManyRequestError extends YoutubeTranscriptError {
    constructor() {
        super('YouTube is receiving too many requests from this IP and now requires solving a captcha to continue');
    }
}

export class YoutubeTranscriptVideoUnavailableError extends YoutubeTranscriptError {
    constructor(videoId: string) {
        super(`The video ${videoId} is unavailable`);
    }
}

export class YoutubeTranscriptDisabledError extends YoutubeTranscriptError {
    constructor(videoId: string) {
        super(`Transcript is disabled on video ${videoId}`);
    }
}

export class YoutubeTranscriptNotAvailableError extends YoutubeTranscriptError {
    constructor(videoId: string) {
        super(`No transcripts are available for video ${videoId}`);
    }
}

export class YoutubeTranscriptNotAvailableLanguageError extends YoutubeTranscriptError {
    constructor(lang: string, availableLangs: string[], videoId: string) {
        super(`No transcripts are available in ${lang} for video ${videoId}. Available languages: ${availableLangs.join(', ')}`);
    }
}

export class YoutubeTranscriptEmptyError extends YoutubeTranscriptError {
    constructor(videoId: string, method: string) {
        super(`Transcript processing returned empty result for video ${videoId} using ${method}`);
    }
}

interface TranscriptConfig {
    lang?: string;
    country?: string;
}

interface TranscriptResponse {
    text: string;
    duration: number;
    offset: number;
    lang?: string;
}

export class YouTubeTranscriptRobustAdapter implements YouTubeTranscriptPort {
    async fetchTranscript(params: YouTubeTranscriptParams): Promise<string | null> {
        try {
            const { videoId } = params;
            const config = { lang: 'es' }; // Defaulting to Spanish preference as in previous attempts

            const transcriptItems = await this.fetchTranscriptInternal(videoId, config);

            if (!transcriptItems || transcriptItems.length === 0) {
                return null;
            }

            return transcriptItems
                .map((item) => item.text)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

        } catch (error) {
            console.error('[elo-obsidian-ext] Error fetching transcript:', error);
            return null;
        }
    }

    private async fetchTranscriptInternal(videoId: string, config?: TranscriptConfig): Promise<TranscriptResponse[]> {
        try {
            return await this.fetchTranscriptWithHtmlScraping(videoId, config);
        } catch (e) {
            if (e instanceof YoutubeTranscriptEmptyError) {
                // Fallback to InnerTube API
                console.warn(`[elo-obsidian-ext] HTML scraping failed, trying InnerTube API for video ${videoId}`);
                return await this.fetchTranscriptWithInnerTube(videoId, config);
            } else {
                throw e;
            }
        }
    }

    private async fetchTranscriptWithHtmlScraping(videoId: string, config?: TranscriptConfig): Promise<TranscriptResponse[]> {
        const identifier = this.retrieveVideoId(videoId);
        const videoUrl = `https://www.youtube.com/watch?v=${identifier}`;

        const headers: Record<string, string> = {
            'User-Agent': USER_AGENT,
        };
        if (config?.lang) {
            headers['Accept-Language'] = config.lang;
        }

        const response = await requestUrl({
            url: videoUrl,
            headers: headers,
        });

        const videoPageBody = response.text;
        const splittedHTML = videoPageBody.split('"captions":');

        if (splittedHTML.length <= 1) {
            if (videoPageBody.includes('class="g-recaptcha"')) {
                throw new YoutubeTranscriptTooManyRequestError();
            }
            if (!videoPageBody.includes('"playabilityStatus":')) {
                throw new YoutubeTranscriptVideoUnavailableError(videoId);
            }
            throw new YoutubeTranscriptDisabledError(videoId);
        }

        const captions = (() => {
            try {
                return JSON.parse(splittedHTML[1].split(',"videoDetails')[0].replace('\n', ''));
            } catch (e) {
                return undefined;
            }
        })()?.playerCaptionsTracklistRenderer;

        const processedTranscript = await this.processTranscriptFromCaptions(captions, identifier, config);

        if (!processedTranscript.length) {
            throw new YoutubeTranscriptEmptyError(identifier, 'HTML scraping');
        }

        return processedTranscript;
    }

    private async fetchTranscriptWithInnerTube(videoId: string, config?: TranscriptConfig): Promise<TranscriptResponse[]> {
        const identifier = this.retrieveVideoId(videoId);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Origin': 'https://www.youtube.com',
            'Referer': `https://www.youtube.com/watch?v=${identifier}`,
            'User-Agent': USER_AGENT // Important to include UA here too
        };
        if (config?.lang) {
            headers['Accept-Language'] = config.lang;
        }

        const response = await requestUrl({
            url: 'https://www.youtube.com/youtubei/v1/player',
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.20250312.04.00', // Using version from library source
                        userAgent: USER_AGENT
                    }
                },
                videoId: identifier,
            }),
        });

        const body = response.json;
        const captions = body?.captions?.playerCaptionsTracklistRenderer;

        const processedTranscript = await this.processTranscriptFromCaptions(captions, identifier, config);

        if (!processedTranscript.length) {
            throw new YoutubeTranscriptEmptyError(identifier, 'InnerTube API');
        }

        return processedTranscript;
    }

    private async processTranscriptFromCaptions(captions: any, videoId: string, config?: TranscriptConfig): Promise<TranscriptResponse[]> {
        if (!captions) {
            throw new YoutubeTranscriptDisabledError(videoId);
        }

        if (!('captionTracks' in captions)) {
            throw new YoutubeTranscriptNotAvailableError(videoId);
        }

        if (
            config?.lang &&
            !captions.captionTracks.some((track: any) => track.languageCode === config.lang)
        ) {
            // Logic from library: if strict lang check was needed, it would throw.
            // But we might want to be lenient. The library throws:
            /*
            throw new YoutubeTranscriptNotAvailableLanguageError(
                config?.lang,
                captions.captionTracks.map((track: any) => track.languageCode),
                videoId
            );
            */
            // For this implementation, I'll fallback to default track if preferred isn't found, 
            // OR to English if Spanish isn't found, similar to the logic in the original simple adapter.
            // But to faithfully port the Robust logic, we should try to stick to preference.
            // Let's iterate: Try config lang, then 'en', then first available.
        }

        // Custom selection logic to be more useful than strict throwing
        let track = captions.captionTracks.find((t: any) => t.languageCode === config?.lang);
        if (!track) {
            track = captions.captionTracks.find((t: any) => t.languageCode === 'en');
        }
        if (!track) {
            track = captions.captionTracks[0];
        }

        const transcriptURL = track.baseUrl;

        const transcriptResponse = await requestUrl({
            url: transcriptURL,
            headers: {
                'User-Agent': USER_AGENT,
                ...(config?.lang ? { 'Accept-Language': config.lang } : {}),
            },
        });

        if (transcriptResponse.status < 200 || transcriptResponse.status >= 300) {
            throw new YoutubeTranscriptNotAvailableError(videoId);
        }

        const transcriptBody = transcriptResponse.text;
        const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];

        return results.map((result: any) => ({
            text: result[3],
            duration: parseFloat(result[2]),
            offset: parseFloat(result[1]),
            lang: track.languageCode,
        }));
    }

    private retrieveVideoId(videoId: string): string {
        if (videoId.length === 11) {
            return videoId;
        }
        const matchId = videoId.match(RE_YOUTUBE);
        if (matchId && matchId.length) {
            return matchId[1];
        }
        throw new YoutubeTranscriptError('Impossible to retrieve Youtube video ID.');
    }
}
