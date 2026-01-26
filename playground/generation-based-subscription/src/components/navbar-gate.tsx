'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from '@/components/navbar'

const HIDE_NAVBAR_PATHS = ['/create-org']

const shouldHideNavbar = (pathname: string | null) => {
  if (!pathname) {
    return false
  }
  return HIDE_NAVBAR_PATHS.some((prefix) =>
    pathname.startsWith(prefix)
  )
}

export const NavbarGate = () => {
  const pathname = usePathname()
  if (shouldHideNavbar(pathname)) {
    return null
  }
  return <Navbar />
}
