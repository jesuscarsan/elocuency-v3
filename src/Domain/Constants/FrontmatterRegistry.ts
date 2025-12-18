export const FrontmatterKeys = {
    Municipio: "Municipio",
    Provincia: "Provincia",
    Region: "Region",
    Pais: "País",
    LugarId: "Lugar Id",
    Lugares: "Lugares",
    Lugar: "Lugar",
    Latitud: "Latitud",
    Longitud: "Longitud",
    Url: "Url",
    SpotifyUri: "Spotify uri",
    Capital: "Capital",
    Tags: "tags",
    ImagenesUrls: "Imagenes urls",
    AiCommands: "!!commands",
    AiPrompt: "!!prompt",
    Conocidos: "Conocidos",
    Hijos: "Hijos",
    Padres: "Padres",
    Parejas: "Parejas",
    Exparejas: "Exparejas",
    Hermanos: "Hermanos",
    Familiares: "Familiares",
    CompanerosTrabajo: "Compañeros de trabajo",
    Jefes: "Jefes",
    Empleados: "Empleados",
    EstilosMusicales: "Estilos musicales",
    SpotifyPopularity: "Spotify popularidad",
} as const;

export type FrontmatterKey = (typeof FrontmatterKeys)[keyof typeof FrontmatterKeys];

export interface FrontmatterFieldConfig {
    key: FrontmatterKey;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    asLink?: boolean;
    reciprocityField?: FrontmatterKey;
    forRealocateNote?: boolean;
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
    [FrontmatterKeys.Lugares]: {
        key: FrontmatterKeys.Lugares,
        description: "Lugares relacionados",
        type: 'array',
        forRealocateNote: true,
        asLink: true
    },
    [FrontmatterKeys.Lugar]: {
        key: FrontmatterKeys.Lugar,
        description: "Lugar relacionado",
        type: 'string',
        forRealocateNote: true,
        asLink: true
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
    [FrontmatterKeys.Url]: {
        key: FrontmatterKeys.Url,
        description: "URL de la web, video, streaming, ...",
        type: 'string'
    },
    [FrontmatterKeys.SpotifyUri]: {
        key: FrontmatterKeys.SpotifyUri,
        description: "URI de Spotify",
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
    },
    [FrontmatterKeys.AiCommands]: {
        key: FrontmatterKeys.AiCommands,
        description: "Comandos adicionales para la IA",
        type: 'array'
    },
    [FrontmatterKeys.AiPrompt]: {
        key: FrontmatterKeys.AiPrompt,
        description: "Prompt personalizado para la IA",
        type: 'string'
    },
    [FrontmatterKeys.Conocidos]: {
        key: FrontmatterKeys.Conocidos,
        description: "Lista de conocidos",
        type: 'array',
        reciprocityField: FrontmatterKeys.Conocidos,
        asLink: true
    },
    [FrontmatterKeys.Hijos]: {
        key: FrontmatterKeys.Hijos,
        description: "Hijos de la persona",
        type: 'array',
        reciprocityField: FrontmatterKeys.Padres,
        asLink: true
    },
    [FrontmatterKeys.Padres]: {
        key: FrontmatterKeys.Padres,
        description: "Padres de la persona",
        type: 'array',
        reciprocityField: FrontmatterKeys.Hijos,
        asLink: true
    },
    [FrontmatterKeys.Parejas]: {
        key: FrontmatterKeys.Parejas,
        description: "Parejas actuales",
        type: 'array',
        reciprocityField: FrontmatterKeys.Parejas,
        asLink: true
    },
    [FrontmatterKeys.Exparejas]: {
        key: FrontmatterKeys.Exparejas,
        description: "Exparejas",
        type: 'array',
        reciprocityField: FrontmatterKeys.Exparejas,
        asLink: true
    },
    [FrontmatterKeys.Hermanos]: {
        key: FrontmatterKeys.Hermanos,
        description: "Hermanos",
        type: 'array',
        reciprocityField: FrontmatterKeys.Hermanos,
        asLink: true
    },
    [FrontmatterKeys.Familiares]: {
        key: FrontmatterKeys.Familiares,
        description: "Otros familiares",
        type: 'array',
        reciprocityField: FrontmatterKeys.Familiares,
        asLink: true
    },
    [FrontmatterKeys.CompanerosTrabajo]: {
        key: FrontmatterKeys.CompanerosTrabajo,
        description: "Compañeros de trabajo",
        type: 'array',
        reciprocityField: FrontmatterKeys.CompanerosTrabajo,
        asLink: true
    },
    [FrontmatterKeys.Jefes]: {
        key: FrontmatterKeys.Jefes,
        description: "Jefes directos",
        type: 'array',
        reciprocityField: FrontmatterKeys.Empleados,
        asLink: true
    },
    [FrontmatterKeys.Empleados]: {
        key: FrontmatterKeys.Empleados,
        description: "Empleados a cargo",
        type: 'array',
        reciprocityField: FrontmatterKeys.Jefes,
        asLink: true
    },
    [FrontmatterKeys.EstilosMusicales]: {
        key: FrontmatterKeys.EstilosMusicales,
        description: "Estilos musicales del artista",
        type: 'array'
    },
    [FrontmatterKeys.SpotifyPopularity]: {
        key: FrontmatterKeys.SpotifyPopularity,
        description: "Popularidad del artista en Spotify (0-100)",
        type: 'number'
    }
};
