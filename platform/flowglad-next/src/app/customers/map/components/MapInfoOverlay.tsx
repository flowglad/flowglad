import React from 'react'
import { GeocodedCustomer } from '../utils/types'

export interface MapInfoOverlayProps {
  geocodedCustomers: GeocodedCustomer[]
  onRefresh: () => void
  onToggleGlobe: () => void
  onReset: () => void
  isGlobeSpinning: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function MapInfoOverlay({
  geocodedCustomers,
  onRefresh,
  onToggleGlobe,
  onReset,
  isGlobeSpinning,
  searchQuery,
  onSearchChange,
}: MapInfoOverlayProps) {
  return (
    <>
      <div className="flex items-start justify-between absolute top-3 left-3 gap-2">
        <div className="relative bg-green/90 bg-container-high text-foreground px-3 py-2 rounded-radius text-xs font-mono border border-stroke z-20">
          <p className="flex items-center gap-2">
            Customers: {geocodedCustomers.length}
          </p>

          <div className="flex gap-2 mt-1">
            <button
              onClick={onRefresh}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Refresh
            </button>
            <button
              onClick={onToggleGlobe}
              className="text-green-400 hover:text-green-300 underline"
            >
              {isGlobeSpinning ? 'Stop' : 'Spin'}
            </button>
            <button
              onClick={onReset}
              className="text-orange-400 hover:text-orange-300 underline"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="relative bg-red/90 bg-container-high px-1 rounded-radius border border-stroke z-20">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by customer name, email, or address"
            className="bg-transparent text-foreground text-sm placeholder-secondary border-none outline-none focus:outline-none focus:ring-0 w-80"
          />
        </div>
      </div>
    </>
  )
}
