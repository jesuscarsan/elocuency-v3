export type LocationStrategy = 'same-folder' | 'fixed-folder';



export interface UnresolvedLinkGeneratorSettings {
  locationStrategy: LocationStrategy;
  targetFolder: string;
  missingNotesTemplatePath: string;
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
  geminiLiveRole: string;
}



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
  geminiLiveMode: true,
  geminiLiveRole: '', // Default to empty string
};


