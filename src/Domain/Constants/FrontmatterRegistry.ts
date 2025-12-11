export const FrontmatterKeys = {
    Municipio: "Municipio",
    Provincia: "Provincia",
    Region: "Region",
    Pais: "País",
    LugarId: "Lugar Id",
    Latitud: "Latitud",
    Longitud: "Longitud",
    StreamUrl: "Stream Url",
    Capital: "Capital",
    Tags: "tags",
    ImagenesUrls: "Imagenes urls",
} as const;

export type FrontmatterKey = (typeof FrontmatterKeys)[keyof typeof FrontmatterKeys];

export interface FrontmatterFieldConfig {
    key: FrontmatterKey;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    asLink?: boolean;
}

export const FrontmatterRegistry: Record<string, FrontmatterFieldConfig> = {
    [FrontmatterKeys.Municipio]: {
        key: FrontmatterKeys.Municipio,
        description: "Nombre del municipio, ciudad o pueblo",
        type: 'string',
        asLink: true
    },
    [FrontmatterKeys.Provincia]: {
        key: FrontmatterKeys.Provincia,
        description: "Nombre de la provincia administrativa",
        type: 'string',
        asLink: true
    },
    [FrontmatterKeys.Region]: {
        key: FrontmatterKeys.Region,
        description: "Comunidad autónoma o región",
        type: 'string',
        asLink: true
    },
    [FrontmatterKeys.Pais]: {
        key: FrontmatterKeys.Pais,
        description: "País soberano",
        type: 'string',
        asLink: true
    },
    [FrontmatterKeys.LugarId]: {
        key: FrontmatterKeys.LugarId,
        description: "Identificador único del lugar (ej. Google Place ID)",
        type: 'string'
    },
    [FrontmatterKeys.Latitud]: {
        key: FrontmatterKeys.Latitud,
        description: "Coordenada de latitud geográfica",
        type: 'number'
    },
    [FrontmatterKeys.Longitud]: {
        key: FrontmatterKeys.Longitud,
        description: "Coordenada de longitud geográfica",
        type: 'number'
    },
    [FrontmatterKeys.StreamUrl]: {
        key: FrontmatterKeys.StreamUrl,
        description: "URL del video o streaming original",
        type: 'string'
    },
    [FrontmatterKeys.Capital]: {
        key: FrontmatterKeys.Capital,
        description: "Capital del país (si aplica)",
        type: 'string',
        asLink: true
    },
    [FrontmatterKeys.Tags]: {
        key: FrontmatterKeys.Tags,
        description: "Etiquetas",
        type: 'array'
    },
    [FrontmatterKeys.ImagenesUrls]: {
        key: FrontmatterKeys.ImagenesUrls,
        description: "Lista de URLs de imágenes del lugar",
        type: 'array'
    }
};
