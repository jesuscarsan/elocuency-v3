import { App as ObsidianApp, MarkdownView, TFile } from 'obsidian';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import {
  formatFrontmatterBlock,
  parseFrontmatter,
  splitFrontmatter,
} from '@/Infrastructure/Obsidian/Utils/Frontmatter';
import { getStreamTranscript } from '@/Infrastructure/Obsidian/Utils/Streams';
import type { LlmPort } from "@elo/core";
import { FrontmatterKeys } from "@elo/core";
import { executeInEditMode, getActiveMarkdownView } from '@/Infrastructure/Obsidian/Utils/ViewMode';

export class ApplyStreamBriefCommand {
  constructor(
    private readonly llm: LlmPort,
    private readonly obsidian: ObsidianApp,
  ) { }

  async execute(file?: TFile): Promise<void> {
    console.log('[ApplyStreamBriefCommand] Start');
    const view = getActiveMarkdownView(this.obsidian, file);
    if (!view?.file) {
      showMessage('Abre una nota de streaming para generar el brief.');
      console.log('[ApplyStreamBriefCommand] End (No active view)');
      return;
    }

    await executeInEditMode(view, async () => {
      const file = view.file;
      // Additional check
      if (!file) return;

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

      const streamUrl = this.extractUrl(frontmatter);
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
    });
    console.log('[ApplyStreamBriefCommand] End');
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

  private extractUrl(frontmatter: Record<string, unknown>): string {
    const candidates = [FrontmatterKeys.Url];
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
    const frontmatterBlock = formatFrontmatterBlock(frontmatter);
    const briefSection = `\n\n## Resumen\n\n${brief}`;

    if (normalizedBody) {
      return `${frontmatterBlock}\n\n${normalizedBody}${briefSection}`;
    }

    return `${frontmatterBlock}${briefSection}`;
  }
}
