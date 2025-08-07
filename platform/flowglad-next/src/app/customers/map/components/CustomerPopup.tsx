import React from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { GeocodedCustomer } from '../utils/types'

export interface CustomerPopupProps {
  customer: GeocodedCustomer
  onClose: () => void
}

export function CustomerPopup({
  customer,
  onClose,
}: CustomerPopupProps) {
  return (
    <div className="absolute top-3 right-3 bg-container border border-stroke rounded-radius shadow-lg p-4 max-w-sm z-20">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-2 border-stroke bg-cover bg-center flex-shrink-0"
            style={{
              backgroundImage: `url(https://avatar.iran.liara.run/public?id=${customer.id})`,
              backgroundSize: '100%',
            }}
          />
          <Link
            href={`/customers/${customer.id}`}
            className="font-semibold text-foreground hover:text-primary flex items-center gap-1"
          >
            {customer.name || 'Unnamed Customer'}
            <ExternalLink size={14} className="opacity-70" />
          </Link>
        </div>
        <button
          onClick={onClose}
          className="text-secondary hover:text-foreground ml-2 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <p className="text-secondary">
          <strong>Email:</strong> {customer.email}
        </p>

        {customer.billingAddress?.address && (
          <p className="text-secondary">
            <strong>Billing Address:</strong>
            <span className="ml-1">
              {[
                customer.billingAddress.address.line1,
                customer.billingAddress.address.line2,
                customer.billingAddress.address.city,
                customer.billingAddress.address.state,
                customer.billingAddress.address.postal_code,
                customer.billingAddress.address.country,
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          </p>
        )}

        {customer.subscriptionStatus && (
          <p className="text-secondary">
            <strong>Status:</strong>
            <span
              className={`ml-1 px-2 py-0.5 rounded text-xs ${
                customer.subscriptionStatus === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {customer.subscriptionStatus}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
