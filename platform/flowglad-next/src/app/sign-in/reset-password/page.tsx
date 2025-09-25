'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/utils/authClient'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, XCircle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import ErrorLabel from '@/components/ErrorLabel'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token')
    }
  }, [token])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (!token) {
      setError('Invalid or missing reset token')
      return
    }

    setIsLoading(true)

    try {
      await authClient.resetPassword({
        newPassword: password,
        token,
      })

      setIsSuccess(true)
      toast.success('Password reset successfully!')

      // Redirect to sign-in after success
      setTimeout(() => {
        router.push('/sign-in')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to reset password')
      toast.error('Failed to reset password')
    } finally {
      setIsLoading(false)
    }
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
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>

            {error && <ErrorLabel error={error} />}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
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
                disabled={isLoading}
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
