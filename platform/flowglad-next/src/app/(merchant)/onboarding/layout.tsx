'use client'
import { usePathname } from 'next/navigation'
import SidebarLayout from '@/components/SidebarLayout'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  if (pathname.endsWith('business-details')) {
    return <>{children}</>
  }

  return <SidebarLayout>{children}</SidebarLayout>
}
