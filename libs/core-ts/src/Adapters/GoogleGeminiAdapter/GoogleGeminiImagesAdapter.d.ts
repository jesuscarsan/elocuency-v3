export interface ImageContent {
    data: string;
    mimeType: string;
}
export interface ImageAnalysisResult {
    literal_transcription: string;
    analysis: string;
}
export declare class GoogleGeminiImagesAdapter {
    private readonly apiKey;
    private client;
    constructor(apiKey: string);
    private getClient;
    generateContentFromImages(images: ImageContent[], additionalPrompt?: string): Promise<ImageAnalysisResult | null>;
    generateEnrichmentFromImages(images: ImageContent[], promptTemplate: string): Promise<{
        body?: string;
        frontmatter?: Record<string, unknown>;
    } | null>;
}
