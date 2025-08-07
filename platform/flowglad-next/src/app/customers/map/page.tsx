'use client'

import { useMemo } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PageTitle from '@/components/ion/PageTitle'
import { CustomerMap } from './components/CustomerMap'
import { trpc } from '@/app/_trpc/client'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { GeocodedCustomer } from './utils/types'

const CustomerMapPage = () => {
	const { organization } = useAuthenticatedContext()
	
	const {
    data: customerMapData,
    error,
  } = trpc.customerMap.getMapData.useQuery(
    {
      organizationId: organization?.id!,
      limit: 1000,
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
        <CustomerMap geocodedCustomers={geocodedCustomers} error={error} />
      </div>
    </InternalPageContainer>
  )
}

export default CustomerMapPage
