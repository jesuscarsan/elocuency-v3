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
  parseFrontmatter,
  splitFrontmatter,
} from 'src/Application/Utils/Frontmatter';
import { isFolderMatch } from 'src/Application/Utils/Vault';
import type { LlmPort } from 'src/Domain/Ports/LlmPort';
import { extractConfigFromTemplate } from 'src/Application/Utils/TemplateConfig';
import { mergeNotes } from 'src/Application/Utils/Notes';

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

    showMessage(`Applying template for ${templatePicked.targetFolder}...`);

    const templateContent = await this.obsidian.vault.read(templateFile);
    const { config, cleanedContent } = extractConfigFromTemplate(templateContent);

    const editor = view.editor;
    const mergedContent = mergeNotes(cleanedContent, editor.getValue(), false);
    const mergedSplit = splitFrontmatter(mergedContent);
    const mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);
    const bodyIsEmpty = mergedSplit.body.trim().length === 0;

    const recomposedSegments: string[] = [];
    if (mergedFrontmatter) {
      recomposedSegments.push(formatFrontmatterBlock(mergedFrontmatter));
    }

    const normalizedBody = mergedSplit.body;
    if (normalizedBody) {
      recomposedSegments.push(normalizedBody);
    }

    let finalContent = recomposedSegments.join('\n\n');

    if (bodyIsEmpty && config.prompt) {
      const prompt = this.buildPrompt(file.basename, mergedFrontmatter, config.prompt);

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
    currentFrontmatter: Record<string, unknown> | null,
    promptTemplate: string,
  ): string {
    const frontmatterJson = JSON.stringify(currentFrontmatter || {}, null, 2);
    return promptTemplate
      .replace('{{title}}', title)
      .replace('{{frontmatter}}', frontmatterJson);
  }


  private findTemplateForFolder(folderPath: string): TemplateOption | null {
    const source =
      this.settings.templateOptions && this.settings.templateOptions.length > 0
        ? this.settings.templateOptions
        : DEFAULT_TEMPLATE_OPTIONS;

    const normalizedFolder = normalizePath(folderPath);

    return (
      source.find((option) => {
        return isFolderMatch(normalizedFolder, option.targetFolder);
      }) || null
    );
  }
}
