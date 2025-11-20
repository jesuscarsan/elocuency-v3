import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { showMessage } from 'src/Application/Utils/Messages';
import type { LlmResponse, LlmPort, LlmParams } from 'src/Domain/Ports/LlmPort';

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const GEMINI_GENERATION_CONFIG = {
  temperature: 0.4,
  // maxOutputTokens: 10000,
  responseMimeType: 'application/json',
};

export class GoogleGeminiAdapter implements LlmPort {
  private readonly apiKey: string;
  private cachedGeminiClient: GoogleGenAI | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async requestEnrichment(params: LlmParams): Promise<LlmResponse | null> {
    const { title, templateLabel, currentFrontmatter } = params;

    if (!this.apiKey) {
      showMessage(
        'Configura tu clave de la API de Gemini en los ajustes para completar la plantilla automáticamente.',
      );
      return null;
    }

    const prompt = this.buildPrompt(title, templateLabel, currentFrontmatter);

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
        config: GEMINI_GENERATION_CONFIG,
      });

      const rawText = this.extractText(response);

      if (!rawText) {
        return null;
      }

      const cleanText = this.stripCodeFence(rawText);

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
      const description =
        typeof parsedRecord.description === 'string'
          ? parsedRecord.description.trim()
          : undefined;
      const frontmatterValue = parsedRecord.frontmatter;
      const frontmatter =
        frontmatterValue &&
          typeof frontmatterValue === 'object' &&
          !Array.isArray(frontmatterValue)
          ? (frontmatterValue as Record<string, unknown>)
          : undefined;

      return {
        description,
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

  private buildPrompt(
    title: string,
    templateLabel: string,
    currentFrontmatter: Record<string, unknown> | null,
  ): string {
    const frontmatterJson = this.stringifyFrontmatter(currentFrontmatter);
    return [
      'Genera contenido para una nota de Obsidian.',
      `Título: "${title}".`,
      `Tipo de plantilla: "${templateLabel}".`,
      'Frontmatter actual (JSON):',
      frontmatterJson,
      'Devuelve un JSON con los campos:',
      '"description": resumen breve en español (máximo tres frases) que pueda ir en el cuerpo de la nota.',
      '"frontmatter": objeto con claves y valores sugeridos SOLO para los campos que falten o estén vacíos en el frontmatter actual.',
      'No añadas texto fuera del JSON y evita marcar código.',
    ].join('\n');
  }

  private stringifyFrontmatter(
    frontmatter: Record<string, unknown> | null,
  ): string {
    if (!frontmatter) {
      return '{}';
    }

    try {
      return JSON.stringify(
        frontmatter,
        (_key, value) => (value === undefined ? null : value),
        2,
      );
    } catch (error) {
      console.error('Failed to serialise frontmatter for Gemini prompt', error);
      return '{}';
    }
  }

  private stripCodeFence(text: string): string {
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    return text;
  }
}
