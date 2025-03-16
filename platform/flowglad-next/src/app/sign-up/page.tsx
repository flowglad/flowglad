'use client'
import { SignUp } from '@stackframe/stack'
import { useSearchParams } from 'next/navigation'

function SignupPage() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/onboarding'
  return <SignUp />
}

export default SignupPage
