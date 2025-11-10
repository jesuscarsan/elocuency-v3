import { App, Notice, normalizePath } from 'obsidian';
import {
  UnresolvedLinkGeneratorSettings,
  LocationStrategy,
} from '../settings';
import { showMessage } from '../utils/Messages';
import { ensureFolderExists, pathExists } from '../utils/vault';

type UnresolvedLinks = Record<string, Record<string, number>>;

export async function generateMissingNotes(
  app: App,
  settings: UnresolvedLinkGeneratorSettings,
) {
  const unresolved = app.metadataCache.unresolvedLinks as UnresolvedLinks;
  const createdPaths: string[] = [];
  const skippedPaths: string[] = [];
  // De-duplicate targets so each unresolved link becomes a single note.
  const plannedCreations = new Map<string, string>();

  for (const [sourcePath, linkMap] of Object.entries(unresolved)) {
    const folder = resolveFolderForSource(sourcePath, settings.locationStrategy, settings.targetFolder);

    for (const linkName of Object.keys(linkMap)) {
      const targetPath = buildTargetPath(linkName, folder);
      if (!targetPath) {
        skippedPaths.push(linkName);
        continue;
      }

      if (plannedCreations.has(targetPath)) {
        continue;
      }

      plannedCreations.set(targetPath, linkName);
    }
  }

  for (const [targetPath, linkName] of plannedCreations.entries()) {
    if (await pathExists(app, targetPath)) {
      skippedPaths.push(targetPath);
      continue;
    }

    await ensureFolderExists(app, targetPath);
    const content = renderTemplate(linkName, settings.fileTemplate);
    await app.vault.create(targetPath, content);
    createdPaths.push(targetPath);
  }

  showMessage(buildNotice(createdPaths.length, skippedPaths.length));
}

function resolveFolderForSource(
  sourcePath: string,
  strategy: LocationStrategy,
  targetFolder: string,
): string {
  if (strategy === 'fixed-folder') {
    return targetFolder.trim();
  }

  const lastSlashIndex = sourcePath.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return '';
  }

  return sourcePath.slice(0, lastSlashIndex + 1);
}

function buildTargetPath(linkName: string, baseFolder: string): string | null {
  const sanitized = sanitizeLinkName(linkName);
  if (!sanitized) {
    return null;
  }

  const folder = baseFolder ? baseFolder.replace(/\/+$/, '') + '/' : '';
  const fullPath = `${folder}${sanitized}.md`;
  return normalizePath(fullPath);
}

function sanitizeLinkName(linkName: string): string {
  const name = linkName.split('|')[0]?.trim();
  if (!name) {
    return '';
  }

  return name
    .replace(/\\/g, '/')
    .replace(/:+/g, ' -')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderTemplate(linkName: string, template: string): string {
  const title =
    linkName.split('|')[1]?.trim() ?? linkName.split('|')[0]?.trim() ?? '';
  return template.replace(/{{title}}/g, title);
}

function buildNotice(createdCount: number, skippedCount: number): string {
  if (createdCount === 0 && skippedCount === 0) {
    return 'No unresolved links detected.';
  }

  if (createdCount === 0) {
    return `No new notes created. ${skippedCount} links already had notes.`;
  }

  if (skippedCount === 0) {
    return `Created ${createdCount} notes for unresolved links.`;
  }

  return `Created ${createdCount} notes; skipped ${skippedCount} existing files.`;
}
