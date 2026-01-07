'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  XCircle,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { FieldErrors } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import ErrorLabel from '@/components/ErrorLabel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { authClient } from '@/utils/authClient'

export default function ResetPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token')
    }
  }, [token])

  type ResetPasswordValues = z.infer<typeof newPasswordSchema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    mode: 'onSubmit',
  })

  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = async (data: ResetPasswordValues) => {
    setError(null)

    if (!token) {
      setError('Invalid or missing reset token')
      return
    }

    setIsLoading(true)

    try {
      await authClient.resetPassword({
        newPassword: data.password,
        token,
      })

      setIsSuccess(true)
      toast.success('Password reset successfully!')

      // Redirect to sign-in after success
      setTimeout(() => {
        router.push('/sign-in')
      }, 2000)
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to reset password'
      setError(errorMessage)
      toast.error('Failed to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  const onError = (errs: FieldErrors<ResetPasswordValues>) => {
    const first = Object.values(errs)[0]
    const message = first?.message ?? 'Validation failed'
    toast.error(String(message))
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">
                Password Reset Successful
              </h2>
              <p className="text-muted-foreground">
                Your password has been reset. Redirecting to
                sign-in...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">
                Invalid Reset Link
              </h2>
              <p className="text-muted-foreground mb-4">
                This password reset link is invalid or has expired.
              </p>
              <Button
                onClick={() => router.push('/sign-in')}
                className="w-full"
              >
                Back to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-2">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">
            Reset Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit, onError)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  disabled={isLoading || isSubmitting}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                disabled={isLoading || isSubmitting}
                required
                minLength={PASSWORD_MIN_LENGTH}
                {...register('passwordConfirmation')}
              />
              <ErrorLabel error={errors.passwordConfirmation} />
            </div>

            {error && <ErrorLabel error={error} />}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || isSubmitting}
            >
              {isLoading || isSubmitting ? (
                <>
                  <Loader2
                    className={cn('animate-spin', 'h-4 w-4 mr-2')}
                  />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => router.push('/sign-in')}
                className="text-primary hover:underline"
                disabled={isLoading || isSubmitting}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
