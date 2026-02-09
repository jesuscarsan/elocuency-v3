import type { LlmResponse, LlmPort, LlmParams } from '../../Domain/Ports/LlmPort';
export declare class GoogleGeminiAdapter implements LlmPort {
    private readonly apiKey;
    private cachedGeminiClient;
    constructor(apiKey: string);
    /**
     * Requests content enrichment based on a prompt, expecting a structured response with body and frontmatter.
     *
     * @param params - The parameters for the LLM request, including the prompt.
     * @returns A promise that resolves to an `LlmResponse` object containing the generated body and frontmatter, or `null` if the request fails or parsing errors occur.
     */
    requestEnrichment(params: LlmParams): Promise<LlmResponse | null>;
    /**
     * Sends a general request to the LLM and returns the response as a string.
     *
     * @param params - The parameters for the LLM request, including the prompt.
     * @returns A promise that resolves to the generated text content, or `null` if the request fails.
     */
    request(params: LlmParams): Promise<string | null>;
    /**
     * Sends a request to the LLM expecting a JSON response.
     *
     * @param params - The parameters for the LLM request, including the prompt.
     * @returns A promise that resolves to the parsed JSON object, or `null` if the request fails or parsing errors occur.
     */
    requestJson(params: LlmParams): Promise<any | null>;
    /**
     * Requests a brief summary of a streaming session.
     *
     * @param params - The parameters for the LLM request, including the prompt.
     * @returns A promise that resolves to the generated summary text, or `null` if the request fails.
     */
    requestStreamBrief(params: LlmParams): Promise<string | null>;
    /**
     * Internal method to handle the common logic for generating content from the Gemini API.
     *
     * @param prompt - The input prompt for the model.
     * @param config - The configuration object for the generation (e.g., temperature, mimeType).
     * @param errorContext - Optional context description for error messages (used to customize the API key missing message).
     * @returns A promise that resolves to the generated text, or `null` if the request fails.
     */
    private generate;
    /**
     * Lazily initializes and retrieves the Gemini client instance.
     *
     * @returns The initialized `GoogleGenAI` client.
     */
    private getGeminiClient;
    /**
     * Extracts the text content from the Gemini API response.
     *
     * @param response - The response object from the Gemini API.
     * @returns The extracted text content, or an empty string if no content is found.
     */
    private extractText;
    /**
     * Cleans the response text by removing Markdown code fences or extracting logic from JSON-like structures.
     *
     * @param text - The raw text response from the LLM.
     * @returns The cleaned text content.
     */
    private cleanResponse;
}
