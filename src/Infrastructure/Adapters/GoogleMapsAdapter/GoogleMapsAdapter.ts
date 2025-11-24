import { requestUrl } from 'obsidian';
import { showMessage } from 'src/Application/Utils/Messages';
import type {
  GeocodingResponse,
  GeocodingPort,
  GeocodingParams,
} from 'src/Domain/Ports/GeocodingPort';

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

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
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
    if (!trimmedName) {
      console.warn(
        `${LOG_PREFIX} Google Maps request omitido: el nombre del lugar está vacío.`,
      );
      return EMPTY_PLACE_DETAILS;
    }

    try {
      const query = new URLSearchParams({
        address: trimmedName,
        key: this.apiKey,
        language: 'es',
      });

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

      const candidatePlaces = results.map((result, index) =>
        this.extractPlaceDetails(result, index),
      );
      const mergedPlace = this.mergeBestPlace(candidatePlaces);

      const missingFields: string[] = [];
      if (!mergedPlace.municipio) missingFields.push('municipio');
      if (!mergedPlace.provincia) missingFields.push('provincia');
      if (!mergedPlace.region) missingFields.push('región');
      if (!mergedPlace.pais) missingFields.push('país');

      if (missingFields.length > 0) {
        console.warn(
          `${LOG_PREFIX} Google Maps no devolvió ${missingFields.join(', ')} para "${trimmedName}". Se usó el mejor resultado disponible.`,
        );

        // Intento de recuperación mediante geocodificación inversa
        const bestLocation = results[0]?.geometry?.location;
        if (bestLocation) {
          console.info(
            `${LOG_PREFIX} Intentando recuperar datos faltantes mediante geocodificación inversa en (${bestLocation.lat}, ${bestLocation.lng})...`,
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
              Array.isArray(reverseData.results)
            ) {
              const reverseCandidates = reverseData.results.map(
                (result, index) => this.extractPlaceDetails(result, index),
              );
              const reverseBest = this.mergeBestPlace(reverseCandidates);

              if (!mergedPlace.municipio && reverseBest.municipio)
                mergedPlace.municipio = reverseBest.municipio;
              if (!mergedPlace.provincia && reverseBest.provincia)
                mergedPlace.provincia = reverseBest.provincia;
              if (!mergedPlace.region && reverseBest.region)
                mergedPlace.region = reverseBest.region;
              if (!mergedPlace.pais && reverseBest.pais)
                mergedPlace.pais = reverseBest.pais;

              console.info(
                `${LOG_PREFIX} Datos actualizados tras geocodificación inversa:`,
                mergedPlace,
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

      this.normalizeSpanishRegion(mergedPlace);

      return mergedPlace;
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

    const municipio = lookup([
      'locality',
      'postal_town',
      'sublocality',
      'administrative_area_level_3',
      'administrative_area_level_2',
    ]);
    const provincia = lookup([
      'administrative_area_level_2',
      'administrative_area_level_1',
    ]);
    const region =
      lookup(['administrative_area_level_1']) ||
      lookup(['administrative_area_level_2']);
    const pais = lookup(['country']);

    const coverage =
      (municipio ? 1 : 0) +
      (provincia ? 1 : 0) +
      (region ? 1 : 0) +
      (pais ? 1 : 0);

    console.info(
      `${LOG_PREFIX} Evaluando resultado #${index + 1} (${coverage}/4) para geocodificación.`,
      {
        municipio,
        provincia,
        region,
        pais,
        placeId: result.place_id,
        formatted_address: result.formatted_address,
      },
    );

    return { municipio, provincia, region, pais };
  }

  private mergeBestPlace(
    candidates: GeocodingResponse[],
  ): GeocodingResponse {
    if (candidates.length === 0) {
      return { ...EMPTY_PLACE_DETAILS };
    }

    const scored = candidates
      .map((candidate, index) => ({
        candidate,
        index,
        score:
          (candidate.municipio ? 1 : 0) +
          (candidate.provincia ? 1 : 0) +
          (candidate.region ? 1 : 0) +
          (candidate.pais ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const best = scored[0]?.candidate ?? { ...EMPTY_PLACE_DETAILS };
    const merged: GeocodingResponse = { ...best };

    for (const { candidate } of scored) {
      if (!merged.municipio && candidate.municipio) {
        merged.municipio = candidate.municipio;
      }
      if (!merged.provincia && candidate.provincia) {
        merged.provincia = candidate.provincia;
      }
      if (!merged.region && candidate.region) {
        merged.region = candidate.region;
      }
      if (!merged.pais && candidate.pais) {
        merged.pais = candidate.pais;
      }
      if (
        merged.municipio &&
        merged.provincia &&
        merged.region &&
        merged.pais
      ) {
        break;
      }
    }

    return merged;
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
