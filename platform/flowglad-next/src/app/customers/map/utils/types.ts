import { geocodedCustomerSchema } from '@/server/routers/customerMapRouter'
import { z } from 'zod'

export type GeocodedCustomer = z.infer<typeof geocodedCustomerSchema>

export interface MapState {
  center: [number, number]
  zoom: number
}

export interface MapConstants {
  MAPBOX_TOKEN: string
  INITIAL_CENTER: [number, number]
  INITIAL_ZOOM: number
  MAP_STYLE: string
  MARKER_COLOR_ACTIVE: string
  MARKER_COLOR_INACTIVE: string
}

export enum ActivityType {
  NewCustomer = 'new_customer',
  SubscriptionStatusChanged = 'subscription_status_changed',
}

export interface ActivityItem {
  id: string
  customer: GeocodedCustomer
  type: ActivityType
  timestamp: Date
}
