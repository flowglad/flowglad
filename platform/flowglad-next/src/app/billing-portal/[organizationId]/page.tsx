'use client'

import { useRouter } from 'next/navigation'
import { signOut } from '@/utils/authClient'
import Button from '@/components/ion/Button'
import { LogOut } from 'lucide-react'

const BillingPortalPage = () => {
  const router = useRouter()

  const handleLogout = async () => {
    await signOut()
    router.push('/sign-in')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold mb-4">
          Customer Billing Portal!
        </h1>
      </div>

      <div className="p-6 border-t">
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full sm:w-auto flex items-center gap-2"
        >
          <LogOut size={16} />
          Logout
        </Button>
      </div>
    </div>
  )
}

export default BillingPortalPage
