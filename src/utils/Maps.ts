import { requestUrl } from 'obsidian';
import { showMessage } from './Messages';

export type PlaceDetails = {
  municipio: string;
  provincia: string;
  region: string;
  pais: string;
};

const EMPTY_PLACE_DETAILS: PlaceDetails = {
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

type GoogleGeocodeResult = {
  address_components?: GoogleGeocodeComponent[];
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleGeocodeResult[];
};

export async function requestPlaceDetails(params: {
  apiKey: string;
  placeName: string;
}): Promise<PlaceDetails | null> {
  const { apiKey, placeName } = params;
  const trimmedKey = apiKey.trim();

  if (!trimmedKey) {
    showMessage('Configura tu clave de la API de Google Maps en los ajustes para completar los datos de un lugar.');
    return null;
  }

  const trimmedName = placeName.trim();
  if (!trimmedName) {
    console.warn(`${LOG_PREFIX} Google Maps request omitido: el nombre del lugar está vacío.`);
    return EMPTY_PLACE_DETAILS;
  }

  try {
    const query = new URLSearchParams({
      address: trimmedName,
      key: trimmedKey,
      language: 'es',
    });

    const response = await requestUrl({
      url: `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`,
      method: 'GET',
    });

    const data = (response.json ?? JSON.parse(response.text)) as GoogleGeocodeResponse;
    if (!data || typeof data !== 'object') {
      console.error(`${LOG_PREFIX} Google Maps devolvió una respuesta inesperada para "${trimmedName}".`, data);
      showMessage('No se pudo interpretar la respuesta de Google Maps. Revisa la consola.');
      return null;
    }

    const status = typeof data.status === 'string'
      ? data.status
      : '';

    if (status !== 'OK') {
      if (status === 'ZERO_RESULTS') {
        console.warn(`${LOG_PREFIX} Google Maps no encontró resultados para "${trimmedName}".`);
        showMessage(`Google Maps no encontró resultados para "${trimmedName}".`);
        return { ...EMPTY_PLACE_DETAILS };
      }

      const errorMessage = typeof data.error_message === 'string'
        ? data.error_message
        : 'Consulta la consola para más detalles.';
      console.error(`${LOG_PREFIX} Google Maps rechazó la petición (${status}) para "${trimmedName}": ${errorMessage}`);
      showMessage('Google Maps rechazó la petición. Consulta la consola para más detalles.');
      return null;
    }

    const results = Array.isArray(data.results)
      ? data.results
      : [];

    if (results.length === 0) {
      console.warn(`${LOG_PREFIX} Google Maps devolvió una respuesta sin resultados para "${trimmedName}".`);
      return { ...EMPTY_PLACE_DETAILS };
    }

    const firstResult = results[0];
    const components = Array.isArray(firstResult.address_components)
      ? firstResult.address_components as GoogleGeocodeComponent[]
      : [];

    const lookup = (types: string[]): string => {
      for (const component of components) {
        const componentTypes = Array.isArray(component.types) ? component.types : [];
        if (types.some((type) => componentTypes.includes(type))) {
          const value = typeof component.long_name === 'string' ? component.long_name.trim() : '';
          if (value) {
            return value;
          }
        }
      }
      return '';
    };

    const municipio = lookup(['locality', 'sublocality', 'administrative_area_level_2']);
    const provincia = lookup(['administrative_area_level_2', 'administrative_area_level_1']);
    const region = lookup(['administrative_area_level_1']);
    const pais = lookup(['country']);

    const missingFields: string[] = [];
    if (!municipio) missingFields.push('municipio');
    if (!provincia) missingFields.push('provincia');
    if (!region) missingFields.push('región');
    if (!pais) missingFields.push('país');

    if (missingFields.length > 0) {
      console.warn(`${LOG_PREFIX} Google Maps no devolvió ${missingFields.join(', ')} para "${trimmedName}".`);
    } else {
      console.info(`${LOG_PREFIX} Google Maps resolvió "${trimmedName}" correctamente.`);
    }

    return {
      municipio,
      provincia,
      region,
      pais,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error al consultar Google Maps para "${trimmedName}".`, error);
    showMessage('Google Maps no respondió. Revisa la consola para más detalles.');
    return null;
  }
}
