export type LocationStrategy = 'same-folder' | 'fixed-folder';

export interface TemplateOptionSetting {
  label: string;
  templateFilename: string;
  targetFolder: string;
}

export interface UnresolvedLinkGeneratorSettings {
  locationStrategy: LocationStrategy;
  targetFolder: string;
  fileTemplate: string;
  templateOptions: TemplateOptionSetting[];
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptionSetting[] = [
  {
    label: 'Persona',
    templateFilename: 'Persona.md',
    targetFolder: 'Personas',
  },
  {
    label: 'Obra > Albúm de música',
    templateFilename: 'Obra Audiovisual.md',
    targetFolder: 'Obras/Álbumes de música',
  },
  {
    label: 'Obra > Película',
    templateFilename: 'Obra Audiovisual.md',
    targetFolder: 'Obras/Películas',
  },
  {
    label: 'Obra > Libro',
    templateFilename: 'Obra Escrita.md',
    targetFolder: 'Obras/Libros',
  },
  {
    label: 'Obra > Streaming',
    templateFilename: 'Obra Audiovisual.md',
    targetFolder: 'Obras/Streaming',
  },
  {
    label: 'Tecnología',
    templateFilename: 'Tecnología.md',
    targetFolder: 'Tecnología/-Diccionario',
  },
];

export const DEFAULT_SETTINGS: UnresolvedLinkGeneratorSettings = {
  locationStrategy: 'same-folder',
  targetFolder: '',
  fileTemplate: '# {{title}}\n',
  templateOptions: DEFAULT_TEMPLATE_OPTIONS.map((option) => ({ ...option })),
};

export function normalizeTemplateOptions(value: unknown): TemplateOptionSetting[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TEMPLATE_OPTIONS.map((option) => ({ ...option }));
  }

  const normalized: TemplateOptionSetting[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Partial<TemplateOptionSetting>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const templateFilename = typeof record.templateFilename === 'string'
      ? extractTemplateFilename(record.templateFilename)
      : '';
    const targetFolder = typeof record.targetFolder === 'string'
      ? record.targetFolder.trim()
      : '';

    if (!label && !templateFilename && !targetFolder) {
      continue;
    }

    normalized.push({
      label,
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
