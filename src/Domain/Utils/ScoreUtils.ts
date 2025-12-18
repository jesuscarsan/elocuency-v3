
export class ScoreUtils {
    /**
     * Converts an importance score (0-10) to a star rating (1-5).
     * @param importance The raw importance score from 0 to 10.
     * @returns A number between 1 and 5.
     */
    public static importanceToStars(importance: number): number {
        if (importance <= 0) return 0; // Or 1? Usually 0 means unrated. 
        // Mapping: 
        // 1-2 -> 1
        // 3-4 -> 2
        // 5-6 -> 3
        // 7-8 -> 4
        // 9-10 -> 5
        return Math.min(5, Math.ceil(importance / 2));
    }

    /**
     * Converts a difficulty score (0-10) to a roughly mapped color or level if needed.
     * (Placeholder for future use)
     */
    public static difficultyToColor(difficulty: number): string {
        if (difficulty < 4) return 'green';
        if (difficulty < 7) return 'yellow';
        return 'red';
    }
}
