// Generated with Ion on 11/17/2024, 2:37:07 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1302:8858
'use client'
import FlowgladLogo from '@/components/FlowgladLogo'
import Link from 'next/link'

const SignupLayout = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="h-full w-full flex items-center">
      {/* Logo and brand name in top left */}
      <Link href="https://flowglad.com" className="absolute top-6 left-6 flex items-center gap-3">
        <FlowgladLogo />
      </Link>
      
      {/* Main content area */}
      <div className="flex-1 flex flex-col justify-center items-center px-4">
        {children}
      </div>
    </div>
  )
}
export default SignupLayout
