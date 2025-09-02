'use client'

import { MigrationButton as Button } from '@/components/ui/button-migration'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import Input from '@/components/ion/Input'
import Label from '@/components/ion/Label'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { trpc } from '@/app/_trpc/client'
import { cn } from '@/utils/core'
import ErrorLabel from '@/components/ErrorLabel'
import { toast } from 'sonner'
import z from 'zod'
import { useParams } from 'next/navigation'

export default function BillingPortalSignIn() {
  const params = useParams()
  const organizationId = params.organizationId as string
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const emailValid = z.email().safeParse(email).success

  const requestMagicLink =
    trpc.customerBillingPortal.requestMagicLink.useMutation({
      onMutate: () => {
        setLoading(true)
        setError('')
      },
      onSuccess: () => {
        toast.success(
          'If you have an account with this organization, a magic link has been sent to your email.'
        )
        setEmail('')
      },
      onError: (error) => {
        if (error.message.includes('Organization not found')) {
          setError('Invalid organization')
        } else {
          // For security, show generic message even on error
          toast.success(
            'If you have an account with this organization, a magic link has been sent to your email.'
          )
        }
      },
      onSettled: () => {
        setLoading(false)
      },
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailValid || loading) return

    await requestMagicLink.mutateAsync({
      organizationId,
      email,
    })
  }

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
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="customer@example.com"
                required
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                value={email}
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !emailValid}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <p>Send Magic Link</p>
              )}
            </Button>

            <ErrorLabel
              error={error}
              className={cn(error ? 'opacity-100' : 'opacity-0')}
            />

            {!loading && email && !emailValid && (
              <p className="text-sm text-muted-foreground text-center">
                Please enter a valid email address
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
