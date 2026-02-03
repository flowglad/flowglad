import Link from 'next/link'
import SignupLayout from '@/components/SignupLayout'

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SignupLayout
      footer={
        <p className="text-sm text-muted-foreground mt-8 text-center max-w-[22rem]">
          Signing up for a Flowglad account means you agree to the{' '}
          <Link
            href="https://www.flowglad.com/privacy-policy"
            className="text-[hsl(var(--brownstone-foreground))] hover:text-[hsl(var(--citrine-foreground))] hover:underline hover:decoration-dashed transition-colors"
          >
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link
            href="https://www.flowglad.com/terms-of-service"
            className="text-[hsl(var(--brownstone-foreground))] hover:text-[hsl(var(--citrine-foreground))] hover:underline hover:decoration-dashed transition-colors"
          >
            Terms of Service
          </Link>
          .
        </p>
      }
    >
      {children}
    </SignupLayout>
  )
}

export default Layout
