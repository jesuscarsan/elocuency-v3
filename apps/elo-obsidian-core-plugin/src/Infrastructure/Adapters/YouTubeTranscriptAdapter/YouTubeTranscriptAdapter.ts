import { requestUrl } from 'obsidian';
import type {
  YouTubeTranscriptParams,
  YouTubeTranscriptPort,
} from '@elo/core';

const LOG_PREFIX = '[elo-obsidian-ext]';

export class YouTubeTranscriptAdapter implements YouTubeTranscriptPort {
  async fetchTranscript(
    params: YouTubeTranscriptParams,
  ): Promise<string | null> {
    const trimmedId = params.videoId.trim();
    if (!trimmedId) {
      console.warn(
        `${LOG_PREFIX} Transcript request omitted: el identificador del vídeo está vacío.`,
      );
      return null;
    }

    console.log(`${LOG_PREFIX} Fetching transcript for video: ${trimmedId}`);

    try {
      const videoPageResponse = await requestUrl({
        url: `https://www.youtube.com/watch?v=${trimmedId}`,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        },
      });

      const videoPageBody = videoPageResponse.text;
      console.log(`${LOG_PREFIX} Video page fetched. Length: ${videoPageBody.length}`);

      const captionsUrl = this.extractCaptionsUrl(videoPageBody);
      if (!captionsUrl) {
        console.warn(
          `${LOG_PREFIX} No se encontraron subtítulos para el vídeo ${trimmedId}.`,
        );
        // Dump a small part of the body to see if we are getting a consent page or something else
        console.log(`${LOG_PREFIX} Body preview: ${videoPageBody.substring(0, 500)}`);
        return null;
      }

      console.log(`${LOG_PREFIX} Captions URL found: ${captionsUrl}`);

      const transcriptResponse = await requestUrl({
        url: captionsUrl,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        },
      });
      console.log(`${captionsUrl} Transcript response:`, transcriptResponse);
      const transcriptXml = transcriptResponse.text;

      console.log(`${LOG_PREFIX} Transcript XML fetched. Length: ${transcriptXml.length}`);
      console.log(`${LOG_PREFIX} Transcript XML preview: ${transcriptXml.substring(0, 500)}`);

      const transcript = this.parseTranscriptXml(transcriptXml);
      console.log(`${LOG_PREFIX} Transcript parsed. Length: ${transcript.length}`);

      return transcript;
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Error al obtener la transcripción para el vídeo ${trimmedId}.`,
        error,
      );
      return null;
    }
  }

  private extractCaptionsUrl(html: string): string | null {
    if (!html.includes('"captions":')) {
      console.log(`${LOG_PREFIX} "captions": string not found in HTML`);
      return null;
    }

    const splittedHtml = html.split('"captions":');
    if (splittedHtml.length <= 1) {
      console.log(`${LOG_PREFIX} Split by "captions": failed`);
      return null;
    }

    const captionsJson = splittedHtml[1].split(',"videoDetails')[0];
    let captions;
    try {
      captions = JSON.parse(
        captionsJson.replace('\n', ''),
      ).playerCaptionsTracklistRenderer;
    } catch (e) {
      console.error(`${LOG_PREFIX} Error parsing captions JSON`, e);
      return null;
    }

    if (!captions) {
      console.log(`${LOG_PREFIX} playerCaptionsTracklistRenderer not found in JSON`);
      return null;
    }

    if (!captions.captionTracks || captions.captionTracks.length === 0) {
      console.log(`${LOG_PREFIX} No captionTracks found`);
      return null;
    }

    console.log(`${LOG_PREFIX} Found ${captions.captionTracks.length} caption tracks`);

    // Preferencia por español, luego inglés, luego el primero disponible
    const track =
      captions.captionTracks.find((t: any) => t.languageCode === 'es') ||
      captions.captionTracks.find((t: any) => t.languageCode === 'en') ||
      captions.captionTracks[0];

    return track.baseUrl;
  }

  private parseTranscriptXml(xml: string): string {
    // Simple regex parser for the XML format returned by YouTube
    // <text start="0.2" dur="3.4">Hello world</text>
    const regex = /<text[^>]*>(.*?)<\/text>/g;
    let match;
    const lines: string[] = [];

    while ((match = regex.exec(xml)) !== null) {
      if (match[1]) {
        // Decode HTML entities
        const text = match[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        lines.push(text);
      }
    }

    return lines.join(' ').trim();
  }
}
