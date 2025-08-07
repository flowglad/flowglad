'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import '../utils/mapbox-overrides.css'

import { MapInfoOverlay } from './MapInfoOverlay'
import { CustomerPopup } from './CustomerPopup'
import {
  updateMarkersOnMap,
  fitMapToCustomers,
} from '../utils/markerUtils'
import { MAP_CONSTANTS } from '../utils/constants'
import {
  GeocodedCustomer,
  MapState,
  ActivityItem,
  ActivityType,
} from '../utils/types'
import { NewActivityFeed } from './NewActivityFeed'

export interface CustomerMapProps {
  geocodedCustomers: GeocodedCustomer[]
  error: any
  searchQuery: string
  onSearchChange: (query: string) => void
  onRefresh: () => void
}

export function CustomerMap({
  geocodedCustomers,
  error,
  searchQuery,
  onSearchChange,
  onRefresh,
}: CustomerMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())

  const [mapState, setMapState] = useState<MapState>({
    center: MAP_CONSTANTS.INITIAL_CENTER,
    zoom: MAP_CONSTANTS.INITIAL_ZOOM,
  })
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [selectedCustomer, setSelectedCustomer] =
    useState<GeocodedCustomer | null>(null)
  const [isGlobeSpinning, setIsGlobeSpinning] = useState(false)
  const [userInteracting, setUserInteracting] = useState(false)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [previousCustomerIds, setPreviousCustomerIds] = useState<
    Set<string>
  >(new Set())

  useEffect(() => {
    if (!geocodedCustomers.length) return

    const currentCustomerIds = new Set(
      geocodedCustomers.map((c) => c.id)
    )

    if (previousCustomerIds.size === 0) {
      setPreviousCustomerIds(currentCustomerIds)
      return
    }

    const newCustomers = geocodedCustomers.filter(
      (customer) => !previousCustomerIds.has(customer.id)
    )

    if (newCustomers.length > 0) {
      const newActivities = newCustomers.map((customer) => ({
        id: `${customer.id}-${Date.now()}`,
        customer,
        type: ActivityType.NewCustomer,
        timestamp: new Date(),
      }))

      setActivities((prev) => [...prev, ...newActivities])
    }

    setPreviousCustomerIds(currentCustomerIds)
  }, [geocodedCustomers])

  const refreshMapData = useCallback(() => {
    setSelectedCustomer(null)

    onRefresh()

    setTimeout(() => {
      if (mapRef.current && geocodedCustomers.length > 0) {
        fitMapToCustomers(geocodedCustomers, mapRef.current)
      }
    }, 500)
  }, [onRefresh, geocodedCustomers])

  const handleCustomerSelect = useCallback(
    (customer: GeocodedCustomer) => {
      setSelectedCustomer(customer)

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

  const handleDismissActivity = useCallback((activityId: string) => {
    setActivities((prev) =>
      prev.filter((activity) => activity.id !== activityId)
    )
  }, [])

  const handleClearAllActivities = useCallback(() => {
    setActivities([])
  }, [])

  const handleResetMap = useCallback(() => {
    if (!mapRef.current) return

    setSelectedCustomer(null)

    if (isGlobeSpinning) {
      mapRef.current.stop()
      setIsGlobeSpinning(false)
    }

    if (geocodedCustomers.length > 0) {
      fitMapToCustomers(geocodedCustomers, mapRef.current)
    } else {
      mapRef.current.flyTo({
        center: MAP_CONSTANTS.INITIAL_CENTER,
        zoom: MAP_CONSTANTS.INITIAL_ZOOM,
        duration: 1500,
      })
    }
  }, [isGlobeSpinning, geocodedCustomers])

  const spinGlobe = useCallback(() => {
    if (!mapRef.current) return

    const map = mapRef.current
    const zoom = map.getZoom()

    const secondsPerRevolution = 120
    const maxSpinZoom = 5
    const slowSpinZoom = 3

    if (isGlobeSpinning && !userInteracting && zoom < maxSpinZoom) {
      let distancePerSecond = 360 / secondsPerRevolution
      if (zoom > slowSpinZoom) {
        const zoomDif =
          (maxSpinZoom - zoom) / (maxSpinZoom - slowSpinZoom)
        distancePerSecond *= zoomDif
      }
      const center = map.getCenter()
      center.lng -= distancePerSecond
      map.easeTo({ center, duration: 1000, easing: (n) => n })
    }
  }, [isGlobeSpinning, userInteracting])

  const handleToggleGlobe = useCallback(() => {
    if (!mapRef.current) return

    const map = mapRef.current

    setSelectedCustomer(null)

    if (!isGlobeSpinning) {
      map.easeTo({
        zoom: 1.5,
        center: [-90, 40],
        duration: 2000,
      })
      setIsGlobeSpinning(true)
      setTimeout(() => {
        spinGlobe()
      }, 2100) // account for the globe spin and the delay
    } else {
      map.stop()
      setIsGlobeSpinning(false)
    }
  }, [isGlobeSpinning, spinGlobe])

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
      map.on('mousedown', () => setUserInteracting(true))
      map.on('mouseup', () => setUserInteracting(false))
      map.on('dragend', () => setUserInteracting(false))
      map.on('pitchend', () => setUserInteracting(false))
      map.on('rotateend', () => setUserInteracting(false))
      map.on('moveend', () => setUserInteracting(false))

      mapRef.current = map

      return () => {
        if (!mapRef.current) return

        try {
          map.off('move', handleMove)
          map.off('load', handleLoad)
          map.off('error', handleError)
          map.off('mousedown', () => setUserInteracting(true))
          map.off('mouseup', () => setUserInteracting(false))
          map.off('dragend', () => setUserInteracting(false))
          map.off('pitchend', () => setUserInteracting(false))
          map.off('rotateend', () => setUserInteracting(false))
          map.off('moveend', () => setUserInteracting(false))

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

  useEffect(() => {
    if (isGlobeSpinning && !userInteracting) {
      const interval = setInterval(() => {
        spinGlobe()
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [isGlobeSpinning, userInteracting, spinGlobe])

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

        <MapInfoOverlay
          geocodedCustomers={geocodedCustomers}
          onRefresh={refreshMapData}
          onToggleGlobe={handleToggleGlobe}
          onReset={handleResetMap}
          isGlobeSpinning={isGlobeSpinning}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />

        {selectedCustomer && (
          <CustomerPopup
            customer={selectedCustomer}
            onClose={() => setSelectedCustomer(null)}
          />
        )}

				<NewActivityFeed
          activities={activities}
          onDismiss={handleDismissActivity}
          onClearAll={handleClearAllActivities}
        />
      </div>
    </div>
  )
}
