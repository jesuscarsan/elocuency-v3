export type LocationStrategy = 'same-folder' | 'fixed-folder';

export interface TemplateOptionSetting {
  targetFolder: string;
  templateFilename: string;
}

export interface UnresolvedLinkGeneratorSettings {
  locationStrategy: LocationStrategy;
  targetFolder: string;
  missingNotesTemplatePath: string;
  templateOptions: TemplateOptionSetting[];
  geminiApiKey: string;
  googleMapsApiKey: string;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptionSetting[] = [
  {
    templateFilename: 'Persona.md',
    targetFolder: 'Personas',
  },
];

export const DEFAULT_SETTINGS: UnresolvedLinkGeneratorSettings = {
  locationStrategy: 'same-folder',
  targetFolder: '',
  missingNotesTemplatePath: '# {{title}}\n',
  geminiApiKey: '',
  googleMapsApiKey: '',
  templateOptions: DEFAULT_TEMPLATE_OPTIONS.map((option) => ({ ...option })),
};

export function normalizeTemplateOptions(
  value: unknown,
): TemplateOptionSetting[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TEMPLATE_OPTIONS.map((option) => ({ ...option }));
  }

  const normalized: TemplateOptionSetting[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Partial<TemplateOptionSetting>;

    const templateFilename =
      typeof record.templateFilename === 'string'
        ? extractTemplateFilename(record.templateFilename)
        : '';
    const targetFolder =
      typeof record.targetFolder === 'string' ? record.targetFolder.trim() : '';


    if (!templateFilename && !targetFolder) {
      continue;
    }

    normalized.push({
      templateFilename,
      targetFolder,
    });
  }

  if (normalized.length === 0) {
    return DEFAULT_TEMPLATE_OPTIONS.map((option) => ({ ...option }));
  }

  return normalized;
}

function extractTemplateFilename(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const segments = trimmed.split('/');
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index].trim();
    if (candidate) {
      return candidate;
    }
  }

  return '';
}
