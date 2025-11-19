import {
  App as ObsidianApp,
  MarkdownView,
  SuggestModal,
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
  ensureFolderExists,
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
  ) { }

  async execute() {
    const view = this.obsidian.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      showMessage('Open a markdown note to apply a template.');
      return;
    }

    const file = view.file;
    const templateOptions = this.buildTemplateOptions(this.settings);
    if (templateOptions.length === 0) {
      showMessage(
        'Configure at least one template in the plugin settings before applying it.',
      );
      return;
    }

    const templatePicked = await this.pickTemplateOption(templateOptions);
    if (!templatePicked) {
      showMessage('Template application cancelled.');
      return;
    }

    if (!templatePicked.templateFilename) {
      showMessage(
        `Configure a template file for ${templatePicked.label} in the plugin settings before applying it.`,
      );
      return;
    }

    const templatesFolder = getTemplatesFolder(this.obsidian);
    if (!templatesFolder) {
      showMessage(
        `Enable the Templates core plugin and set a templates folder before applying the ${templatePicked.label} template.`,
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

    showMessage(`Applying ${templatePicked.label} template...`);

    const templateContent = await this.obsidian.vault.read(templateFile);
    const editor = view.editor;
    const mergedContent = mergeNotes(templateContent, editor.getValue());
    const mergedSplit = splitFrontmatter(mergedContent);
    let mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);
    const bodyIsEmpty = mergedSplit.body.trim().length === 0;

    const shouldEnrichPlace =
      templatePicked.label.trim().toLowerCase() === 'lugar';

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
        templateLabel: templatePicked.label,
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

    const targetFolder = templatePicked.targetFolder.trim();
    if (!targetFolder) {
      showMessage(
        `Configure a destination folder for ${templatePicked.label} in the plugin settings before applying it.`,
      );
      return;
    }

    const normalizedFolder = normalizePath(targetFolder).replace(/\/+$/, '');
    const currentPath = file.path;
    const alreadyInTarget =
      currentPath === normalizedFolder ||
      currentPath.startsWith(`${normalizedFolder}/`);

    if (alreadyInTarget) {
      showMessage(`File is already in ${normalizedFolder}.`);
      return;
    }

    const newPath = normalizePath(`${normalizedFolder}/${file.name}`);
    await ensureFolderExists(this.obsidian, newPath);
    await this.obsidian.fileManager.renameFile(file, newPath);
    showMessage(`Moved note to ${normalizedFolder}.`);
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

  private buildTemplateOptions(
    settings: UnresolvedLinkGeneratorSettings,
  ): TemplateOption[] {
    const source =
      settings.templateOptions && settings.templateOptions.length > 0
        ? settings.templateOptions
        : DEFAULT_TEMPLATE_OPTIONS;

    return source
      .map((option) => ({
        label: option.label.trim(),
        templateFilename: option.templateFilename.trim(),
        targetFolder: option.targetFolder.trim(),
      }))
      .filter((option) => option.label.length > 0);
  }

  private async pickTemplateOption(
    options: TemplateOption[],
  ): Promise<TemplateOption | null> {
    if (options.length === 0) {
      return null;
    }

    if (options.length === 1) {
      return options[0];
    }

    return new Promise((resolve) => {
      new TemplateSelectionModal(this.obsidian, options, resolve).open();
    });
  }
}

class TemplateSelectionModal extends SuggestModal<TemplateOption> {
  private resolved = false;

  constructor(
    app: ObsidianApp,
    private readonly options: TemplateOption[],
    private readonly onResolve: (choice: TemplateOption | null) => void,
  ) {
    super(app);
    this.setPlaceholder('Choose a template to apply');
  }

  getSuggestions(query: string): TemplateOption[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return this.options;
    }

    return this.options.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery),
    );
  }

  renderSuggestion(option: TemplateOption, el: HTMLElement) {
    el.createEl('div', { text: option.label });

    const messages: string[] = [];
    if (!option.templateFilename) {
      messages.push('Template path not configured');
    }
    if (!option.targetFolder.trim()) {
      messages.push('Target folder not configured');
    }

    if (messages.length > 0) {
      el.createEl('small', { text: messages.join(' · ') });
    }
  }

  onChooseSuggestion(item: TemplateOption) {
    this.resolved = true;
    this.onResolve(item);
  }

  onClose() {
    setTimeout(() => {
      if (!this.resolved) {
        this.onResolve(null);
      }
    }, 0);
  }
}
