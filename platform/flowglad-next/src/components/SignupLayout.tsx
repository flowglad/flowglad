'use client'
import Link from 'next/link'
import { SignupSideBar } from '@/components/signup-sidebar'

const SignupLayout = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="bg-background h-full w-full flex justify-between items-center">
      <SignupSideBar className="hidden md:flex h-full" />
      <div className="flex-1 h-full w-full flex flex-col justify-center items-center gap-9">
        <div className="w-full min-w-[360px] flex flex-col rounded-lg">
          <div className="flex-1 w-full flex flex-col justify-center items-center gap-6">
            <div className="flex flex-col justify-center items-center w-full">
              {children}
              <Link
                href="https://www.flowglad.com/privacy-policy"
                className="text-sm text-muted-foreground mt-8"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default SignupLayout
