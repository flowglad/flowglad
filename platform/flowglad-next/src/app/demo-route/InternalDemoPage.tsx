'use client'

import { LineChart } from '@/components/charts/LineChart'
import { RevenueChart } from '@/components/RevenueChart'

type RichCustomer = {
  subscription: {
    name: string
    price: string
    status: string
    nextBillingDate: string
  }
} | null

const chartdata = [
  {
    date: 'Jan 23',
    SolarPanels: 2890,
    Inverters: 2338,
  },
  {
    date: 'Feb 23',
    SolarPanels: 2756,
    Inverters: 2103,
  },
  {
    date: 'Mar 23',
    SolarPanels: 3322,
    Inverters: 2194,
  },
  {
    date: 'Apr 23',
    SolarPanels: 3470,
    Inverters: 2108,
  },
  {
    date: 'May 23',
    SolarPanels: 3475,
    Inverters: 1812,
  },
  {
    date: 'Jun 23',
    SolarPanels: 3129,
    Inverters: 1726,
  },
  {
    date: 'Jul 23',
    SolarPanels: 3490,
    Inverters: 1982,
  },
  {
    date: 'Aug 23',
    SolarPanels: 2903,
    Inverters: 2012,
  },
  {
    date: 'Sep 23',
    SolarPanels: 2643,
    Inverters: 2342,
  },
  {
    date: 'Oct 23',
    SolarPanels: 2837,
    Inverters: 2473,
  },
  {
    date: 'Nov 23',
    SolarPanels: 2954,
    Inverters: 3848,
  },
  {
    date: 'Dec 23',
    SolarPanels: 3239,
    Inverters: 3736,
  },
]

const InternalDemoPage = () => {
  let customer: RichCustomer = null
  if (1 > 0) {
    customer = {
      subscription: {
        name: 'Pro',
        price: '100',
        status: 'active',
        nextBillingDate: '2025-01-28',
      },
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Internal Demo Page</h1>
      <div
        style={
          {
            // width: '800px',
            // height: '500px',
            // position: 'relative',
          }
        }
      >
        <RevenueChart
          fromDate={new Date('2023-01-01')}
          toDate={new Date('2025-12-31')}
        />
      </div>
    </div>
  )
}

export default InternalDemoPage
