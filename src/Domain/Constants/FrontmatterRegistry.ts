export const FrontmatterKeys = {
    Municipio: "Municipio",
    Provincia: "Provincia",
    Region: "Region",
    Pais: "Pais",
    LugarId: "Lugar Id",
    Latitud: "Latitud",
    Longitud: "Longitud",
    StreamUrl: "Stream Url",
} as const;

export type FrontmatterKey = (typeof FrontmatterKeys)[keyof typeof FrontmatterKeys];

export interface FrontmatterFieldConfig {
    key: FrontmatterKey;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
}

export const FrontmatterRegistry: Record<string, FrontmatterFieldConfig> = {
    [FrontmatterKeys.Municipio]: {
        key: FrontmatterKeys.Municipio,
        description: "Nombre del municipio, ciudad o pueblo",
        type: 'string'
    },
    [FrontmatterKeys.Provincia]: {
        key: FrontmatterKeys.Provincia,
        description: "Nombre de la provincia administrativa",
        type: 'string'
    },
    [FrontmatterKeys.Region]: {
        key: FrontmatterKeys.Region,
        description: "Comunidad autónoma o región",
        type: 'string'
    },
    [FrontmatterKeys.Pais]: {
        key: FrontmatterKeys.Pais,
        description: "País soberano",
        type: 'string'
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
    }
};
