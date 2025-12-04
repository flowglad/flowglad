'use client'
import { useBilling } from '@flowglad/nextjs'
import Button from '@/components/ui/Button'

const InnerPricingTable = () => {
  const billing = useBilling()
  if (!billing.catalog) {
    return null
  }
  const { reload } = billing
  return (
    <>
      <Button onClick={reload}>Reload</Button>
    </>
  )
}

export default InnerPricingTable
