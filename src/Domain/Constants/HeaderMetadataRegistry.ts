export const HeaderMetadataKeys = {
    Score: "score",
    Difficulty: "difficulty",
    Importance: "importance",
} as const;

export type HeaderMetadataKey = (typeof HeaderMetadataKeys)[keyof typeof HeaderMetadataKeys];

export interface HeaderMetadataFieldConfig {
    key: HeaderMetadataKey;
    description: string;
    type: 'number' | 'string' | 'boolean';
    defaultValue: string | number | boolean;
}

export const HeaderMetadataRegistry: Record<string, HeaderMetadataFieldConfig> = {
    [HeaderMetadataKeys.Score]: {
        key: HeaderMetadataKeys.Score,
        description: "Puntuación asociada al contenido",
        type: 'number',
        defaultValue: 0
    },
    [HeaderMetadataKeys.Difficulty]: {
        key: HeaderMetadataKeys.Difficulty,
        description: "Nivel de dificultad",
        type: 'number',
        defaultValue: 0
    },
    [HeaderMetadataKeys.Importance]: {
        key: HeaderMetadataKeys.Importance,
        description: "Nivel de importancia",
        type: 'number',
        defaultValue: 0
    }
};
