import mapboxgl from 'mapbox-gl'
import { GeocodedCustomer } from './types'
import { MAP_CONSTANTS } from './constants'

export interface MarkerUtilsProps {
  onCustomerSelect: (customer: GeocodedCustomer) => void
}

/**
 * Creates a DOM element for a customer marker.
 */
export function createMarkerElement(
  customer: GeocodedCustomer,
  onCustomerSelect: (customer: GeocodedCustomer) => void
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'custom-marker'

  const hash = customer.id
    .split('')
    .reduce(
      (acc: number, char: string) => acc + char.charCodeAt(0),
      0
    )
  const hue = hash % 360
  const backgroundColor = `hsl(${hue}, 60%, 70%)`

  Object.assign(el.style, {
    backgroundImage: `url(https://avatar.iran.liara.run/public?id=${customer.id})`,
    backgroundColor: backgroundColor,
    width: '48px',
    height: '48px',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    display: 'block',
    border: `3px solid ${customer.subscriptionStatus === 'active' ? MAP_CONSTANTS.MARKER_COLOR_ACTIVE : MAP_CONSTANTS.MARKER_COLOR_INACTIVE}`,
    borderRadius: '50%',
    cursor: 'pointer',
    padding: '0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  })

  const img = new Image()
  img.onload = () => {}
  img.onerror = () => {
    el.style.backgroundImage = 'none'
    el.innerHTML = `<div style="
      width: 100%; 
      height: 100%; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-weight: bold; 
      font-size: 14px; 
      color: white; 
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    ">${getInitials(customer.name || customer.email)}</div>`
  }
  img.src = `https://avatar.iran.liara.run/public?id=${customer.id}`

  el.addEventListener('click', () => {
    onCustomerSelect(customer)
  })

  return el
}

/**
 * Get initials from a name or email
 */
function getInitials(nameOrEmail: string): string {
  if (!nameOrEmail) return '?'

  const parts = nameOrEmail.split(/[\s@]/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return nameOrEmail[0].toUpperCase()
}

/**
 * Creates a Mapbox GL marker for a customer
 */
export function createCustomerMarker(
  customer: GeocodedCustomer,
  onCustomerSelect: (customer: GeocodedCustomer) => void
): mapboxgl.Marker | null {
  if (!customer.coordinates) return null

  const markerElement = createMarkerElement(
    customer,
    onCustomerSelect
  )

  return new mapboxgl.Marker({
    element: markerElement,
    anchor: 'center',
    pitchAlignment: 'map',
    rotationAlignment: 'map',
  }).setLngLat([
    customer.coordinates.longitude,
    customer.coordinates.latitude,
  ])
}

/**
 * Updates markers on the map
 */
export function updateMarkersOnMap(
  customers: GeocodedCustomer[],
  map: mapboxgl.Map,
  markersRef: React.MutableRefObject<Map<string, mapboxgl.Marker>>,
  onCustomerSelect: (customer: GeocodedCustomer) => void
): void {
  markersRef.current.forEach((marker) => marker.remove())
  markersRef.current.clear()

  customers.forEach((customer) => {
    const marker = createCustomerMarker(customer, onCustomerSelect)
    if (marker) {
      marker.addTo(map)
      markersRef.current.set(customer.id, marker)
    }
  })
}

/**
 * Calculates and fits map bounds to show all customers
 */
export function fitMapToCustomers(
  customers: GeocodedCustomer[],
  map: mapboxgl.Map
): void {
  if (!customers.length) return

  const bounds = new mapboxgl.LngLatBounds()

  customers.forEach((customer) => {
    if (customer.coordinates) {
      bounds.extend([
        customer.coordinates.longitude,
        customer.coordinates.latitude,
      ])
    }
  })

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: 50,
      maxZoom: 10,
    })
  }
}
