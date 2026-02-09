"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleGeminiImagesAdapter = void 0;
const genai_1 = require("@google/genai");
const GEMINI_MODEL_NAME = 'gemini-2.0-flash-exp'; // Using flash-exp for better vision capabilities, or fallback to 1.5-flash if needed. User mentioned "Gemini" generic.
class GoogleGeminiImagesAdapter {
    constructor(apiKey) {
        this.client = null;
        this.apiKey = apiKey.trim();
    }
    getClient() {
        if (!this.client) {
            this.client = new genai_1.GoogleGenAI({ apiKey: this.apiKey });
        }
        return this.client;
    }
    async generateContentFromImages(images, additionalPrompt = '') {
        if (!this.apiKey) {
            console.warn('[GoogleGeminiImagesAdapter] Configura tu clave de API de Gemini.');
            return null;
        }
        try {
            const client = this.getClient();
            const prompt = `
        Analiza las siguientes imágenes que corresponden a lecciones de libros de texto.
        ${additionalPrompt}
        
        Instrucciones:
        1. Primero transcribe el texto literalmente de todas las imágenes en orden.
        2. Luego analiza el contenido en profundidad.
        
        Sigue estrictamente el esquema JSON proporcionado.
      `;
            const responseSchema = {
                type: 'OBJECT',
                properties: {
                    literal_transcription: {
                        type: 'STRING',
                        description: "Transcripción literal y completa del texto visible en las imágenes en formato markdown que refleje la jerarquiza de titulos y subtitulos lo mas fiel posible al original, utilizando las marcas '#', '##', '###', .... hasta el subnivel que sea necesario. Si salen imagenes de objetos sueltos en algún ejercicio, pon el nombre de lo que reconozcas entre [].",
                    },
                    analysis: {
                        type: 'STRING',
                        description: "Análisis detallado, resumen y explicación de los conceptos clave presentados en el texto.",
                    },
                },
                required: ["literal_transcription", "analysis"],
            };
            const contents = [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        ...images.map((img) => ({
                            inlineData: {
                                data: img.data,
                                mimeType: img.mimeType,
                            },
                        })),
                    ],
                },
            ];
            const response = await client.models.generateContent({
                model: GEMINI_MODEL_NAME,
                contents: contents,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: responseSchema,
                }
            });
            const text = response.text;
            if (!text)
                return null;
            const result = JSON.parse(text);
            return result;
        }
        catch (error) {
            console.error('Error calling Gemini Vision:', error);
            return null;
        }
    }
    async generateEnrichmentFromImages(images, promptTemplate) {
        if (!this.apiKey) {
            console.warn('[GoogleGeminiImagesAdapter] Configura tu clave de API de Gemini.');
            return null;
        }
        try {
            const client = this.getClient();
            const prompt = `
        ${promptTemplate}
        
        Analiza las imágenes proporcionadas y utiliza su contenido para cumplir con la solicitud.
        Genera una respuesta en formato JSON con los siguientes campos opcionales:
        - "body": El contenido principal de la nota (texto markdown).
        - "frontmatter": Un objeto con metadatos para la nota.
        
        Responde SOLAMENTE con el JSON válido.
      `;
            // We use a looser schema or just text mode with JSON instruction to allow flexibility in frontmatter
            // But strict schema is better for reliability.
            const responseSchema = {
                type: 'OBJECT',
                properties: {
                    body: {
                        type: 'STRING',
                        description: "Contenido principal de la nota en Markdown.",
                    },
                    frontmatter: {
                        type: 'OBJECT',
                        description: "Metadatos Key-Value para el frontmatter.",
                        nullable: true
                    },
                },
                required: ["body"], // Require at least body, frontmatter optional
            };
            const contents = [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        ...images.map((img) => ({
                            inlineData: {
                                data: img.data,
                                mimeType: img.mimeType,
                            },
                        })),
                    ],
                },
            ];
            const response = await client.models.generateContent({
                model: GEMINI_MODEL_NAME,
                contents: contents,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: responseSchema,
                }
            });
            const text = response.text;
            if (!text)
                return null;
            return JSON.parse(text);
        }
        catch (error) {
            console.error('Error calling Gemini Vision Enrichment:', error);
            return null;
        }
    }
}
exports.GoogleGeminiImagesAdapter = GoogleGeminiImagesAdapter;
