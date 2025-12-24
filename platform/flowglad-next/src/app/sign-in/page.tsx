'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Key, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import ErrorLabel from '@/components/ErrorLabel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { authClient, signIn } from '@/utils/authClient'

export default function SignIn() {
  const signInSchema = z.object({
    email: z
      .string()
      .email({ message: 'Please enter a valid email' }),
    password: z
      .string()
      .min(1, { message: 'Please enter your password' }),
  })

  type SigninValues = z.infer<typeof signInSchema>

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SigninValues>({
    resolver: zodResolver(signInSchema),
    mode: 'onSubmit',
    defaultValues: { email: '', password: '' },
  })

  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')

  const emailValue = watch('email')
  const forgotPasswordDisabled = !z
    .string()
    .email()
    .safeParse(emailValue ?? '').success

  const signinFetchOptions = {
    onRequest: () => {
      setLoading(true)
      setError('')
    },
    onError: (ctx: any) => {
      setError(ctx.error.message)
    },
    onResponse: () => {
      setLoading(false)
    },
  } as const

  const onSubmit = async (values: SigninValues) => {
    await signIn.email(
      {
        email: values.email,
        password: values.password,
        callbackURL: '/',
      },
      signinFetchOptions
    )
  }

  const onError = (errs: any) => {
    const first = Object.values(errs)[0] as any
    const message = first?.message ?? 'Validation failed'
    toast.error(String(message))
  }

  return (
    <Card className="max-w-lg lg:w-80 w-full">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Sign In</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit, onError)}
          noValidate
          method="post"
        >
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                required
                {...register('email')}
              />
              <ErrorLabel error={errors.email} />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <div
                  className={cn(
                    'ml-auto inline-block text-sm underline cursor-pointer',
                    forgotPasswordDisabled &&
                      'opacity-25 cursor-not-allowed'
                  )}
                  onClick={async (e) => {
                    if (forgotPasswordDisabled) {
                      return
                    }
                    await authClient.requestPasswordReset({
                      email: emailValue ?? '',
                      redirectTo: '/sign-in/reset-password',
                    })
                    toast.success(
                      'If that email has an account, a password reset email has been sent.'
                    )
                  }}
                >
                  Forgot your password?
                </div>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="password"
                autoComplete="password"
                {...register('password')}
              />
              <ErrorLabel error={errors.password} />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                onClick={() => {
                  setRememberMe(!rememberMe)
                }}
              />
              <Label htmlFor="remember">Remember me</Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || isSubmitting}
            >
              {loading || isSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <p> Login </p>
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
                    {
                      onRequest: (ctx) => {
                        setLoading(true)
                      },
                      onResponse: (ctx) => {
                        setLoading(false)
                      },
                    }
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
                Sign in with Google
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
          Don&apos;t have an account?{' '}
          <Link
            href="/sign-up"
            className="text-primary hover:underline"
          >
            Sign up
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
}
