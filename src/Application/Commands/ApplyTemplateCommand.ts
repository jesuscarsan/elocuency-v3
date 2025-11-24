import {
  App as ObsidianApp,
  MarkdownView,
  TFile,
  normalizePath,
} from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';
import {
  UnresolvedLinkGeneratorSettings,
  DEFAULT_TEMPLATE_OPTIONS,
} from 'src/settings';
import type { TemplateOptionSetting } from 'src/settings';
import {
  getTemplatesFolder,
} from 'src/Application/Utils/Vault';
import {
  formatFrontmatterBlock,
  mergeFrontmatterSuggestions,
  mergeNotes,
  parseFrontmatter,
  splitFrontmatter,
} from 'src/Application/Utils/Notes';
import type { LlmPort } from 'src/Domain/Ports/LlmPort';

type TemplateOption = TemplateOptionSetting;

export class ApplyTemplateCommand {
  constructor(
    private readonly llm: LlmPort,
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
    const parentPath = file.parent ? file.parent.path : '/';

    const templatePicked = this.findTemplateForFolder(parentPath);

    if (!templatePicked) {
      showMessage(`No template configured for folder: ${parentPath}`);
      return;
    }

    if (!templatePicked.templateFilename) {
      showMessage(
        `Configure a template file for folder ${templatePicked.targetFolder} in the plugin settings before applying it.`,
      );
      return;
    }

    const templatesFolder = getTemplatesFolder(this.obsidian);
    if (!templatesFolder) {
      showMessage(
        `Enable the Templates core plugin and set a templates folder before applying the template.`,
      );
      return;
    }

    const normalizedTemplatePath = normalizePath(
      `${templatesFolder}/${templatePicked.templateFilename}`,
    );
    const templateFile = this.obsidian.vault.getAbstractFileByPath(
      normalizedTemplatePath,
    );

    if (!(templateFile instanceof TFile)) {
      showMessage(`Template not found at ${normalizedTemplatePath}.`);
      return;
    }

    const label = (templatePicked as any).label || templatePicked.targetFolder;
    showMessage(`Applying ${label} template...`);

    const templateContent = await this.obsidian.vault.read(templateFile);
    const editor = view.editor;
    const mergedContent = mergeNotes(templateContent, editor.getValue(), false);
    const mergedSplit = splitFrontmatter(mergedContent);
    const mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);
    const bodyIsEmpty = mergedSplit.body.trim().length === 0;

    const recomposedSegments: string[] = [];
    if (mergedFrontmatter) {
      recomposedSegments.push(formatFrontmatterBlock(mergedFrontmatter));
    }

    const normalizedBody = mergedSplit.body.replace(/^[\n\r]+/, '');
    if (normalizedBody) {
      recomposedSegments.push(normalizedBody);
    }

    let finalContent = recomposedSegments.join('\n\n');

    if (bodyIsEmpty) {
      const prompt = this.buildPrompt(file.basename, label, mergedFrontmatter);

      const enrichment = await this.llm.requestEnrichment({
        prompt,
      });

      if (enrichment) {
        const updatedFrontmatter = mergeFrontmatterSuggestions(
          mergedFrontmatter,
          enrichment.frontmatter,
        );

        const frontmatterBlock = updatedFrontmatter
          ? formatFrontmatterBlock(updatedFrontmatter)
          : '';
        const bodyFromGemini = enrichment.description
          ? enrichment.description.trim()
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

  private findTemplateForFolder(folderPath: string): TemplateOption | null {
    const source =
      this.settings.templateOptions && this.settings.templateOptions.length > 0
        ? this.settings.templateOptions
        : DEFAULT_TEMPLATE_OPTIONS;

    const normalizedFolder = normalizePath(folderPath);

    return (
      source.find((option) => {
        const target = normalizePath(option.targetFolder);
        return target === normalizedFolder;
      }) || null
    );
  }
}
