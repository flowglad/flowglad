'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import type { ErrorContext } from 'better-auth/react'
import { Loader2, Eye, EyeOff } from 'lucide-react' 

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import ErrorLabel from '@/components/ErrorLabel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signupSchema } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { signIn, signUp } from '@/utils/authClient'

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
    <Card className="z-50 rounded-md max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Sign Up</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit, onError)}
          noValidate
          method="post"
        >
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  placeholder="Max"
                  {...register('firstName')}
                />
                <ErrorLabel error={errors.firstName} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input
                  id="last-name"
                  placeholder="Robinson"
                  {...register('lastName')}
                />
                <ErrorLabel error={errors.lastName} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                {...register('email')}
              />
              <ErrorLabel error={errors.email} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <ErrorLabel error={errors.password} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password_confirmation">
                Confirm Password
              </Label>
              <Input
                id="password_confirmation"
                type="password"
                {...register('passwordConfirmation')}
                autoComplete="new-password"
                placeholder="Confirm Password"
              />
              <ErrorLabel error={errors.passwordConfirmation} />
            </div>
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

            <div
              className={cn(
                'w-full gap-2 flex items-center',
                'justify-between flex-col'
              )}
            >
              <Button
                variant="outline"
                className={cn('w-full gap-2')}
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="0.98em"
                  height="1em"
                  viewBox="0 0 256 262"
                >
                  <path
                    fill="#4285F4"
                    d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
                  ></path>
                  <path
                    fill="#34A853"
                    d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
                  ></path>
                  <path
                    fill="#FBBC05"
                    d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
                  ></path>
                  <path
                    fill="#EB4335"
                    d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
                  ></path>
                </svg>
                Sign up with Google
              </Button>
            </div>
            <ErrorLabel
              error={error}
              className={cn(error ? 'opacity-100' : 'opacity-0')}
            />
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="text-primary hover:underline"
          >
            Sign in
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
}
