'use client'

import * as React from 'react'
import { CustomerSelector } from './customer-selector'
import type { CustomerProfile } from './types'

// Mock data for demonstration
const mockCustomers: CustomerProfile[] = [
  {
    id: 'cust_1',
    name: 'John Doe',
    email: 'john.doe@example.com',
    organizationId: 'org_1',
    organizationName: 'Acme Corp',
    createdAt: new Date('2024-01-15'),
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=JD',
  },
  {
    id: 'cust_2',
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    organizationId: 'org_1',
    organizationName: 'Acme Corp',
    createdAt: new Date('2024-02-20'),
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=JS',
  },
  {
    id: 'cust_3',
    name: 'Bob Johnson',
    email: 'bob.johnson@techco.com',
    organizationId: 'org_2',
    organizationName: 'TechCo Industries',
    createdAt: new Date('2024-03-10'),
  },
  {
    id: 'cust_4',
    name: 'Alice Williams',
    email: 'alice.williams@startup.io',
    organizationId: 'org_3',
    organizationName: 'Startup IO',
    createdAt: new Date('2024-04-05'),
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=AW',
  },
  {
    id: 'cust_5',
    name: 'Charlie Brown',
    email: 'charlie.brown@enterprise.com',
    organizationId: 'org_4',
    organizationName: 'Enterprise Solutions',
    createdAt: new Date('2024-05-12'),
  },
  {
    id: 'cust_6',
    name: 'Diana Prince',
    email: 'diana.prince@innovations.net',
    organizationId: 'org_5',
    organizationName: 'Innovations Network',
    createdAt: new Date('2024-06-18'),
    avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=DP',
  },
]

export default function CustomerSelectorDemo() {
  const [selectedCustomerId, setSelectedCustomerId] =
    React.useState<string>()
  const [isLoading, setIsLoading] = React.useState(false)
  const [searchable, setSearchable] = React.useState(true)
  const [gridCols, setGridCols] = React.useState<1 | 2 | 3 | 4>(3)

  const handleSelect = (customerId: string) => {
    setSelectedCustomerId(customerId)
    // Selected customer: customerId
  }

  const simulateLoading = () => {
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 2000)
  }

  return (
    <div className="container mx-auto p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl">Customer Selector Component</h1>
        <p className="text-muted-foreground">
          A component for selecting customer profiles with search and
          grid layout options.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <button
            onClick={simulateLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Simulate Loading
          </button>
          <button
            onClick={() => setSearchable(!searchable)}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
          >
            Toggle Search: {searchable ? 'ON' : 'OFF'}
          </button>
          <select
            value={gridCols}
            onChange={(e) =>
              setGridCols(Number(e.target.value) as 1 | 2 | 3 | 4)
            }
            className="px-4 py-2 border rounded-md"
          >
            <option value={1}>1 Column</option>
            <option value={2}>2 Columns</option>
            <option value={3}>3 Columns</option>
            <option value={4}>4 Columns</option>
          </select>
        </div>

        {selectedCustomerId && (
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm">
              <strong>Selected Customer ID:</strong>{' '}
              {selectedCustomerId}
            </p>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-6 bg-background">
        <CustomerSelector
          customers={mockCustomers}
          onSelect={handleSelect}
          selectedCustomerId={selectedCustomerId}
          loading={isLoading}
          searchable={searchable}
          gridCols={gridCols}
          emptyStateMessage="No customers available"
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl">Component States</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg mb-2">Empty State</h3>
            <div className="border rounded-lg p-6 bg-background">
              <CustomerSelector
                customers={[]}
                onSelect={handleSelect}
                emptyStateMessage="No customers found in your organization"
              />
            </div>
          </div>

          <div>
            <h3 className="text-lg mb-2">
              Single Customer (No Search)
            </h3>
            <div className="border rounded-lg p-6 bg-background">
              <CustomerSelector
                customers={[mockCustomers[0]]}
                onSelect={handleSelect}
                searchable={true}
              />
            </div>
          </div>

          <div>
            <h3 className="text-lg mb-2">Loading State</h3>
            <div className="border rounded-lg p-6 bg-background">
              <CustomerSelector
                customers={[]}
                onSelect={handleSelect}
                loading={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
