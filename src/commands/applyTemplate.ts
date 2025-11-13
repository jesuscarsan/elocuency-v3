import {
  App,
  MarkdownView,
  SuggestModal,
  TFile,
  normalizePath,
} from 'obsidian';
import { showMessage } from '../utils/Messages';
import {
  UnresolvedLinkGeneratorSettings,
  DEFAULT_TEMPLATE_OPTIONS,
} from '../settings';
import type { TemplateOptionSetting } from '../settings';
import { ensureFolderExists, getTemplatesFolder } from '../utils/Vault';
import { formatFrontmatterBlock, mergeFrontmatterSuggestions, mergeNotes, parseFrontmatter, splitFrontmatter } from 'src/utils/Notes';
import { requestPlaceDetails } from 'src/utils/Maps';
import { requestGeminiEnrichment } from 'src/utils/AI';

type TemplateOption = TemplateOptionSetting;

export async function applyTemplate(
  app: App,
  settings: UnresolvedLinkGeneratorSettings,
) {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file) {
    showMessage('Open a markdown note to apply a template.');
    return;
  }

  const file = view.file;
  const templateOptions = buildTemplateOptions(settings);
  if (templateOptions.length === 0) {
    showMessage(
      'Configure at least one template in the plugin settings before applying it.',
    );
    return;
  }
  const selection = await pickTemplateOption(app, templateOptions);

  if (!selection) {
    showMessage('Template application cancelled.');
    return;
  }

  if (!selection.templateFilename) {
    showMessage(
      `Configure a template file for ${selection.label} in the plugin settings before applying it.`,
    );
    return;
  }

  const templatesFolder = getTemplatesFolder(app);
  if (!templatesFolder) {
    showMessage(
      `Enable the Templates core plugin and set a templates folder before applying the ${selection.label} template.`,
    );
    return;
  }

  const normalizedTemplatePath = normalizePath(
    `${templatesFolder}/${selection.templateFilename}`,
  );
  const templateFile = app.vault.getAbstractFileByPath(normalizedTemplatePath);

  if (!(templateFile instanceof TFile)) {
    showMessage(`Template not found at ${normalizedTemplatePath}.`);
    return;
  }

  showMessage(`Applying ${selection.label} template...`);

  const templateContent = await app.vault.read(templateFile);
  const editor = view.editor;
  const mergedContent = mergeNotes(templateContent, editor.getValue());
  const mergedSplit = splitFrontmatter(mergedContent);
  let mergedFrontmatter = parseFrontmatter(mergedSplit.frontmatterText);
  const bodyIsEmpty = mergedSplit.body.trim().length === 0;

  const shouldEnrichPlace = selection.label.trim().toLowerCase() === 'lugar';

  if (shouldEnrichPlace) {
    const placeDetails = await requestPlaceDetails({
      apiKey: settings.googleMapsApiKey ?? '',
      placeName: file.basename,
    });

    if (placeDetails) {
      const base = mergedFrontmatter ? { ...mergedFrontmatter } : {};

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

      mergedFrontmatter = Object.keys(base).length > 0 ? base : null;
    }
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
    const enrichment = await requestGeminiEnrichment({
      apiKey: settings.geminiApiKey,
      title: file.basename,
      templateLabel: selection.label,
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

  const targetFolder = selection.targetFolder.trim();
  if (!targetFolder) {
    showMessage(
      `Configure a destination folder for ${selection.label} in the plugin settings before applying it.`,
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
  await ensureFolderExists(app, newPath);
  await app.fileManager.renameFile(file, newPath);
  showMessage(`Moved note to ${normalizedFolder}.`);
}

class TemplateSelectionModal extends SuggestModal<TemplateOption> {
  private resolved = false;

  constructor(
    app: App,
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
    // Delay resolution to let Obsidian call onChooseSuggestion before we fallback to null.
    setTimeout(() => {
      if (!this.resolved) {
        this.onResolve(null);
      }
    }, 0);
  }
}

async function pickTemplateOption(
  app: App,
  options: TemplateOption[],
): Promise<TemplateOption | null> {
  if (options.length === 0) {
    return null;
  }

  if (options.length === 1) {
    return options[0];
  }

  return new Promise((resolve) => {
    new TemplateSelectionModal(app, options, resolve).open();
  });
}

function buildTemplateOptions(
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