import {
  App,
  MarkdownView,
  SuggestModal,
  TFile,
  normalizePath,
  parseYaml,
  stringifyYaml,
} from 'obsidian';
import { showMessage } from '../utils/Messages';
import {
  UnresolvedLinkGeneratorSettings,
  DEFAULT_TEMPLATE_OPTIONS,
} from '../settings';
import type { TemplateOptionSetting } from '../settings';
import { ensureFolderExists, getTemplatesFolder } from '../utils/vault';

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
  editor.setValue(mergedContent);

  const targetFolder = selection.targetFolder.trim();
  if (!targetFolder) {
    showMessage(
      `Configure a destination folder for ${selection.label} in the plugin settings before applying it.`,
    );
    return;
  }

  const normalizedFolder = normalizePath(targetFolder).replace(/\/+$/, '');
  const file = view.file;
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

type FrontmatterSplit = {
  frontmatterText: string | null;
  body: string;
};

function mergeNotes(noteB: string, noteA: string): string {
  const templateSplit = splitFrontmatter(noteB);
  const currentSplit = splitFrontmatter(noteA);
  const mergedFrontmatter = buildMergedFrontmatter(
    templateSplit.frontmatterText,
    currentSplit.frontmatterText,
  );
  const mergedFrontmatterBlock = mergedFrontmatter
    ? formatFrontmatterBlock(mergedFrontmatter)
    : '';

  const mergedBody = mergeBodyContent(templateSplit.body, currentSplit.body);
  const normalizedBody = mergedBody.replace(/^[\n\r]+/, '');

  const segments: string[] = [];
  if (mergedFrontmatterBlock) {
    segments.push(mergedFrontmatterBlock);
  }
  if (normalizedBody) {
    segments.push(normalizedBody);
  }

  return segments.join('\n\n');
}

function splitFrontmatter(content: string): FrontmatterSplit {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match || match.index !== 0) {
    return {
      frontmatterText: null,
      body: content,
    };
  }

  const [block, text] = match;
  const body = content.slice(block.length);

  return {
    frontmatterText: text,
    body,
  };
}

function buildMergedFrontmatter(
  templateFrontmatter: string | null,
  currentFrontmatter: string | null,
): Record<string, unknown> | null {
  const templateData = parseFrontmatter(templateFrontmatter);
  const currentData = parseFrontmatter(currentFrontmatter);
  const mergedEntries: Array<[string, unknown]> = [];
  const keyPositions = new Map<string, number>();

  if (templateData) {
    for (const key of Object.keys(templateData)) {
      const templateValue = templateData[key];
      const currentValue = currentData ? currentData[key] : undefined;
      const valueToUse = hasMeaningfulValue(currentValue)
        ? currentValue
        : templateValue;

      upsertEntry(mergedEntries, keyPositions, key, valueToUse);
    }
  }

  if (currentData) {
    for (const key of Object.keys(currentData)) {
      const currentValue = currentData[key];
      if (!hasMeaningfulValue(currentValue)) {
        continue;
      }

      upsertEntry(mergedEntries, keyPositions, key, currentValue);
    }
  }

  if (mergedEntries.length === 0) {
    return null;
  }

  const merged: Record<string, unknown> = {};
  for (const [key, value] of mergedEntries) {
    merged[key] = value;
  }

  return merged;
}

function mergeBodyContent(templateBody: string, currentBody: string): string {
  const cleanTemplate = stripLeadingFrontmatter(templateBody);
  const cleanCurrent = stripLeadingFrontmatter(currentBody);

  const normalizedTemplate = cleanTemplate.replace(/\s+$/, '');
  const normalizedCurrent = cleanCurrent.replace(/^\s+/, '');

  if (!normalizedTemplate) {
    return normalizedCurrent;
  }

  if (!normalizedCurrent) {
    return normalizedTemplate;
  }

  return `${normalizedTemplate}\n\n${normalizedCurrent}`;
}

function parseFrontmatter(frontmatter: string | null): Record<string, unknown> | null {
  if (!frontmatter) {
    return null;
  }

  try {
    const parsed = parseYaml(frontmatter);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.error('Failed to parse frontmatter', error);
  }

  return null;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return true;
}

function formatFrontmatterBlock(data: Record<string, unknown>): string {
  const yaml = stringifyYaml(data).replace(/\s+$/, '');
  return `---\n${yaml}\n---`;
}

function stripLeadingFrontmatter(text: string): string {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match || match.index !== 0) {
    return text;
  }

  return text.slice(match[0].length).replace(/^[\n\r]+/, '');
}

function upsertEntry(
  entries: Array<[string, unknown]>,
  positions: Map<string, number>,
  key: string,
  value: unknown,
): void {
  if (positions.has(key)) {
    const index = positions.get(key)!;
    entries[index][1] = value;
    return;
  }

  positions.set(key, entries.length);
  entries.push([key, value]);
}
