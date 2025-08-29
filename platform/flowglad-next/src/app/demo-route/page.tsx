import core from '@/utils/core'
import { notFound } from 'next/navigation'
import { PricingTable } from '@/registry/new-york/pricing-table'

const DemoPage = () => {
  if (core.IS_PROD) {
    return notFound()
  }
  return (
    <div>
      <h1>Demo Page</h1>

<PricingTable
  plans={pricingPlans}
  defaultPlan="Personal"
  onTierSelect={(tierId, planName) => {
    // Handle tier selection
  }}
  showToggle={true}
/>
    </div>
  )
}

export default DemoPage
