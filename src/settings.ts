export type LocationStrategy = 'same-folder' | 'fixed-folder';

export interface TemplateOptionSetting {
  targetFolder: string;
  templateFilename: string;
  commands: string[];
}

export interface UnresolvedLinkGeneratorSettings {
  locationStrategy: LocationStrategy;
  targetFolder: string;
  fileTemplate: string;
  templateOptions: TemplateOptionSetting[];
  geminiApiKey: string;
  googleMapsApiKey: string;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptionSetting[] = [
  {
    templateFilename: 'Persona.md',
    targetFolder: 'Personas',
    commands: ['elocuency:elo-apply-note-template'],
  },
  {
    templateFilename: 'Persona/Persona.md',
    targetFolder: 'Personas',
    commands: [],
  },
  {
    templateFilename: 'Obra Audiovisual.md',
    targetFolder: 'Obras/Álbumes de música',
    commands: [],
  },
  {
    templateFilename: 'Obra Audiovisual.md',
    targetFolder: 'Obras/Películas',
    commands: [],
  },
  {
    templateFilename: 'Obra Escrita.md',
    targetFolder: 'Obras/Libros',
    commands: [],
  },
  {
    templateFilename: 'Obra Audiovisual.md',
    targetFolder: 'Obras/Streaming',
    commands: [],
  },
  {
    templateFilename: 'Tecnología.md',
    targetFolder: 'Tecnología/-Diccionario',
    commands: [],
  },
];

export const DEFAULT_SETTINGS: UnresolvedLinkGeneratorSettings = {
  locationStrategy: 'same-folder',
  targetFolder: '',
  fileTemplate: '# {{title}}\n',
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
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const templateFilename =
      typeof record.templateFilename === 'string'
        ? extractTemplateFilename(record.templateFilename)
        : '';
    const targetFolder =
      typeof record.targetFolder === 'string' ? record.targetFolder.trim() : '';
    const commands = Array.isArray(record.commands)
      ? record.commands
        .filter((c): c is string => typeof c === 'string')
        .map((c) =>
          c === 'elo-apply-note-template'
            ? 'elocuency:elo-apply-note-template'
            : c,
        )
      : [];

    if (!label && !templateFilename && !targetFolder) {
      continue;
    }

    normalized.push({
      label,
      templateFilename,
      targetFolder,
      commands,
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
