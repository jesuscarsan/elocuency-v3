import { App, TFile } from 'obsidian';
/**
 * Checks if a given folder path matches a target folder configuration.
 * Supports exact matches and wildcard matches using '/**' suffix.
 *
 * @param folderPath The path of the folder to check (e.g., "Lugares/SubFolder").
 * @param targetFolder The configured target folder (e.g., "Lugares/**" or "Lugares").
 * @returns True if the folder matches the target configuration.
 */
export declare function isFolderMatch(folderPath: string, targetFolder: string): boolean;
export declare function ensureFolderExists(app: App, filePath: string): Promise<void>;
export declare function pathExists(app: App, path: string): Promise<boolean>;
export declare function getTemplatesFolder(app: App): string | null;
export declare function moveFile(app: App, file: TFile, targetPath: string): Promise<void>;
export declare function ensureFolderNotes(app: App, filePath: string): Promise<void>;
