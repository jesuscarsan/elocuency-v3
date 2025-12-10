import { App as ObsidianApp, MarkdownView } from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';
import {
  formatFrontmatterBlock,
  parseFrontmatter,
  splitFrontmatter,
} from 'src/Application/Utils/Frontmatter';
import { getStreamTranscript } from 'src/Application/Utils/Streams';
import type { LlmPort } from 'src/Domain/Ports/LlmPort';
import { FrontmatterKeys } from 'src/Domain/Constants/FrontmatterRegistry';

export class ApplyStreamBriefCommand {
  constructor(
    private readonly llm: LlmPort,
    private readonly obsidian: ObsidianApp,
  ) { }

  async execute(): Promise<void> {
    const view = this.obsidian.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      showMessage('Abre una nota de streaming para generar el brief.');
      return;
    }

    const file = view.file;
    const content = await this.obsidian.vault.read(file);
    const split = splitFrontmatter(content);

    if (!split.frontmatterText) {
      showMessage(
        'Añade un frontmatter con la URL del streaming antes de generar el brief.',
      );
      return;
    }

    const frontmatter = parseFrontmatter(split.frontmatterText);
    if (!frontmatter) {
      showMessage('No se pudo interpretar el frontmatter de la nota.');
      return;
    }

    const streamUrl = this.extractStreamUrl(frontmatter);
    if (!streamUrl) {
      showMessage('Incluye una clave "url" con la dirección del streaming.');
      return;
    }

    showMessage('Buscando la transcripción del streaming...');
    const transcript = await getStreamTranscript(streamUrl);
    if (transcript === null) {
      showMessage('No se pudo obtener la transcripción del streaming.');
      return;
    }

    const normalizedTranscript = transcript.trim();
    if (!normalizedTranscript) {
      showMessage('La transcripción del streaming está vacía.');
      return;
    }

    const prompt = this.buildStreamBriefPrompt(
      file.basename,
      streamUrl,
      normalizedTranscript,
    );

    const brief = await this.llm.requestStreamBrief({
      prompt,
    });

    if (!brief) {
      showMessage('No se pudo generar el brief con Gemini.');
      return;
    }

    const updatedContent = this.composeNote(frontmatter, split.body, brief);
    await this.obsidian.vault.modify(file, updatedContent);
    showMessage('Brief del streaming actualizado.');
  }

  private buildStreamBriefPrompt(
    title: string,
    url: string,
    transcript: string,
  ): string {
    return [
      'Resume en español el siguiente contenido de vídeo o streaming.',
      `Referencia: "${title}".`,
      `URL: ${url}`,
      'Transcripción completa:',
      transcript,
      'Devuelve un resumen en markdown de los principales puntos del contenido.',
    ].join('\n');
  }

  private extractStreamUrl(frontmatter: Record<string, unknown>): string {
    const candidates = [FrontmatterKeys.StreamUrl, 'stream-url', 'stream_url', 'url'];
    for (const key of candidates) {
      const value = frontmatter[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }

    return '';
  }

  private composeNote(
    frontmatter: Record<string, unknown>,
    body: string,
    brief: string,
  ): string {
    const normalizedBody = body.replace(/^[\n\r]+/, '');
    const nextFrontmatter = { ...frontmatter, brief };
    const frontmatterBlock = formatFrontmatterBlock(nextFrontmatter);

    if (normalizedBody) {
      return `${frontmatterBlock}\n\n${normalizedBody}`;
    }

    return `${frontmatterBlock}\n`;
  }
}
