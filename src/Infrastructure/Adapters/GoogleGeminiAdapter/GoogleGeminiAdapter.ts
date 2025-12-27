import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { showMessage } from 'src/Infrastructure/Obsidian/Utils/Messages';
import type {
  LlmResponse,
  LlmPort,
  LlmParams,
} from 'src/Domain/Ports/LlmPort';

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const GEMINI_JSON_GENERATION_CONFIG = {
  temperature: 0.4,
  // maxOutputTokens: 10000,
  responseMimeType: 'application/json',
};
const GEMINI_SUMMARY_GENERATION_CONFIG = {
  temperature: 0.35,
};

export class GoogleGeminiAdapter implements LlmPort {
  private readonly apiKey: string;
  private cachedGeminiClient: GoogleGenAI | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async requestEnrichment(params: LlmParams): Promise<LlmResponse | null> {
    const { prompt } = params;
    console.log('Prompt:', prompt);
    if (!this.apiKey) {
      showMessage(
        'Configura tu clave de la API de Gemini en los ajustes para completar la plantilla automáticamente.',
      );
      return null;
    }

    try {
      const client = this.getGeminiClient();
      const response = await client.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        config: GEMINI_JSON_GENERATION_CONFIG,
      });

      const rawText = this.extractText(response);

      if (!rawText) {
        return null;
      }

      const cleanText = this.cleanResponse(rawText);

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanText);
      } catch (parseError) {
        console.error(
          'Gemini response could not be parsed as JSON',
          cleanText,
          parseError,
        );
        return null;
      }

      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const parsedRecord = parsed as Record<string, unknown>;
      const body =
        typeof parsedRecord.body === 'string'
          ? parsedRecord.body.trim()
          : undefined;
      const frontmatterValue = parsedRecord.frontmatter;
      const frontmatter =
        frontmatterValue &&
          typeof frontmatterValue === 'object' &&
          !Array.isArray(frontmatterValue)
          ? (frontmatterValue as Record<string, unknown>)
          : undefined;

      return {
        body,
        frontmatter,
      };
    } catch (error) {
      console.error('Failed to request Gemini enrichment', error);
      showMessage(
        'Gemini no respondió. Consulta la consola para más detalles.',
      );
      return null;
    }
  }

  async request(params: LlmParams): Promise<string | null> {
    const { prompt } = params;
    if (!this.apiKey) {
      showMessage('Configura tu clave de la API de Gemini en los ajustes.');
      return null;
    }

    try {
      const client = this.getGeminiClient();
      const response = await client.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        config: GEMINI_SUMMARY_GENERATION_CONFIG,
      });

      const rawText = this.extractText(response).trim();
      return rawText || null;
    } catch (error) {
      console.error('Failed to request Gemini', error);
      showMessage(
        'Gemini no respondió. Consulta la consola para más detalles.',
      );
      return null;
    }
  }

  async requestJson(params: LlmParams): Promise<any | null> {
    const { prompt } = params;
    if (!this.apiKey) {
      showMessage('Configura tu clave de la API de Gemini en los ajustes.');
      return null;
    }

    try {
      const client = this.getGeminiClient();
      const response = await client.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        config: GEMINI_JSON_GENERATION_CONFIG,
      });

      const rawText = this.extractText(response);

      if (!rawText) {
        return null;
      }

      const cleanText = this.cleanResponse(rawText);

      try {
        return JSON.parse(cleanText);
      } catch (parseError) {
        console.error(
          'Gemini response could not be parsed as JSON',
          cleanText,
          parseError,
        );
        return null;
      }
    } catch (error) {
      console.error('Failed to request Gemini JSON', error);
      showMessage(
        'Gemini no respondió. Consulta la consola para más detalles.',
      );
      return null;
    }
  }

  async requestStreamBrief(
    params: LlmParams,
  ): Promise<string | null> {
    if (!this.apiKey) {
      showMessage(
        'Configura tu clave de la API de Gemini en los ajustes para resumir el streaming.',
      );
      return null;
    }

    const { prompt } = params;

    try {
      const client = this.getGeminiClient();
      const response = await client.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        config: GEMINI_SUMMARY_GENERATION_CONFIG,
      });

      const rawText = this.extractText(response).trim();
      return rawText || null;
    } catch (error) {
      console.error('Failed to request Gemini stream brief', error);
      showMessage(
        'Gemini no respondió. Consulta la consola para más detalles.',
      );
      return null;
    }
  }

  private getGeminiClient(): GoogleGenAI {
    if (this.cachedGeminiClient) {
      return this.cachedGeminiClient;
    }

    this.cachedGeminiClient = new GoogleGenAI({ apiKey: this.apiKey });
    return this.cachedGeminiClient;
  }

  private extractText(response: GenerateContentResponse): string {
    const viaGetter =
      typeof response.text === 'string' ? response.text.trim() : '';
    if (viaGetter) {
      return viaGetter;
    }

    const candidates = response.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return '';
    }

    const parts = candidates[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      return '';
    }

    return parts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }

  private cleanResponse(text: string): string {
    // 1. Try to find standard markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    // 2. Fallback: Find the first '{' and last '}'
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return text.substring(startIndex, endIndex + 1);
    }

    return text;
  }
}
