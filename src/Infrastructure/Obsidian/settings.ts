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
  geminiLiveMode: 'gemini_live_voice_text' | 'gemini_live_voice_only' | 'local_voice_text' | 'local_voice_only' | 'text_only';
  geminiLiveUserMode: 'voice_text' | 'text_only' | 'voice_only';
  geminiLiveRole: string;
  geminiLiveLocalVoice: string; // URI of the local voice
  autoStartBridge: boolean;
  photosBridgePath: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  googleAccessToken: string;
  googleTokenExpirationTime: number;
  hideEmptyProperties: boolean;
  userLanguage: string;
  toLearnLanguage: string;
  openSubtitlesApiKey: string;
  openSubtitlesUsername: string;
  openSubtitlesPassword: string;
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
  geminiLiveMode: 'gemini_live_voice_text',
  geminiLiveUserMode: 'voice_text',
  geminiLiveRole: '', // Default to empty string
  geminiLiveLocalVoice: '',
  autoStartBridge: false, // Default to false as requested by user ("more control")
  photosBridgePath: '/Users/joshua/my-docs/code/elo-mac-bridge/EloMacBridge.app/Contents/MacOS/elo-mac-bridge',
  googleClientId: '',
  googleClientSecret: '',
  googleRefreshToken: '',
  googleAccessToken: '',
  googleTokenExpirationTime: 0,
  hideEmptyProperties: false,
  userLanguage: 'es',
  toLearnLanguage: 'en',
  openSubtitlesApiKey: '',
  openSubtitlesUsername: '',
  openSubtitlesPassword: '',
};


