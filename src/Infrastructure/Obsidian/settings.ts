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
  geminiRolesFolder: string;
  googleGeocodingAPIKey: string;
  googleMapsEmbedAPIKey: string;
  spotifyClientId: string;
  spotifyAccessToken: string;

  spotifyRedirectUri: string;
  spotifyPkceVerifier: string;
  spotifyRefreshToken: string;
  spotifyTokenExpirationTime: number;
  googleCustomSearchApiKey: string;
  googleCustomSearchEngineId: string;
  geminiLiveMode: boolean;

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
  geminiRolesFolder: '',
  googleGeocodingAPIKey: '',
  googleMapsEmbedAPIKey: '',
  spotifyClientId: '',
  spotifyAccessToken: '',
  spotifyRedirectUri: 'http://localhost:8080',
  spotifyPkceVerifier: '',
  spotifyRefreshToken: '',
  spotifyTokenExpirationTime: 0,
  googleCustomSearchApiKey: '',
  googleCustomSearchEngineId: '',
  templateOptions: DEFAULT_TEMPLATE_OPTIONS.map((option) => ({ ...option })),
  geminiLiveMode: true,

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
