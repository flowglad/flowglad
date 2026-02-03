'use client'
import Link from 'next/link'
import { FlowgladLogomark } from '@/components/icons/FlowgladLogomark'
import { SignupSideBar } from '@/components/signup-sidebar'

const SignupLayout = ({
  children,
  footer,
}: {
  children: React.ReactNode
  footer?: React.ReactNode
}) => {
  return (
    <div className="bg-background min-h-screen w-full flex">
      {/* Left side - Form content (50% on desktop, full on mobile) */}
      <div className="w-full md:w-1/2 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md flex flex-col items-center">
          {/* Logo */}
          <Link href="/" className="mb-6">
            <FlowgladLogomark className="w-8 h-8 text-foreground" />
          </Link>

          {children}

          {footer}
        </div>
      </div>

      {/* Right side - Decorative panel (50% on desktop, hidden on mobile) */}
      <SignupSideBar className="hidden md:flex md:w-1/2" />
    </div>
  )
}
export default SignupLayout
