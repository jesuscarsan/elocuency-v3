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
import type { GeocodingPort } from 'src/Domain/Ports/GeocodingPort';

type TemplateOption = TemplateOptionSetting;

export class ApplyTemplateCommand {
  constructor(
    private readonly llm: LlmPort,
    private readonly geocoder: GeocodingPort,
    private readonly obsidian: ObsidianApp,
    private readonly settings: UnresolvedLinkGeneratorSettings,
  ) {}

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
    const mergedContent = mergeNotes(templateContent, editor.getValue());
    const mergedSplit = splitFrontmatter(mergedContent);
    let mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);
    const bodyIsEmpty = mergedSplit.body.trim().length === 0;

    const shouldEnrichPlace =
      typeof label === 'string' && label.trim().toLowerCase() === 'lugar';

    // Apply Lugar enrichment if applicable
    if (shouldEnrichPlace) {
      mergedFrontmatter = await this.enrichPlaceDetails(
        file.basename,
        mergedFrontmatter,
      );
    }

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
      const enrichment = await this.llm.requestEnrichment({
        title: file.basename,
        templateLabel: label,
        currentFrontmatter: mergedFrontmatter,
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

  private async enrichPlaceDetails(
    placeName: string,
    currentFrontmatter: Record<string, any> | null,
  ): Promise<Record<string, any> | null> {
    const placeDetails = await this.geocoder.requestPlaceDetails({
      placeName,
    });

    if (!placeDetails) {
      return currentFrontmatter;
    }

    const base = currentFrontmatter ? { ...currentFrontmatter } : {};

    for (const [key, value] of Object.entries(placeDetails)) {
      const currentValue = base[key];
      const hasMeaningfulValue =
        currentValue !== undefined &&
        currentValue !== null &&
        !(typeof currentValue === 'string' && currentValue.trim().length === 0);

      if (!hasMeaningfulValue) {
        base[key] = value;
      }
    }

    return Object.keys(base).length > 0 ? base : null;
  }
}
