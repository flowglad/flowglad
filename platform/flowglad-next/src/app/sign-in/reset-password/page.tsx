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
import { cn } from '@/utils/core'
import ErrorLabel from '@/components/ErrorLabel'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [validationErrors, setValidationErrors] = useState<{
    password?: string
    confirmPassword?: string
  }>({})

  useEffect(() => {
    if (!token) {
      setError('Reset token is missing or invalid')
    }
  }, [token])

  const validatePasswords = () => {
    const errors: { password?: string; confirmPassword?: string } = {}

    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long'
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      setError('Reset token is missing or invalid')
      return
    }

    if (!validatePasswords()) {
      toast.error('Please fix the errors in the form')
      return
    }

    try {
      setLoading(true)
      setError('')

      const { data, error: authError } =
        await authClient.resetPassword({
          newPassword: password,
          token,
        })

      if (authError) {
        setError(authError.message || 'Failed to reset password')
        setLoading(false)
        return
      }

      if (data) {
        setSuccess(true)
        setLoading(false)
        // Redirect to sign-in page after successful reset
        setTimeout(() => {
          router.push('/sign-in')
        }, 2000)
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  const handleBackToSignIn = () => {
    router.push('/sign-in')
  }

  if (!token && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 size={24} className="animate-spin" />
              <span>Loading...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-lg lg:w-80 w-full ">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <Lock size={24} className="text-primary" />
            </div>
          </div>
          <CardTitle className="text-lg md:text-xl">
            {success
              ? 'Password Reset Successful!'
              : 'Reset Your Password'}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {success
              ? 'Your password has been successfully reset. You will be redirected to sign in.'
              : 'Enter your new password below'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle size={24} />
                <span className="text-sm">
                  Password reset successfully
                </span>
              </div>
              <Button
                variant="outline"
                onClick={handleBackToSignIn}
                className="w-full"
              >
                Go to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="password" className="mb-1">
                    New Password
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your new password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (validationErrors.password) {
                        setValidationErrors((prev) => ({
                          ...prev,
                          password: undefined,
                        }))
                      }
                    }}
                    className={
                      validationErrors.password
                        ? 'border-destructive'
                        : ''
                    }
                    required
                    disabled={loading}
                  />
                  {validationErrors.password && (
                    <p className="mt-1 text-sm text-destructive">
                      {validationErrors.password}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-muted-foreground">
                    Password must be at least 8 characters long
                  </p>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="mb-1">
                    Confirm New Password
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (validationErrors.confirmPassword) {
                        setValidationErrors((prev) => ({
                          ...prev,
                          confirmPassword: undefined,
                        }))
                      }
                    }}
                    className={
                      validationErrors.confirmPassword
                        ? 'border-destructive'
                        : ''
                    }
                    required
                    disabled={loading}
                  />
                  {validationErrors.confirmPassword && (
                    <p className="mt-1 text-sm text-destructive">
                      {validationErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !token}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Resetting Password...</span>
                  </div>
                ) : (
                  'Reset Password'
                )}
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToSignIn}
                  className="w-full"
                  disabled={loading}
                >
                  Back to Sign In
                </Button>
              </div>

              <ErrorLabel
                error={error}
                className={cn(error ? 'opacity-100' : 'opacity-0')}
              />

              {!token && (
                <div className="flex items-center gap-3 text-red-600 p-3 bg-red-50 rounded-md">
                  <XCircle size={20} />
                  <div className="text-sm">
                    <div className="font-medium">
                      Invalid Reset Link
                    </div>
                    <div className="text-xs text-red-500 mt-1">
                      The password reset link is missing or invalid.
                      Please request a new one.
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
