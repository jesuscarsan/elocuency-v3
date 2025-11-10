import { App, normalizePath } from 'obsidian';

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
