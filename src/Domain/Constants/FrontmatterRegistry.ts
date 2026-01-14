import { CommandEnum } from "./CommandIds";

export const FrontmatterKeys = {
    EloCommands: "!!commands",
    EloPrompt: "!!prompt",
    EloImages: "!!images",
    Municipio: "Municipio",
    Provincia: "Provincia",
    Region: "Región",
    Pais: "País",
    Paises: "Países",
    LugarId: "Lugar Id",
    Lugares: "Lugares",
    Lugar: "Lugar",
    SedePrincipal: "Sede principal",
    Latitud: "Latitud",
    Longitud: "Longitud",
    Url: "Url",
    SpotifyUri: "Spotify uri",
    Capital: "Capital",
    Tags: "tags",
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
    isRelocateField?: boolean;
    commands?: string[];
}


export const FrontmatterRegistry: Record<string, FrontmatterFieldConfig> = {
    // Internal fields:
    [FrontmatterKeys.EloCommands]: {
        key: FrontmatterKeys.EloCommands,
        description: "Comandos adicionales para la IA",
        type: 'array'
    },
    [FrontmatterKeys.EloPrompt]: {
        key: FrontmatterKeys.EloPrompt,
        description: "Prompt personalizado para la IA",
        type: 'string'
    },

    // User fields:
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
        description: "País",
        type: 'string',
        isRelocateField: true,
        asLink: true,
        commands: [CommandEnum.RelocateNoteByLinkField]
    },
    [FrontmatterKeys.Paises]: {
        key: FrontmatterKeys.Paises,
        description: "Países",
        type: 'array',
        isRelocateField: true,
        asLink: true,
        commands: [CommandEnum.RelocateNoteByLinkField]
    },
    [FrontmatterKeys.LugarId]: {
        key: FrontmatterKeys.LugarId,
        description: "Identificador único del lugar (ej. Google Place ID)",
        type: 'string',
        commands: [CommandEnum.RelocateNoteByLinkField]
    },
    [FrontmatterKeys.Lugares]: {
        key: FrontmatterKeys.Lugares,
        description: "Lugares relacionados",
        type: 'array',
        isRelocateField: true,
        asLink: true,
        commands: [CommandEnum.RelocateNoteByLinkField]
    },
    [FrontmatterKeys.Lugar]: {
        key: FrontmatterKeys.Lugar,
        description: "Lugar relacionado",
        type: 'string',
        isRelocateField: true,
        asLink: true,
        commands: [CommandEnum.RelocateNoteByLinkField]
    },
    [FrontmatterKeys.SedePrincipal]: {
        key: FrontmatterKeys.SedePrincipal,
        description: "Sede principal",
        isRelocateField: true,
        type: 'string',
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
        type: 'string',
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

    [FrontmatterKeys.Conocidos]: {
        key: FrontmatterKeys.Conocidos,
        description: "Lista de conocidos",
        type: 'array',
        reciprocityField: FrontmatterKeys.Conocidos,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Hijos]: {
        key: FrontmatterKeys.Hijos,
        description: "Hijos de la persona",
        type: 'array',
        reciprocityField: FrontmatterKeys.Padres,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Padres]: {
        key: FrontmatterKeys.Padres,
        description: "Padres de la persona",
        type: 'array',
        reciprocityField: FrontmatterKeys.Hijos,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Parejas]: {
        key: FrontmatterKeys.Parejas,
        description: "Parejas actuales",
        type: 'array',
        reciprocityField: FrontmatterKeys.Parejas,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Exparejas]: {
        key: FrontmatterKeys.Exparejas,
        description: "Exparejas",
        type: 'array',
        reciprocityField: FrontmatterKeys.Exparejas,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Hermanos]: {
        key: FrontmatterKeys.Hermanos,
        description: "Hermanos",
        type: 'array',
        reciprocityField: FrontmatterKeys.Hermanos,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Familiares]: {
        key: FrontmatterKeys.Familiares,
        description: "Otros familiares",
        type: 'array',
        reciprocityField: FrontmatterKeys.Familiares,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.CompanerosTrabajo]: {
        key: FrontmatterKeys.CompanerosTrabajo,
        description: "Compañeros de trabajo",
        type: 'array',
        reciprocityField: FrontmatterKeys.CompanerosTrabajo,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Jefes]: {
        key: FrontmatterKeys.Jefes,
        description: "Jefes directos",
        type: 'array',
        reciprocityField: FrontmatterKeys.Empleados,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
    },
    [FrontmatterKeys.Empleados]: {
        key: FrontmatterKeys.Empleados,
        description: "Empleados a cargo",
        type: 'array',
        reciprocityField: FrontmatterKeys.Jefes,
        asLink: true,
        commands: [CommandEnum.CreateReciprocityLinksNotes]
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
    },
    [FrontmatterKeys.EloImages]: {
        key: FrontmatterKeys.EloImages,
        description: "Lista de fotos enlazadas (elo-bridge)",
        type: 'array'
    }
};
