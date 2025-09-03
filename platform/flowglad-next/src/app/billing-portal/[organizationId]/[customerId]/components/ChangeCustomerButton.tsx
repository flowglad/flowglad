'use client'

import Button from '@/components/ion/Button'
import { Users } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ChangeCustomerButtonProps {
  organizationId: string
  currentCustomerId: string
}

export function ChangeCustomerButton({
  organizationId,
  currentCustomerId,
}: ChangeCustomerButtonProps) {
  const router = useRouter()

  const handleChangeCustomer = () => {
    // Navigate to the customer selection page
    router.push(`/billing-portal/${organizationId}/select-customer`)
  }

  return (
    <Button
      onClick={handleChangeCustomer}
      variant="outline"
      size="sm"
      className="flex items-center gap-2"
    >
      <Users className="h-4 w-4" />
      <span>Change Customer</span>
    </Button>
  )
}
