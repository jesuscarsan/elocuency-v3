export class GoogleMapsUrlParser {
    static extractPlaceId(url: string): string | null {
        // 1. Intentar buscar el formato estándar ChIJ (27 caracteres aprox.)
        const chijRegex = /ChIJ[a-zA-Z0-9_-]{23}/;
        const chijMatch = url.match(chijRegex);
        if (chijMatch) {
            return chijMatch[0];
        }

        // 2. Si no existe ChIJ, extraer el ID hexadecimal de la URL
        // En la URL está después del parámetro !1s y antes del siguiente !
        const hexRegex = /!1s(0x[a-fA-F0-9]+:0x[a-fA-F0-9]+)/;
        const hexMatch = url.match(hexRegex);

        if (hexMatch && hexMatch[1]) {
            return hexMatch[1];
        }

        return null;
    }

    static extractName(url: string): string | null {
        try {
            // Regex matches /place/NAME/
            const nameRegex = /\/place\/([^/]+)\//;
            const match = url.match(nameRegex);
            if (match && match[1]) {
                // Decode URI component and replace plus signs with spaces
                const decoded = decodeURIComponent(match[1].replace(/\+/g, ' '));
                return decoded;
            }
        } catch (e) {
            console.error('Error extracting name from URL', e);
        }
        return null;
    }
}
