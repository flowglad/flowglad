'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import '../utils/mapbox-overrides.css'

import { MAP_CONSTANTS } from '../utils/constants'
import {
  GeocodedCustomer,
  MapState,
} from '../utils/types'
import { fitMapToCustomers, updateMarkersOnMap } from '../utils/markerUtils';

export interface CustomerMapProps {
  geocodedCustomers: GeocodedCustomer[]
  error: any
}

export function CustomerMap({
  geocodedCustomers,
  error,
}: CustomerMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())

  const [mapState, setMapState] = useState<MapState>({
    center: MAP_CONSTANTS.INITIAL_CENTER,
    zoom: MAP_CONSTANTS.INITIAL_ZOOM,
  })
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [isGlobeSpinning, setIsGlobeSpinning] = useState(false)


  const handleCustomerSelect = useCallback(
    (customer: GeocodedCustomer) => {
      if (mapRef.current && customer.coordinates) {
        if (isGlobeSpinning) {
          mapRef.current.stop()
          setIsGlobeSpinning(false)
        }
	
        mapRef.current.flyTo({
          center: [
            customer.coordinates.longitude,
            customer.coordinates.latitude,
          ],
          zoom: 8,
          duration: 1500,
        })
      }
    },
    [isGlobeSpinning]
  )


  useEffect(() => {
    if (!mapContainerRef.current) return
    mapboxgl.accessToken = MAP_CONSTANTS.MAPBOX_TOKEN

    try {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAP_CONSTANTS.MAP_STYLE,
        center: mapState.center,
        zoom: mapState.zoom,
        antialias: true,
      })

      const handleMove = () => {
        const center = map.getCenter()
        const zoom = map.getZoom()

        setMapState({
          center: [center.lng, center.lat],
          zoom,
        })
      }

      const handleLoad = () => {
        setIsMapLoaded(true)
      }

      const handleError = (e: any) => {
        console.error('Map error:', e)
      }

      map.on('move', handleMove)
      map.on('load', handleLoad)
      map.on('error', handleError)

      mapRef.current = map

      return () => {
        if (!mapRef.current) return

        try {
          map.off('move', handleMove)
          map.off('load', handleLoad)
          map.off('error', handleError)


          markersRef.current.forEach((marker) => marker.remove())
          markersRef.current.clear()

          if (map.loaded()) {
            map.remove()
          }
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn('Map cleanup error:', error)
          }
        } finally {
          mapRef.current = null
        }
      }
    } catch (error) {
      console.error('Failed to create Mapbox map:', error)
      setIsMapLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded || !geocodedCustomers.length)
      return

    fitMapToCustomers(geocodedCustomers, mapRef.current)
  }, [geocodedCustomers, isMapLoaded])

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return

    updateMarkersOnMap(
      geocodedCustomers,
      mapRef.current,
      markersRef,
      handleCustomerSelect
    )
  }, [geocodedCustomers, isMapLoaded, handleCustomerSelect])


  if (error) {
    return (
      <div className="h-[600px] w-full bg-container rounded-radius border border-stroke flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-2">
            Failed to load customer data
          </p>
          <p className="text-secondary text-sm">
            Please try refreshing the page
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[600px] w-full bg-container rounded-radius border border-stroke overflow-hidden">
      <div
        ref={mapContainerRef}
        className="w-full h-full relative"
        style={{ minHeight: '400px' }}
      >
        {!isMapLoaded && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
            <div className="bg-container p-4 rounded-radius shadow-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-foreground">
                  Loading map...
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
