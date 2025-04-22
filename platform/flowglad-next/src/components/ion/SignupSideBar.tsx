// Generated with Ion on 11/17/2024, 2:36:56 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=583:15070
import clsx from 'clsx'
import FlowgladLogo from '@/components/FlowgladLogo'
import { useSearchParams } from 'next/navigation'

type SignupSideBarProps = {
  className?: string
}

function SignupSideBar({ className = '' }: SignupSideBarProps) {
  const searchParams = useSearchParams()
  const flow = searchParams.get('flow')
  let tagline = 'Drop-in payments and billing for developers'
  let taglineDescription = "Set up your product's billing in seconds. 100% open source."

  return (
    <div
      className={clsx(
        'bg-nav flex-1 h-full w-full max-w-[512px] flex flex-col justify-center items-center gap-[175px] px-10 pt-[100px] pb-[60px] border-r border-container',
        className
      )}
    >
      <div className="w-full max-w-[372px] min-w-[328px] flex flex-col items-center gap-6 text-center">
        <FlowgladLogo />
        <div className="w-full flex flex-col gap-3">
          <div className="text-5xl leading-[54px] font-semibold text-foreground w-full max-w-[372px]">
            {tagline}
          </div>
          <div className="text-lg leading-6 text-secondary w-full max-w-[372px]">
            {taglineDescription}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SignupSideBar