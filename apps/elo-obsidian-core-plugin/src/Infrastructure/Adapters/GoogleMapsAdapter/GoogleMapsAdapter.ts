import { requestUrl, App, FuzzySuggestModal, SuggestModal } from 'obsidian';
import { showMessage } from 'src/Infrastructure/Obsidian/Utils/Messages';
import type {
  GeocodingResponse,
  GeocodingPort,
  GeocodingParams,
} from '@elo/core';

const EMPTY_PLACE_DETAILS: GeocodingResponse = {
  municipio: '',
  provincia: '',
  region: '',
  pais: '',
};

const LOG_PREFIX = '[elo-obsidian-ext]';

type GoogleGeocodeComponent = {
  long_name?: string;
  types?: string[];
};

type GoogleGeocodeGeometry = {
  location: {
    lat: number;
    lng: number;
  };
};

type GoogleGeocodeResult = {
  address_components?: GoogleGeocodeComponent[];
  place_id?: string;
  formatted_address?: string;
  geometry?: GoogleGeocodeGeometry;
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleGeocodeResult[];
};

export class GoogleMapsAdapter implements GeocodingPort {
  private readonly apiKey: string;
  private readonly app: App;

  constructor(apiKey: string, app: App) {
    this.apiKey = apiKey.trim();
    this.app = app;
  }

  async requestPlaceDetails(
    params: GeocodingParams,
  ): Promise<GeocodingResponse | null> {
    if (!this.apiKey) {
      showMessage(
        'Configura tu clave de la API de Google Maps en los ajustes para completar los datos de un lugar.',
      );
      return null;
    }

    const trimmedName = params.placeName.trim();
    if (!trimmedName && !params.placeId) {
      console.warn(
        `${LOG_PREFIX} Google Maps request omitido: el nombre del lugar y el ID están vacíos.`,
      );
      return EMPTY_PLACE_DETAILS;
    }

    try {
      let placeIdToUse = params.placeId;

      // Handle Hex/CID format (0x...:0x...)
      if (placeIdToUse && /^0x[a-fA-F0-9]+:0x[a-fA-F0-9]+$/.test(placeIdToUse)) {
        console.info(`${LOG_PREFIX} Detectado ID hexadecimal (CID). Resolviendo a Place ID estándar...`);
        const resolvedPlaceId = await this.resolveCidToPlaceId(placeIdToUse);
        if (resolvedPlaceId) {
          placeIdToUse = resolvedPlaceId;
          console.info(`${LOG_PREFIX} CID resuelto a Place ID: ${placeIdToUse}`);
        } else {
          console.warn(`${LOG_PREFIX} No se pudo resolver el CID a Place ID.`);
          // FALLBACK: If we have a name, use it invalidating the Hex ID to avoid 400
          if (trimmedName) {
            console.info(`${LOG_PREFIX} Usando nombre "${trimmedName}" como fallback.`);
            placeIdToUse = undefined;
          } else {
            // If we don't have a name and resolution failed, we can't proceed with this ID.
            showMessage('No se pudo resolver el ID de Google Maps y no hay nombre asociado.');
            return null;
          }
        }
      }

      let query: URLSearchParams;

      if (placeIdToUse) {
        query = new URLSearchParams({
          place_id: placeIdToUse,
          key: this.apiKey,
          language: 'es',
        });
      } else {
        query = new URLSearchParams({
          address: trimmedName,
          key: this.apiKey,
          language: 'es',
        });
      }

      const response = await requestUrl({
        url: `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`,
        method: 'GET',
      });

      const data = (response.json ??
        JSON.parse(response.text)) as GoogleGeocodeResponse;
      if (!data || typeof data !== 'object') {
        console.error(
          `${LOG_PREFIX} Google Maps devolvió una respuesta inesperada para "${trimmedName}".`,
          data,
        );
        showMessage(
          'No se pudo interpretar la respuesta de Google Maps. Revisa la consola.',
        );
        return null;
      }
      console.log({ google_maps: data });
      const status = typeof data.status === 'string' ? data.status : '';

      if (status !== 'OK') {
        if (status === 'ZERO_RESULTS') {
          console.warn(
            `${LOG_PREFIX} Google Maps no encontró resultados para "${trimmedName}".`,
          );
          showMessage(
            `Google Maps no encontró resultados para "${trimmedName}".`,
          );
          return { ...EMPTY_PLACE_DETAILS };
        }

        if (status === 'INVALID_REQUEST') {
          // Often caused by malformed place_id
          console.error(`${LOG_PREFIX} Google Maps INVALID_REQUEST. PlaceID: ${placeIdToUse}, Name: ${trimmedName}`);
          showMessage('Error en la petición a Google Maps (IDs inválidos).');
          return null;
        }

        const errorMessage =
          typeof data.error_message === 'string'
            ? data.error_message
            : 'Consulta la consola para más detalles.';
        console.error(
          `${LOG_PREFIX} Google Maps rechazó la petición (${status}) para "${trimmedName}": ${errorMessage}`,
        );
        showMessage(
          'Google Maps rechazó la petición. Consulta la consola para más detalles.',
        );
        return null;
      }

      const results = Array.isArray(data.results) ? data.results : [];

      if (results.length === 0) {
        console.warn(
          `${LOG_PREFIX} Google Maps devolvió una respuesta sin resultados para "${trimmedName}".`,
        );
        return { ...EMPTY_PLACE_DETAILS };
      }

      let selectedResult: GoogleGeocodeResult;

      if (results.length > 1) {
        const userSelection = await this.askUserToSelect(results);
        if (!userSelection) {
          showMessage('Selección cancelada por el usuario.');
          return null;
        }
        selectedResult = userSelection;
      } else {
        selectedResult = results[0];
      }

      const placeDetails = this.extractPlaceDetails(selectedResult, 0);

      if (!placeDetails.municipio && placeDetails.provincia && placeDetails.pais) {
        console.warn(
          `${LOG_PREFIX} Google Maps no devolvió municipio, pero sí provincia y país para "${trimmedName}". Intentando recuperar el municipio...`,
        );

        // Intento de recuperación mediante geocodificación inversa
        const bestLocation = selectedResult.geometry?.location;
        if (bestLocation) {
          console.info(
            `${LOG_PREFIX} en (${bestLocation.lat}, ${bestLocation.lng})...`,
          );
          try {
            const reverseQuery = new URLSearchParams({
              latlng: `${bestLocation.lat},${bestLocation.lng}`,
              key: this.apiKey,
              language: 'es',
            });

            const reverseResponse = await requestUrl({
              url: `https://maps.googleapis.com/maps/api/geocode/json?${reverseQuery.toString()}`,
              method: 'GET',
            });

            const reverseData = (reverseResponse.json ??
              JSON.parse(reverseResponse.text)) as GoogleGeocodeResponse;

            if (
              reverseData &&
              reverseData.status === 'OK' &&
              Array.isArray(reverseData.results) &&
              reverseData.results.length > 0
            ) {
              // For reverse geocoding, we usually trust the first result or merge logic.
              // Since we already have a specific location, we can just take the first result of reverse geocoding
              // which is usually the most specific address.
              const reverseBest = this.extractPlaceDetails(reverseData.results[0], 0);

              console.log({ reverseBest, placeDetails });
              if (!placeDetails.municipio && reverseBest.municipio)
                placeDetails.municipio = reverseBest.municipio;
              if (!placeDetails.provincia && reverseBest.provincia)
                placeDetails.provincia = reverseBest.provincia;
              if (!placeDetails.region && reverseBest.region)
                placeDetails.region = reverseBest.region;
              if (!placeDetails.pais && reverseBest.pais)
                placeDetails.pais = reverseBest.pais;

              console.info(
                `${LOG_PREFIX} Datos actualizados tras geocodificación inversa:`,
                placeDetails,
              );
            }
          } catch (reverseError) {
            console.error(
              `${LOG_PREFIX} Falló la geocodificación inversa.`,
              reverseError,
            );
          }
        }
      } else {
        console.info(
          `${LOG_PREFIX} Google Maps resolvió "${trimmedName}" correctamente.`,
        );
      }

      this.normalizeSpanishRegion(placeDetails);
      console.log({ placeDetails });
      return placeDetails;
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Error al consultar Google Maps para "${trimmedName}".`,
        error,
      );
      showMessage(
        'Google Maps no respondió. Revisa la consola para más detalles.',
      );
      return null;
    }
  }

  private async resolveCidToPlaceId(hexCid: string): Promise<string | null> {
    try {
      // Format: 0x<feature_id_ignored>:0x<cid>
      const parts = hexCid.split(':');
      if (parts.length !== 2) return null;

      const cidHex = parts[1]; // 0x...
      // Convert to decimal. 
      // Note: BigInt is needed because CID is 64-bit unsigned, typically large.
      const cidDecimal = BigInt(cidHex).toString();

      const query = new URLSearchParams({
        input: `cid:${cidDecimal}`,
        inputtype: 'textquery',
        fields: 'place_id',
        key: this.apiKey
      });

      // Use Places API Find Place from Text
      const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${query.toString()}`;

      const response = await requestUrl({
        url: url,
        method: 'GET'
      });

      const data = (response.json ?? JSON.parse(response.text));

      if (data.status === 'OK' && Array.isArray(data.candidates) && data.candidates.length > 0) {
        return data.candidates[0].place_id;
      }

      console.warn(`${LOG_PREFIX} resolveCidToPlaceId failed: ${data.status}`, data);
      return null;

    } catch (e) {
      console.error(`${LOG_PREFIX} resolveCidToPlaceId error`, e);
      return null;
    }
  }

  private async askUserToSelect(results: GoogleGeocodeResult[]): Promise<GoogleGeocodeResult | null> {
    return new Promise((resolve) => {
      const modal = new GoogleMapsSuggestModal(this.app, results, (selected) => {
        resolve(selected);
      });
      modal.open();
    });
  }

  private extractPlaceDetails(
    result: GoogleGeocodeResult,
    index: number,
  ): GeocodingResponse {
    const components = Array.isArray(result.address_components)
      ? (result.address_components as GoogleGeocodeComponent[])
      : [];

    const lookup = (types: string[]): string => {
      for (const component of components) {
        const componentTypes = Array.isArray(component.types)
          ? component.types
          : [];
        if (types.some((type) => componentTypes.includes(type))) {
          const value =
            typeof component.long_name === 'string'
              ? component.long_name.trim()
              : '';
          if (value) {
            return value;
          }
        }
      }
      return '';
    };

    const lugar = lookup([
      'locality',
    ]);
    const barrio = lookup([
      'postal_town',
      'sublocality',
    ]);
    const municipio = lookup([
      'administrative_area_level_4',
      'administrative_area_level_3',
    ]);
    const provincia = lookup([
      'administrative_area_level_2',
    ]);
    const region = lookup(['administrative_area_level_1'])
    const pais = lookup(['country']);
    const googlePlaceId = result.place_id;
    const lat = result.geometry?.location.lat;
    const lng = result.geometry?.location.lng;

    console.info(
      `${LOG_PREFIX} Evaluando resultado #${index + 1} para geocodificación.`,
      {
        lugar,
        barrio,
        municipio,
        provincia,
        region,
        pais,
        placeId: result.place_id,
        formatted_address: result.formatted_address,
      },
    );

    return { lugar, barrio, municipio, provincia, region, pais, googlePlaceId, lat, lng };
  }

  private normalizeSpanishRegion(place: GeocodingResponse): void {
    if (
      !place.pais ||
      (place.pais.toLowerCase() !== 'españa' &&
        place.pais.toLowerCase() !== 'spain')
    ) {
      return;
    }

    if (!place.provincia) {
      return;
    }

    const normalizedProvincia = place.provincia.trim();
    const region = PROVINCE_TO_REGION[normalizedProvincia];

    if (region) {
      console.info(
        `${LOG_PREFIX} Normalizando región para España: "${normalizedProvincia}" -> "${region}"`,
      );
      place.region = region;
    }
  }
}


class GoogleMapsSuggestModal extends SuggestModal<GoogleGeocodeResult> {
  private resolve: (value: GoogleGeocodeResult | null) => void;
  private isResolved = false;

  constructor(
    app: App,
    private results: GoogleGeocodeResult[],
    resolve: (value: GoogleGeocodeResult | null) => void,
  ) {
    super(app);
    this.resolve = resolve;
    console.log('[GoogleMapsSuggestModal] Created (SuggestModal) with results:', results.length);
  }

  getSuggestions(query: string): GoogleGeocodeResult[] {
    const lowerQuery = query.toLowerCase();
    return this.results.filter(item => {
      const text = item.formatted_address || '';
      return text.toLowerCase().includes(lowerQuery);
    });
  }

  renderSuggestion(item: GoogleGeocodeResult, el: HTMLElement) {
    el.createEl("div", { text: item.formatted_address || 'Ubicación desconocida' });
  }

  selectSuggestion(value: GoogleGeocodeResult, evt: MouseEvent | KeyboardEvent): void {
    console.log('[GoogleMapsSuggestModal] selectSuggestion called (pre-super)', value);
    this.isResolved = true;
    this.resolve(value);
    super.selectSuggestion(value, evt);
  }

  onChooseSuggestion(item: GoogleGeocodeResult, evt: MouseEvent | KeyboardEvent) {
    console.log('[GoogleMapsSuggestModal] onChooseSuggestion called', item);
    // Already handled in selectSuggestion, but keeping for safety/standard compliance if needed.
  }

  onClose(): void {
    console.log('[GoogleMapsSuggestModal] onClose called. isResolved:', this.isResolved);
    if (!this.isResolved) {
      this.resolve(null);
    }
  }
}

const PROVINCE_TO_REGION: Record<string, string> = {
  Alava: 'País Vasco',
  Álava: 'País Vasco',
  Araba: 'País Vasco',
  Albacete: 'Castilla-La Mancha',
  Alicante: 'Comunitat Valenciana',
  Alacant: 'Comunitat Valenciana',
  Almería: 'Andalucía',
  Asturias: 'Principado de Asturias',
  Avila: 'Castilla y León',
  Ávila: 'Castilla y León',
  Badajoz: 'Extremadura',
  Baleares: 'Illes Balears',
  'Illes Balears': 'Illes Balears',
  Barcelona: 'Cataluña',
  Burgos: 'Castilla y León',
  Caceres: 'Extremadura',
  Cáceres: 'Extremadura',
  Cadiz: 'Andalucía',
  Cádiz: 'Andalucía',
  Cantabria: 'Cantabria',
  Castellon: 'Comunitat Valenciana',
  Castellón: 'Comunitat Valenciana',
  Castelló: 'Comunitat Valenciana',
  Ceuta: 'Ceuta',
  'Ciudad Real': 'Castilla-La Mancha',
  Cordoba: 'Andalucía',
  Córdoba: 'Andalucía',
  Cuenca: 'Castilla-La Mancha',
  Gerona: 'Cataluña',
  Girona: 'Cataluña',
  Granada: 'Andalucía',
  Guadalajara: 'Castilla-La Mancha',
  Guipuzcoa: 'País Vasco',
  Guipúzcoa: 'País Vasco',
  Gipuzkoa: 'País Vasco',
  Huelva: 'Andalucía',
  Huesca: 'Aragón',
  Jaen: 'Andalucía',
  Jaén: 'Andalucía',
  'La Coruña': 'Galicia',
  'A Coruña': 'Galicia',
  'La Rioja': 'La Rioja',
  'Las Palmas': 'Canarias',
  Leon: 'Castilla y León',
  León: 'Castilla y León',
  Lerida: 'Cataluña',
  Lérida: 'Cataluña',
  Lleida: 'Cataluña',
  Lugo: 'Galicia',
  Madrid: 'Comunidad de Madrid',
  Malaga: 'Andalucía',
  Málaga: 'Andalucía',
  Melilla: 'Melilla',
  Murcia: 'Región de Murcia',
  Navarra: 'Comunidad Foral de Navarra',
  Orense: 'Galicia',
  Ourense: 'Galicia',
  Palencia: 'Castilla y León',
  Pontevedra: 'Galicia',
  Salamanca: 'Castilla y León',
  'Santa Cruz de Tenerife': 'Canarias',
  Segovia: 'Castilla y León',
  Sevilla: 'Andalucía',
  Soria: 'Castilla y León',
  Tarragona: 'Cataluña',
  Teruel: 'Aragón',
  Toledo: 'Castilla-La Mancha',
  Valencia: 'Comunitat Valenciana',
  València: 'Comunitat Valenciana',
  Valladolid: 'Castilla y León',
  Vizcaya: 'País Vasco',
  Bizkaia: 'País Vasco',
  Zamora: 'Castilla y León',
  Zaragoza: 'Aragón',
};
