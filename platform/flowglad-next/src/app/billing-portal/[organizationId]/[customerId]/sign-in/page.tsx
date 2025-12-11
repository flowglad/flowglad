'use client'

import { Loader2, Mail } from 'lucide-react'
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

const OTP_LENGTH = 6
const RESEND_COOLDOWN = 60 // seconds

export default function BillingPortalOTPSignIn() {
  const params = useParams<{
    organizationId: string
    customerId: string
  }>()
  const router = useRouter()
  const { organizationId, customerId } = params

  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState('')
  const [maskedEmail, setMaskedEmail] = useState<string>()
  const [otpSent, setOtpSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // Send OTP mutation
  const sendOTPMutation =
    trpc.customerBillingPortal.sendOTPToCustomer.useMutation({
      onSuccess: (data) => {
        setMaskedEmail(data.email)
        setOtpSent(true)
        setResendCooldown(RESEND_COOLDOWN)
        toast.success('OTP code sent to your email')
      },
      onError: (error) => {
        console.error('Failed to send OTP:', error)
        setError('Failed to send OTP. Please try again.')
        toast.error('Failed to send OTP')
      },
    })

  // Verify OTP mutation
  const verifyOTPMutation =
    trpc.customerBillingPortal.verifyOTPForCustomer.useMutation({
      onSuccess: () => {
        toast.success('Successfully verified!')
        // Redirect to billing portal
        router.push(`/billing-portal/${organizationId}/${customerId}`)
      },
      onError: (error) => {
        console.error('Failed to verify OTP:', error)
        setError('Invalid or expired OTP code')
        setOtpCode('')
      },
    })

  // Auto-send OTP on component mount
  useEffect(() => {
    if (!otpSent && !sendOTPMutation.isPending) {
      sendOTPMutation.mutate({
        customerId,
        organizationId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (otpCode.length !== OTP_LENGTH) {
      setError(`OTP code must be ${OTP_LENGTH} digits`)
      return
    }

    await verifyOTPMutation.mutateAsync({
      customerId,
      organizationId,
      code: otpCode,
    })
  }

  const handleResendOTP = () => {
    if (resendCooldown > 0) return

    setError('')
    setOtpCode('')
    sendOTPMutation.mutate({
      customerId,
      organizationId,
    })
  }

  const handleOTPChange = (value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
    setOtpCode(cleaned)
    setError('')
  }

  const isLoading =
    sendOTPMutation.isPending || verifyOTPMutation.isPending

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-lg lg:w-96 w-full">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg md:text-xl">
                Verify Your Email
              </CardTitle>
            </div>
          </div>
          <CardDescription>
            {otpSent && maskedEmail ? (
              <>
                We&apos;ve sent a {OTP_LENGTH}-digit code to{' '}
                <span className="font-medium text-foreground">
                  {maskedEmail}
                </span>
              </>
            ) : (
              'Sending verification code...'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="otp">Verification Code</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                placeholder={`Enter ${OTP_LENGTH}-digit code`}
                required
                value={otpCode}
                onChange={(e) => handleOTPChange(e.target.value)}
                disabled={isLoading || !otpSent}
                maxLength={OTP_LENGTH}
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading || !otpSent || otpCode.length !== OTP_LENGTH
              }
            >
              {verifyOTPMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Verify Code'
              )}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResendOTP}
                disabled={isLoading || !otpSent || resendCooldown > 0}
                className="text-muted-foreground hover:text-foreground"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend code'}
              </Button>
            </div>

            <ErrorLabel
              error={error}
              className={cn(error ? 'opacity-100' : 'opacity-0')}
            />

            {sendOTPMutation.isPending && (
              <div className="text-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending code to your email...</span>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
