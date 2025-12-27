import { App, normalizePath } from 'obsidian';
import {
  UnresolvedLinkGeneratorSettings,
  LocationStrategy,
} from '@/Infrastructure/Obsidian/settings';
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';
import { ensureFolderExists, pathExists } from '@/Infrastructure/Obsidian/Utils/Vault';

type UnresolvedLinks = Record<string, Record<string, number>>;

export class GenerateMissingNotesCommand {
  constructor(
    private readonly app: App,
    private readonly settings: UnresolvedLinkGeneratorSettings,
  ) { }

  async execute(): Promise<void> {
    const unresolved = this.app.metadataCache
      .unresolvedLinks as UnresolvedLinks;
    const createdPaths: string[] = [];
    const skippedPaths: string[] = [];
    // De-duplicate targets so each unresolved link becomes a single note.
    const plannedCreations = new Map<string, string>();

    for (const [sourcePath, linkMap] of Object.entries(unresolved)) {
      const folder = this.resolveFolderForSource(
        sourcePath,
        this.settings.locationStrategy,
        this.settings.targetFolder,
      );

      for (const linkName of Object.keys(linkMap)) {
        const targetPath = this.buildTargetPath(linkName, folder);
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
      if (await pathExists(this.app, targetPath)) {
        skippedPaths.push(targetPath);
        continue;
      }

      await ensureFolderExists(this.app, targetPath);
      const content = this.renderTemplate(linkName, this.settings.missingNotesTemplatePath);
      await this.app.vault.create(targetPath, content);
      createdPaths.push(targetPath);
    }

    showMessage(this.buildNotice(createdPaths.length, skippedPaths.length));
  }

  private resolveFolderForSource(
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

  private buildTargetPath(linkName: string, baseFolder: string): string | null {
    const sanitized = this.sanitizeLinkName(linkName);
    if (!sanitized) {
      return null;
    }

    const folder = baseFolder ? baseFolder.replace(/\/+$/, '') + '/' : '';
    const fullPath = `${folder}${sanitized}.md`;
    return normalizePath(fullPath);
  }

  private sanitizeLinkName(linkName: string): string {
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

  private renderTemplate(linkName: string, template: string): string {
    const title =
      linkName.split('|')[1]?.trim() ?? linkName.split('|')[0]?.trim() ?? '';
    return template.replace(/{{title}}/g, title);
  }

  private buildNotice(createdCount: number, skippedCount: number): string {
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
}
