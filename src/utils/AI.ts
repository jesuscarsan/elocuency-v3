
import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { showMessage } from './Messages';

type GeminiEnrichment = {
  description?: string;
  frontmatter?: Record<string, unknown>;
};

type GeminiRequestParams = {
  apiKey: string;
  title: string;
  templateLabel: string;
  currentFrontmatter: Record<string, unknown> | null;
};

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const GEMINI_GENERATION_CONFIG = {
  temperature: 0.4,
  maxOutputTokens: 1000,
  responseMimeType: 'application/json',
};

let cachedGeminiClient: GoogleGenAI | null = null;
let cachedGeminiApiKey: string | null = null;

export async function requestGeminiEnrichment(params: GeminiRequestParams): Promise<GeminiEnrichment | null> {
  const { apiKey, title, templateLabel, currentFrontmatter } = params;
  const trimmedKey = apiKey.trim();

  if (!trimmedKey) {
    showMessage('Configura tu clave de la API de Gemini en los ajustes para completar la plantilla automáticamente.');
    return null;
  }

  const prompt = buildGeminiPrompt(title, templateLabel, currentFrontmatter);

  try {
    const client = getGeminiClient(trimmedKey);
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

    const rawText = extractTextFromGeminiResponse(response);

    if (!rawText) {
      return null;
    }

    const cleanText = stripCodeFence(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Gemini response could not be parsed as JSON', cleanText, parseError);
      return null;
    }

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const parsedRecord = parsed as Record<string, unknown>;
    const description = typeof parsedRecord.description === 'string'
      ? parsedRecord.description.trim()
      : undefined;
    const frontmatterValue = parsedRecord.frontmatter;
    const frontmatter = frontmatterValue && typeof frontmatterValue === 'object' && !Array.isArray(frontmatterValue)
      ? (frontmatterValue as Record<string, unknown>)
      : undefined;

    return {
      description,
      frontmatter,
    };
  } catch (error) {
    console.error('Failed to request Gemini enrichment', error);
    showMessage('Gemini no respondió. Consulta la consola para más detalles.');
    return null;
  }
}

function getGeminiClient(apiKey: string): GoogleGenAI {
  if (cachedGeminiClient && cachedGeminiApiKey === apiKey) {
    return cachedGeminiClient;
  }

  cachedGeminiClient = new GoogleGenAI({ apiKey });
  cachedGeminiApiKey = apiKey;
  return cachedGeminiClient;
}

function extractTextFromGeminiResponse(response: GenerateContentResponse): string {
  const viaGetter = typeof response.text === 'string' ? response.text.trim() : '';
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

function buildGeminiPrompt(
  title: string,
  templateLabel: string,
  currentFrontmatter: Record<string, unknown> | null,
): string {
  const frontmatterJson = stringifyFrontmatterForPrompt(currentFrontmatter);
  return [
    'Genera contenido para una nota de Obsidian.',
    `Título: "${title}".`,
    `Tipo de plantilla: "${templateLabel}".`,
    'Frontmatter actual (JSON):',
    frontmatterJson,
    'Devuelve un JSON con los campos:',
    '"description": resumen breve en español (máximo tres frases) que pueda ir en el cuerpo de la nota.',
    '"frontmatter": objeto con claves y valores sugeridos SOLO para los campos que falten o estén vacíos en el frontmatter actual.',
    'No añadas texto fuera del JSON y evita marcar código.'
  ].join('\n');
}

function stringifyFrontmatterForPrompt(frontmatter: Record<string, unknown> | null): string {
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

function stripCodeFence(text: string): string {
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return text;
}

