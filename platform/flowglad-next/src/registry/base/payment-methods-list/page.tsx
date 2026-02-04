'use client'

import React, { useState } from 'react'
import { PaymentMethodsList } from './payment-methods-list'
import type { PaymentMethod } from './types'

// Mock data for demonstration
const mockPaymentMethods: PaymentMethod[] = [
  {
    id: '1',
    type: 'card',
    brand: 'visa',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2025,
    createdAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    type: 'card',
    brand: 'mastercard',
    last4: '5555',
    expiryMonth: 8,
    expiryYear: 2026,
    createdAt: new Date('2024-02-20'),
  },
  {
    id: '3',
    type: 'card',
    brand: 'amex',
    last4: '0005',
    expiryMonth: 3,
    expiryYear: 2025,
    createdAt: new Date('2024-03-10'),
  },
  {
    id: '4',
    type: 'bank_account',
    bankName: 'Wells Fargo',
    last4: '6789',
    accountType: 'checking',
    createdAt: new Date('2024-04-05'),
  },
  {
    id: '5',
    type: 'paypal',
    email: 'user@example.com',
    createdAt: new Date('2024-05-01'),
  },
]

export default function PaymentMethodsListDemo() {
  const [paymentMethods, setPaymentMethods] = useState(
    mockPaymentMethods
  )
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] =
    useState('1')
  const [loading, setLoading] = useState(false)

  const handleAddPaymentMethod = () => {
    // Simulate adding a new payment method
    const newMethod: PaymentMethod = {
      id: `${Date.now()}`,
      type: 'card',
      brand: 'discover',
      last4: Math.floor(1000 + Math.random() * 9000).toString(),
      expiryMonth: Math.floor(1 + Math.random() * 12),
      expiryYear: 2025 + Math.floor(Math.random() * 5),
      createdAt: new Date(),
    }
    setPaymentMethods((prev) => [...prev, newMethod])
  }

  const handleRemovePaymentMethod = async (id: string) => {
    // Don't allow removing the default payment method
    if (id === defaultPaymentMethodId) {
      alert(
        'Cannot remove the default payment method. Please set another as default first.'
      )
      // biome-ignore lint/plugin: UI boundary - error already shown to user via alert
      throw new Error('Cannot remove default payment method')
    }

    // Simulate API call
    setLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 500))
    setPaymentMethods((prev) => prev.filter((pm) => pm.id !== id))
    setLoading(false)
  }

  const handleSetDefault = async (id: string) => {
    // Simulate API call
    setLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 500))
    setDefaultPaymentMethodId(id)
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          Payment Methods List Component
        </h1>
        <p className="text-muted-foreground">
          A flexible payment methods list component for displaying and
          managing payment methods.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Basic Example</h2>
        <PaymentMethodsList
          paymentMethods={paymentMethods}
          defaultPaymentMethodId={defaultPaymentMethodId}
          onAddPaymentMethod={handleAddPaymentMethod}
          onRemovePaymentMethod={handleRemovePaymentMethod}
          onSetDefault={handleSetDefault}
          loading={loading}
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Loading State</h2>
        <PaymentMethodsList paymentMethods={[]} loading={true} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Empty State</h2>
        <PaymentMethodsList
          paymentMethods={[]}
          onAddPaymentMethod={handleAddPaymentMethod}
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          Read-only (No Actions)
        </h2>
        <PaymentMethodsList
          paymentMethods={paymentMethods.slice(0, 2)}
          defaultPaymentMethodId={defaultPaymentMethodId}
        />
      </div>

      <div className="mt-12 p-6 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Component Features:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>
            Display various payment method types (cards, bank
            accounts, etc.)
          </li>
          <li>Show card brand logos for recognized brands</li>
          <li>Mark and manage default payment method</li>
          <li>Add new payment methods</li>
          <li>Remove payment methods (except default)</li>
          <li>Set payment method as default</li>
          <li>Loading states</li>
          <li>Empty state with call-to-action</li>
          <li>Responsive design</li>
          <li>Accessible interactions</li>
        </ul>
      </div>
    </div>
  )
}
