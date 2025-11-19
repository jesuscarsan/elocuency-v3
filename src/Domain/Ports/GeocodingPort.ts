export type GeocodingParams = {
  placeName: string;
};

export type GeocodingResponse = {
  municipio: string;
  provincia: string;
  region: string;
  pais: string;
};
export interface GeocodingPort {
  requestPlaceDetails(
    params: GeocodingParams,
  ): Promise<GeocodingResponse | null>;
}
