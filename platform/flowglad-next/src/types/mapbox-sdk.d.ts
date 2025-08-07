declare module '@mapbox/mapbox-sdk/services/geocoding' {
  interface GeocodingService {
    forwardGeocode(options: {
      query: string
      limit?: number
      types?: string[]
    }): {
      send(): Promise<{
        body: {
          features: Array<{
            id: string
            type: string
            place_type: string[]
            relevance: number
            properties: {
              accuracy?: string
              mapbox_id?: string
            }
            text: string
            place_name: string
            center: [number, number] // [longitude, latitude]
            geometry: {
              type: string
              coordinates: [number, number]
              interpolated?: boolean
              omitted?: boolean
            }
            address?: string
            context?: Array<{
              id: string
              mapbox_id?: string
              wikidata?: string
              text: string
              short_code?: string
            }>
          }>
        }
      }>
    }
  }

  interface GeocodingOptions {
    accessToken: string
  }

  function geocoding(options: GeocodingOptions): GeocodingService
  export default geocoding
}