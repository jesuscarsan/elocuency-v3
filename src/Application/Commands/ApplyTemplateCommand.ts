import {
  App as ObsidianApp,
  MarkdownView,
  TFile,
  normalizePath,
} from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';
import {
  UnresolvedLinkGeneratorSettings,
} from 'src/settings';
import {
  formatFrontmatterBlock,
  mergeFrontmatterSuggestions,
  parseFrontmatter,
  splitFrontmatter,
} from 'src/Application/Utils/Frontmatter';
import type { LlmPort } from 'src/Domain/Ports/LlmPort';
import type { ImageSearchPort } from 'src/Domain/Ports/ImageSearchPort';
import { FrontmatterKeys } from 'src/Domain/Constants/FrontmatterRegistry';
import { getTemplateConfigsForFolder, TemplateMatch } from 'src/Application/Utils/TemplateConfig';
import { mergeNotes } from 'src/Application/Utils/Notes';
import { PersonasNoteOrganizer } from 'src/Application/Services/PersonasNoteOrganizer';
import { pickTemplate } from 'src/Application/Views/TemplateSelectionModal';

export class ApplyTemplateCommand {
  constructor(
    private readonly llm: LlmPort,
    private readonly imageSearch: ImageSearchPort,
    private readonly obsidian: ObsidianApp,
    private readonly settings: UnresolvedLinkGeneratorSettings,
  ) { }

  async execute() {
    const view = this.obsidian.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      showMessage('Open a markdown note to apply a template.');
      return;
    }

    const file = view.file;

    if (view.getMode() === 'preview') {
      await view.setState({ ...view.getState(), mode: 'source' }, { history: false });
    }
    const parentPath = file.parent ? file.parent.path : '/';

    const matches = await getTemplateConfigsForFolder(this.obsidian, this.settings, parentPath);

    if (matches.length === 0) {
      showMessage(`No template configured for folder: ${parentPath} or template file not found.`);
      return;
    }

    let templateResult: TemplateMatch | null = null;
    if (matches.length === 1) {
      templateResult = matches[0];
    } else {
      templateResult = await pickTemplate(this.obsidian, matches);
      console.log("templateResultºº", templateResult);
    }

    if (!templateResult) {
      showMessage('No template selected.');
      return;
    }

    const { config, cleanedContent, templateFile } = templateResult;

    showMessage(`Applying template for ${parentPath}...`);

    const editor = view.editor;
    const mergedContent = mergeNotes(cleanedContent, editor.getValue(), false);
    const mergedSplit = splitFrontmatter(mergedContent);
    const mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);
    const bodyIsEmpty = mergedSplit.body.trim().length === 0;

    const recomposedSegments: string[] = [];
    let finalFrontmatter = mergedFrontmatter;

    if (mergedFrontmatter) {
      recomposedSegments.push(formatFrontmatterBlock(mergedFrontmatter));
    }

    const normalizedBody = mergedSplit.body;
    if (normalizedBody) {
      recomposedSegments.push(normalizedBody);
    }

    let finalContent = recomposedSegments.join('\n\n');

    if (config.prompt) {
      const prompt = this.buildPrompt(file.basename, mergedFrontmatter, config.prompt);

      const enrichment = await this.llm.requestEnrichment({
        prompt,
      });

      if (enrichment) {
        let updatedFrontmatter = mergeFrontmatterSuggestions(
          mergedFrontmatter,
          enrichment.frontmatter,
        );

        // Check for empty image URLs
        if (updatedFrontmatter && Array.isArray(updatedFrontmatter[FrontmatterKeys.ImagenesUrls]) && (updatedFrontmatter[FrontmatterKeys.ImagenesUrls] as any[]).length === 0) {
          showMessage('Buscando imágenes...');
          const images = await this.imageSearch.searchImages(file.basename, 3);
          if (images.length > 0) {
            updatedFrontmatter = {
              ...updatedFrontmatter,
              [FrontmatterKeys.ImagenesUrls]: images,
            };
            showMessage(`Se encontraron ${images.length} imágenes.`);
          } else {
            showMessage('No se encontraron imágenes.');
          }
        }



        if (updatedFrontmatter) {
          finalFrontmatter = updatedFrontmatter;
        }

        const frontmatterBlock = updatedFrontmatter
          ? formatFrontmatterBlock(updatedFrontmatter)
          : '';
        const bodyFromGemini = enrichment.body
          ? enrichment.body.trim()
          : '';
        const segments: string[] = [];

        if (frontmatterBlock) {
          segments.push(frontmatterBlock);
        }

        if (bodyFromGemini) {
          segments.push(bodyFromGemini);
        }

        finalContent = segments.join('\n\n');
      }
    }

    editor.setValue(finalContent);

    if (finalFrontmatter) {
      const organizer = new PersonasNoteOrganizer(this.obsidian);
      // Give a small delay to allow editor update to propagate or just fire and forget? 
      // safer to await.
      await organizer.organize(file, finalFrontmatter);
    }

    await view.setState({ ...view.getState(), mode: 'preview' }, { history: false });

  }

  private buildPrompt(
    title: string,
    currentFrontmatter: Record<string, unknown> | null,
    promptTemplate: string,
  ): string {
    const frontmatterCopy = currentFrontmatter ? { ...currentFrontmatter } : {};
    delete frontmatterCopy.tags;
    const frontmatterJson = JSON.stringify(frontmatterCopy, null, 2);
    return `Nota de obsidian:'${title}'\n\nFrontmatter:'${frontmatterJson}'\n\n${promptTemplate}\n\n`;
  }
}
