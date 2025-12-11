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
  googleGeocodingAPIKey: string;
  googleMapsEmbedAPIKey: string;
  spotifyClientId: string;
  spotifyAccessToken: string;

  spotifyRedirectUri: string;
  spotifyPkceVerifier: string;
  googleCustomSearchApiKey: string;
  googleCustomSearchEngineId: string;
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
  googleGeocodingAPIKey: '',
  googleMapsEmbedAPIKey: '',
  spotifyClientId: '',
  spotifyAccessToken: '',
  spotifyRedirectUri: 'http://localhost:8080',
  spotifyPkceVerifier: '',
  googleCustomSearchApiKey: '',
  googleCustomSearchEngineId: '',
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
        ? record.templateFilename
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



  return normalized;
}
