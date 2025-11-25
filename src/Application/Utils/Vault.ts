import { App, normalizePath } from 'obsidian';

/**
 * Checks if a given folder path matches a target folder configuration.
 * Supports exact matches and wildcard matches using '/**' suffix.
 *
 * @param folderPath The path of the folder to check (e.g., "Lugares/SubFolder").
 * @param targetFolder The configured target folder (e.g., "Lugares/**" or "Lugares").
 * @returns True if the folder matches the target configuration.
 */
export function isFolderMatch(folderPath: string, targetFolder: string): boolean {
  const normalizedFolder = normalizePath(folderPath);
  const normalizedTarget = normalizePath(targetFolder);

  // Check for wildcard match
  if (normalizedTarget.endsWith('/**')) {
    const prefix = normalizedTarget.slice(0, -3); // Remove '/**'
    // It matches if it starts with the prefix and the next char is a separator or end of string
    // But since we are matching folders, we want to ensure we match directory boundaries.
    // Example: target "Lugares/**" (prefix "Lugares") should match "Lugares/A" but not "LugaresExtra/A"

    if (normalizedFolder === prefix) {
      return true;
    }

    if (normalizedFolder.startsWith(prefix + '/')) {
      return true;
    }

    return false;
  }

  // Exact match
  return normalizedFolder === normalizedTarget;
}

export async function ensureFolderExists(app: App, filePath: string) {
  const folderPath = filePath.split('/').slice(0, -1).join('/');
  if (!folderPath) {
    return;
  }

  const normalized = normalizePath(folderPath);
  const folder = app.vault.getAbstractFileByPath(normalized);
  if (!folder) {
    await createFolderRecursively(app, normalized);
  }
}

export async function pathExists(app: App, path: string): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(path);
  if (file) {
    return true;
  }

  return app.vault.adapter.exists(path);
}

export function getTemplatesFolder(app: App): string | null {
  const internalPlugins = (app as any).internalPlugins;
  const templatesPlugin = internalPlugins?.getPluginById?.('templates');
  if (!templatesPlugin) {
    return null;
  }

  const options =
    templatesPlugin.instance?.options ?? templatesPlugin.options ?? null;

  if (!options) {
    return null;
  }

  const candidates = [
    options.folder,
    options.templatesFolder,
    options.templateFolder,
    options.dir,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

async function createFolderRecursively(app: App, folderPath: string) {
  const parts = folderPath.split('/');
  let current = '';

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) {
      await app.vault.createFolder(current);
    }
  }
}
