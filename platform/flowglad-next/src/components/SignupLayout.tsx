// Generated with Ion on 11/17/2024, 2:37:07 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1302:8858
'use client'
import SignupSideBar from '@/components/ion/SignupSideBar'
import Link from 'next/link'

const SignupLayout = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="bg-internal h-full w-full flex justify-between items-center">
      <SignupSideBar className="hidden md:flex h-full" />
      <div className="flex-1 h-full w-full flex flex-col justify-center items-center gap-9">
        <div className="w-full min-w-[360px] flex flex-col rounded-radius-md">
          <div className="flex-1 w-full flex flex-col justify-center items-center gap-6">
            <div className="flex flex-col justify-center items-center w-full">
              {children}
              <Link
                href="https://flowglad.com/privacy-policy"
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
