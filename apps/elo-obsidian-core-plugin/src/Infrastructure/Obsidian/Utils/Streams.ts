import type { YouTubeTranscriptPort } from '@elo/core';
import { YouTubeTranscriptAdapter } from 'src/Infrastructure/Adapters/YouTubeTranscriptAdapter/YouTubeTranscriptAdapter';
import { YouTubeTranscriptRobustAdapter } from 'src/Infrastructure/Adapters/YouTubeTranscriptAdapter/YouTubeTranscriptRobustAdapter';

const LOG_PREFIX = '[elo-obsidian-ext]';

type StreamProvider = 'youtube';

export async function getStreamTranscript(url: string): Promise<string | null> {
  const normalized = url?.trim();
  if (!normalized) {
    return null;
  }

  const parsedUrl = parseUrl(normalized);
  if (!parsedUrl) {
    return null;
  }

  const provider = detectProvider(parsedUrl);
  if (!provider) {
    return null;
  }

  switch (provider) {
    case 'youtube': {
      const videoId = extractYouTubeVideoId(parsedUrl);
      console.log({ videoId });
      if (!videoId) {
        console.warn(
          `${LOG_PREFIX} No se pudo determinar el identificador del vídeo de YouTube para ${normalized}.`,
        );
        return null;
      }

      return new YouTubeTranscriptRobustAdapter().fetchTranscript({ videoId });
    }
    default:
      return null;
  }
}

function parseUrl(candidate: string): URL | null {
  try {
    return new URL(candidate);
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} La URL proporcionada no es válida y se omitirá: ${candidate}.`,
      error,
    );
    return null;
  }
}

function detectProvider(url: URL): StreamProvider | null {
  const host = url.hostname.toLowerCase();
  if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be' ||
    host === 'www.youtu.be'
  ) {
    return 'youtube';
  }

  return null;
}

function extractYouTubeVideoId(url: URL): string | null {
  if (url.hostname.includes('youtu.be')) {
    const id = url.pathname.replace(/^\//, '').trim();
    return id || null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (url.searchParams.has('v')) {
    const id = url.searchParams.get('v')?.trim();
    if (id) {
      return id;
    }
  }

  if (pathSegments.length >= 2) {
    const [firstSegment, secondSegment] = pathSegments;
    if (
      firstSegment === 'embed' ||
      firstSegment === 'shorts' ||
      firstSegment === 'live'
    ) {
      return secondSegment.trim() || null;
    }
  }

  if (pathSegments.length === 1 && pathSegments[0] === 'watch') {
    const id = url.searchParams.get('v')?.trim();
    return id || null;
  }

  return null;
}
