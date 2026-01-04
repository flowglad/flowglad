'use client'

import { Loader2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
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
import { signIn, useSession } from '@/utils/authClient'
import { maskEmail } from '@/utils/email'

export default function CustomerBillingPortalOTPSignIn() {
  const params = useParams()
  const router = useRouter()
  const organizationId = params.organizationId as string
  const customerId = params.customerId as string
  const { data: session } = useSession()

  const [otp, setOtp] = useState('')
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [otpSent, setOtpSent] = useState(false)
  const [useMagicLink, setUseMagicLink] = useState(false)

  // Auto-send OTP on mount
  const sendOTP =
    trpc.customerBillingPortal.sendOTPToCustomer.useMutation({
      onMutate: () => {
        setSending(true)
        setError('')
      },
      onSuccess: (data) => {
        setMaskedEmail(data.email || null)
        // Store actual email for OTP verification
        if (data.actualEmail) {
          setCustomerEmail(data.actualEmail)
        }
        setOtpSent(true)
        setResendCooldown(60) // Start 60 second cooldown
        toast.success('Verification code sent to your email')
      },
      onError: (error) => {
        if (
          error.message.includes('Customer not found') ||
          error.message.includes('Organization not found') ||
          error.message.includes('does not belong')
        ) {
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

  // Verify OTP using Better Auth client-side API
  const verifyOTP = async () => {
    if (!customerEmail) {
      setError('Customer email not available. Please try again.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Call Better Auth client-side API to verify OTP and sign in
      await signIn.emailOtp(
        {
          email: customerEmail,
          otp: otp,
        },
        {
          onSuccess: () => {
            toast.success('Signed in successfully')
            // Redirect directly to dashboard
            window.location.href = `/billing-portal/${organizationId}/${customerId}`
          },
          onError: (ctx: { error: { message: string } }) => {
            if (
              ctx.error.message.includes('Invalid') ||
              ctx.error.message.includes('invalid')
            ) {
              setError('Invalid verification code. Please try again.')
            } else {
              setError(
                ctx.error.message ||
                  'Failed to verify code. Please try again.'
              )
            }
            setOtp('')
            setLoading(false)
          },
        }
      )
    } catch (error) {
      setError('Failed to verify code. Please try again.')
      setOtp('')
      setLoading(false)
    }
  }

  // Auto-send OTP on mount
  useEffect(() => {
    if (organizationId && customerId && !otpSent && !sending) {
      sendOTP.mutate({
        customerId,
        organizationId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, customerId])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleResendOTP = () => {
    if (resendCooldown > 0) return

    sendOTP.mutate({
      customerId,
      organizationId,
    })
  }

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6 || loading) return

    if (!customerEmail) {
      setError(
        'Customer email not available. Please request a new code.'
      )
      return
    }

    await verifyOTP()
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-lg lg:w-96 w-full">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">
            Sign In to Billing Portal
          </CardTitle>
          <CardDescription>
            {maskedEmail
              ? `Enter the verification code sent to ${maskedEmail}`
              : 'Enter the verification code sent to your email'}
          </CardDescription>
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
