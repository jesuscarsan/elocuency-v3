import { App, TFile, normalizePath } from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';

export class PersonasNoteOrganizer {
    constructor(private readonly app: App) { }

    async organize(file: TFile, frontmatter: Record<string, unknown>): Promise<void> {
        // Check if the file is in a 'personas' folder (or subfolder)
        // We look for 'personas' directory in the path.
        const pathParts = file.path.split('/');
        // Assuming 'personas' is a top-level folder or significant folder. 
        // The user request says "cuando se aplique un template en la carpeta personas"
        // so we check if 'personas' is part of the path.
        const personasIndex = pathParts.findIndex(p => p.toLowerCase() === 'personas');

        if (personasIndex === -1) {
            return;
        }

        const paises = frontmatter['Paises'];
        const regiones = frontmatter['Regiones'];

        // Get the first value from the arrays or strings
        const pais = this.getFirstValue(paises);
        const region = this.getFirstValue(regiones);

        if (!pais) {
            // Can't organize without Country
            return;
        }

        // Construct the new path relative to the 'personas' folder found
        // The root for organization is the 'personas' folder.
        // pathParts.slice(0, personasIndex + 1) gives us path up to .../personas
        const basePath = pathParts.slice(0, personasIndex + 1).join('/');

        let newPathParts = [basePath, pais];
        if (region) {
            newPathParts.push(region);
        }
        newPathParts.push(file.name);

        const newPath = normalizePath(newPathParts.join('/'));

        if (newPath === file.path) {
            return;
        }

        try {
            await this.ensureFolderExists(newPath);
            await this.app.fileManager.renameFile(file, newPath);
            showMessage(`Nota movida a: ${newPath}`);
        } catch (error) {
            console.error('Error moving persona note:', error);
            showMessage(`Error al mover la nota: ${(error as Error).message}`);
        }
    }

    private getFirstValue(value: unknown): string | null {
        if (typeof value === 'string') {
            return value.trim();
        }
        if (Array.isArray(value) && value.length > 0) {
            const first = value[0];
            if (typeof first === 'string') {
                return first.trim();
            }
        }
        return null;
    }

    private async ensureFolderExists(filePath: string): Promise<void> {
        const folders = filePath.split('/').slice(0, -1);
        if (folders.length === 0) return;

        let currentPath = '';
        for (const folder of folders) {
            currentPath = currentPath === '' ? folder : `${currentPath}/${folder}`;
            const normalizedPath = normalizePath(currentPath);
            const exists = this.app.vault.getAbstractFileByPath(normalizedPath);
            if (!exists) {
                await this.app.vault.createFolder(normalizedPath);
            }
        }
    }
}
