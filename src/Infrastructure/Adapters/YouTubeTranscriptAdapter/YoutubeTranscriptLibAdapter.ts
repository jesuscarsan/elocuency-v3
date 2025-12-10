import { YoutubeTranscript } from '@danielxceron/youtube-transcript';
import type {
    YouTubeTranscriptParams,
    YouTubeTranscriptPort,
} from 'src/Domain/Ports/YouTubeTranscriptPort';

const LOG_PREFIX = '[elo-obsidian-ext]';

export class YouTubeTranscriptLibAdapter implements YouTubeTranscriptPort {
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

        try {
            const segments = await YoutubeTranscript.fetchTranscript(trimmedId);
            if (!Array.isArray(segments) || segments.length === 0) {
                console.warn(
                    `${LOG_PREFIX} YoutubeTranscript no devolvió segmentos para el vídeo ${trimmedId}.`,
                );
                return '';
            }

            const transcript = segments
                .map((segment) =>
                    typeof segment?.text === 'string' ? segment.text.trim() : '',
                )
                .filter(Boolean)
                .join(' ')
                .trim();

            return transcript;
        } catch (error) {
            console.error(
                `${LOG_PREFIX} Error al obtener la transcripción para el vídeo ${trimmedId}.`,
                error,
            );
            return null;
        }
    }
}
