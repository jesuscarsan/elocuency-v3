export const PlaceTypes = [
    "Lugares/Restaurantes",
    "Lugares/Monumentos",
    "Lugares/Paisajes",
    "Lugares/Playas",
    "Lugares/Montañas",
    "Lugares/Parques",
    "Lugares/Cafeterías",
    "Lugares/Bares",
    "Lugares/Museos Artes",
    "Lugares/Museos Ciencia",
    "Lugares/Hoteles",
    "Lugares/Tiendas",
    "Lugares/Estadios",
    "Lugares/Auditorios",
    "Lugares/Bibliotecas"
] as const;

export type PlaceType = (typeof PlaceTypes)[number];
