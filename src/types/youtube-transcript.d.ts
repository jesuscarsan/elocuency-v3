declare module 'youtube-transcript' {
  export type YoutubeTranscriptItem = {
    text: string;
    duration?: number;
    offset?: number;
    start?: number;
  };

  export class YoutubeTranscript {
    static fetchTranscript(videoId: string): Promise<YoutubeTranscriptItem[]>;
  }
}
