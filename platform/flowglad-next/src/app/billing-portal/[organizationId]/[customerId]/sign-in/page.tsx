'use client'

import { Loader2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
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
import { cn } from '@/lib/utils'

export default function CustomerBillingPortalOTPSignIn() {
  const params = useParams()
  const router = useRouter()
  const organizationId = params.organizationId as string
  const customerId = params.customerId as string

  const [otp, setOtp] = useState('')
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [useMagicLink, setUseMagicLink] = useState(false)

  // Ref to prevent double-send in React Strict Mode
  const otpSentRef = useRef(false)
  // Ref for cooldown interval
  const cooldownIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null)

  // Send OTP mutation
  const sendOTP =
    trpc.customerBillingPortal.sendOTPToCustomer.useMutation({
      onMutate: () => {
        setSending(true)
        setError('')
      },
      onSuccess: (data) => {
        setMaskedEmail(data.email || null)
        setResendCooldown(60) // Start 60 second cooldown
        toast.success('Verification code sent to your email', {
          id: 'otp-sent',
        })
      },
      onError: (error) => {
        if (error.message.includes('Organization not found')) {
          setError(error.message)
        } else {
          // For security, show generic message
          setError(
            'Failed to send verification code. Please try again.'
          )
        }
      },
      onSettled: () => {
        setSending(false)
      },
    })

  // Verify OTP mutation (server-side verification)
  const verifyOTP =
    trpc.customerBillingPortal.verifyOTPForCustomer.useMutation({
      onMutate: () => {
        setLoading(true)
        setError('')
      },
      onSuccess: () => {
        toast.success('Signed in successfully', {
          id: 'otp-verified',
        })
        // Redirect to billing portal
        window.location.href = `/billing-portal/${organizationId}/${customerId}`
      },
      onError: (error) => {
        if (
          error.message.includes('Invalid') ||
          error.message.includes('invalid') ||
          error.message.includes('expired')
        ) {
          setError('Invalid or expired verification code.')
        } else if (error.message.includes('Session expired')) {
          setError(
            'Session expired. Please request a new verification code.'
          )
        } else {
          setError('Failed to verify code. Please try again.')
        }
        setOtp('')
        setLoading(false)
      },
      onSettled: () => {
        setLoading(false)
      },
    })

  // Auto-send OTP on mount (with ref to prevent double-send)
  useEffect(() => {
    if (organizationId && customerId && !otpSentRef.current) {
      otpSentRef.current = true
      sendOTP.mutate({
        customerId,
        organizationId,
      })
    }
  }, [organizationId, customerId, sendOTP])

  // Resend cooldown timer using setInterval for efficiency
  useEffect(() => {
    if (resendCooldown > 0 && !cooldownIntervalRef.current) {
      cooldownIntervalRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownIntervalRef.current) {
              clearInterval(cooldownIntervalRef.current)
              cooldownIntervalRef.current = null
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current)
        cooldownIntervalRef.current = null
      }
    }
  }, [resendCooldown > 0])

  const handleResendOTP = () => {
    if (resendCooldown > 0) return

    // Reset ref to allow sending again
    otpSentRef.current = true
    sendOTP.mutate({
      customerId,
      organizationId,
    })
  }

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6 || loading) return

    verifyOTP.mutate({ otp })
  }

  const handleMagicLinkRedirect = () => {
    // Redirect to organization-level sign-in for magic link
    router.push(`/billing-portal/${organizationId}/sign-in`)
  }

  // Handle OTP input - only allow digits and limit to 6
  const handleOTPChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setOtp(value)
    setError('')
  }

  if (useMagicLink) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg lg:w-96 w-full">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">
              Sign In to Billing Portal
            </CardTitle>
            <CardDescription>
              Enter your email to receive a magic link
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground text-center">
                Magic link sign-in requires your email address. You'll
                be redirected to the sign-in page where you can enter
                your email.
              </p>

              <Button
                type="button"
                className="w-full"
                onClick={handleMagicLinkRedirect}
              >
                Go to Magic Link Sign-In
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setUseMagicLink(false)}
              >
                Use OTP instead
              </Button>

              <ErrorLabel
                error={error}
                className={cn(error ? 'opacity-100' : 'opacity-0')}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Determine card description based on state
  const getCardDescription = () => {
    if (sending) {
      return 'Sending verification code...'
    }
    if (maskedEmail) {
      return `Enter the verification code sent to ${maskedEmail}`
    }
    return 'A verification code will be sent to your email'
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-lg lg:w-96 w-full">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">
            Sign In to Billing Portal
          </CardTitle>
          <CardDescription>{getCardDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleOTPSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="otp">Verification Code</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="000000"
                required
                maxLength={6}
                value={otp}
                onChange={handleOTPChange}
                disabled={loading || sending}
                className="text-center text-2xl tracking-widest font-mono"
              />
              <p className="text-xs text-muted-foreground text-center">
                Enter the 6-digit code from your email
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || otp.length !== 6 || sending}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Verifying...
                </>
              ) : (
                'Verify Code'
              )}
            </Button>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={resendCooldown > 0 || sending}
                onClick={handleResendOTP}
              >
                {sending ? (
                  <>
                    <Loader2
                      size={16}
                      className="animate-spin mr-2"
                    />
                    Sending...
                  </>
                ) : resendCooldown > 0 ? (
                  `Resend code in ${resendCooldown}s`
                ) : (
                  'Resend Code'
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setUseMagicLink(true)}
                disabled={loading || sending}
              >
                Use Magic Link instead
              </Button>
            </div>

            <ErrorLabel
              error={error}
              className={cn(error ? 'opacity-100' : 'opacity-0')}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
