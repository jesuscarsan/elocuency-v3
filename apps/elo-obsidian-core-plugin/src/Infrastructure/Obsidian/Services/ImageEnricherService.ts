import { ImageSearchPort } from "@elo/core";
import { showMessage } from '@/Infrastructure/Obsidian/Utils/Messages';

export class ImageEnricherService {
    constructor(private readonly imageSearch: ImageSearchPort) { }

    /**
     * Searches for images for a given query and returns them.
     * Handles UI feedback (messages) for starting search, success, and failure.
     * 
     * @param query The search query (usually file basename)
     * @param maxResults Number of images to fetch
     * @returns Array of image URLs
     */
    async searchImages(query: string, maxResults: number = 3): Promise<string[]> {
        showMessage(`Buscando imágenes para: ${query}...`);

        try {
            const images = await this.imageSearch.searchImages(query, maxResults);
            const uniqueImages = [...new Set(images)];

            if (uniqueImages.length === 0) {
                showMessage('No se encontraron imágenes.');
                return [];
            }

            showMessage(`Se encontraron ${uniqueImages.length} imágenes.`);
            return uniqueImages;
        } catch (error) {
            console.error('Error searching images:', error);
            showMessage('Error al buscar imágenes.');
            return [];
        }
    }
}
