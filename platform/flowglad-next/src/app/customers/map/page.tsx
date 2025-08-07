'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { trpc } from '@/app/_trpc/client'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { CustomerMap } from './components/CustomerMap'
import { GeocodedCustomer } from './utils/types'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PageTitle from '@/components/ion/PageTitle'

const CustomerMapPage = () => {
  const { organization } = useAuthenticatedContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const {
    data: customerMapData,
    isLoading: isCustomerMapDataLoading,
    error,
    refetch,
  } = trpc.customerMap.getMapData.useQuery(
    {
      organizationId: organization?.id!,
      limit: 1000,
      search: debouncedSearchQuery || undefined,
    },
    {
      enabled: !!organization?.id,
      refetchInterval: 15 * 1000,
      staleTime: 5 * 1000,
    }
  )

  const geocodedCustomers = useMemo(() => {
    const customers = customerMapData?.customers || []

    return customers.filter(
      (customer: GeocodedCustomer) => customer.coordinates !== null
    )
  }, [customerMapData])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const refreshMapData = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-row items-center justify-between">
            <div className="min-w-0 overflow-hidden mr-4">
              <PageTitle className="truncate whitespace-nowrap overflow-hidden text-ellipsis">
                Customer Map
              </PageTitle>
            </div>
          </div>
        </div>
        <div className="pt-6">
          {isCustomerMapDataLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <CustomerMap
              geocodedCustomers={geocodedCustomers}
              error={error}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onRefresh={refreshMapData}
            />
          )}
        </div>
      </div>
    </InternalPageContainer>
  )
}

export default CustomerMapPage
