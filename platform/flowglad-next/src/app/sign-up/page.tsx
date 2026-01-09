'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import type { ErrorContext } from 'better-auth/react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import ErrorLabel from '@/components/ErrorLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signupSchema } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { signIn, signUp } from '@/utils/authClient'

/** Google logo SVG component */
function GoogleLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0.98em"
      height="1em"
      viewBox="0 0 256 262"
    >
      <path
        fill="#4285F4"
        d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
      />
      <path
        fill="#34A853"
        d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
      />
      <path
        fill="#FBBC05"
        d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
      />
      <path
        fill="#EB4335"
        d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
      />
    </svg>
  )
}

/** "Or" divider component */
function OrDivider() {
  return (
    <div className="relative flex items-center justify-center h-5 my-2">
      <div className="absolute top-1/2 w-full border-t border-dashed border-border" />
      <span className="relative z-10 text-sm text-muted-foreground bg-background px-3">
        Or
      </span>
    </div>
  )
}

export default function SignUp() {
  type SignupValues = z.infer<typeof signupSchema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onSubmit',
  })

  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const signupFetchOptions = {
    onResponse: () => {
      setLoading(false)
    },
    onRequest: () => {
      setLoading(true)
      setError('')
    },
    onError: (ctx: ErrorContext) => {
      setError(ctx.error.message)
      toast.error(ctx.error.message)
    },
    onSuccess: async () => {
      router.push('/')
    },
  } as const

  const onSubmit = async (values: SignupValues) => {
    await signUp.email({
      email: values.email,
      password: values.password,
      name: `${values.firstName} ${values.lastName}`,
      callbackURL: '/',
      fetchOptions: signupFetchOptions,
    })
  }

  const onError = (errs: any) => {
    const first = Object.values(errs)[0] as any
    const message = first?.message ?? 'Validation failed'
    toast.error(String(message))
  }

  return (
    <div className="w-full max-w-sm">
      {/* Title */}
      <h1 className="text-2xl font-semibold text-center mb-6">
        Sign up for Flowglad
      </h1>

      {/* Social login buttons */}
      <Button
        variant="outline"
        className="w-full gap-2"
        disabled={loading}
        onClick={async () => {
          await signIn.social(
            {
              provider: 'google',
              callbackURL: '/',
            },
            signupFetchOptions
          )
        }}
      >
        <GoogleLogo />
        Sign up with Google
      </Button>

      {/* Or divider */}
      <OrDivider />

      {/* Email/password form */}
      <form
        onSubmit={handleSubmit(onSubmit, onError)}
        noValidate
        method="post"
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <Input
              id="first-name"
              placeholder="First name"
              {...register('firstName')}
            />
            <ErrorLabel error={errors.firstName} />
          </div>
          <div>
            <Input
              id="last-name"
              placeholder="Last name"
              {...register('lastName')}
            />
            <ErrorLabel error={errors.lastName} />
          </div>
        </div>

        <div className="mb-2">
          <Input
            id="email"
            type="email"
            placeholder="Email address"
            {...register('email')}
          />
          <ErrorLabel error={errors.email} />
        </div>

        <div className="mb-2">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              autoComplete="new-password"
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={
                showPassword ? 'Hide password' : 'Show password'
              }
            >
              {showPassword ? (
                <EyeOff size={16} />
              ) : (
                <Eye size={16} />
              )}
            </button>
          </div>
          <ErrorLabel error={errors.password} />
        </div>

        <div className="mb-2">
          <Input
            id="password_confirmation"
            type="password"
            {...register('passwordConfirmation')}
            autoComplete="new-password"
            placeholder="Confirm password"
          />
          <ErrorLabel error={errors.passwordConfirmation} />
        </div>

        <div className="mt-4">
          <Button
            type="submit"
            className="w-full"
            disabled={loading || isSubmitting}
          >
            {loading || isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              'Create an account'
            )}
          </Button>
        </div>

        <ErrorLabel
          error={error}
          className={cn('mt-2', error ? 'opacity-100' : 'opacity-0')}
        />
      </form>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-1 mt-5 text-sm text-muted-foreground">
        <span>Already have an account?</span>
        <Link
          href="/sign-in"
          className="text-primary hover:underline"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}
