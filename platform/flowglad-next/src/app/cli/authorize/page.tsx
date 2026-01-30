'use client'

import {
  CheckCircle2,
  Loader2,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useSession } from '@/utils/authClient'

type AuthorizationState =
  | 'loading'
  | 'input'
  | 'verifying'
  | 'valid'
  | 'invalid'
  | 'approving'
  | 'denying'
  | 'approved'
  | 'denied'
  | 'error'

/**
 * CLI Authorization Page
 *
 * This page allows users to authorize the Flowglad CLI to access their account.
 * Users are directed here from the CLI after running `flowglad login`.
 *
 * Flow:
 * 1. CLI starts device authorization and displays a user code
 * 2. User visits this page (either via link or manually entering the code)
 * 3. User logs in if not authenticated
 * 4. User approves or denies the authorization
 * 5. CLI receives the token and completes the login
 */
export default function CliAuthorizePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, isPending: isSessionLoading } = useSession()

  const [userCode, setUserCode] = useState(
    searchParams.get('user_code') || ''
  )
  const [state, setState] = useState<AuthorizationState>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  const verifyQuery = trpc.cli.verifyDeviceCode.useQuery(
    { userCode },
    {
      enabled: state === 'verifying' && userCode.length > 0,
      retry: false,
    }
  )

  const approveMutation = trpc.cli.approveDevice.useMutation()
  const denyMutation = trpc.cli.denyDevice.useMutation()

  // Handle initial state based on session and user code
  useEffect(() => {
    if (isSessionLoading) {
      setState('loading')
      return
    }

    if (!session) {
      // Redirect to sign-in with callback
      const callbackUrl = `/cli/authorize${userCode ? `?user_code=${encodeURIComponent(userCode)}` : ''}`
      router.push(
        `/sign-in?callbackURL=${encodeURIComponent(callbackUrl)}`
      )
      return
    }

    // If we have a user code from URL, verify it
    if (userCode) {
      setState('verifying')
    } else {
      setState('input')
    }
  }, [isSessionLoading, session, userCode, router])

  // Handle verification result
  useEffect(() => {
    if (verifyQuery.data) {
      if (verifyQuery.data.valid) {
        setState('valid')
      } else {
        setState('invalid')
        setErrorMessage(
          verifyQuery.data.error || 'Invalid or expired code'
        )
      }
    }
    if (verifyQuery.error) {
      setState('invalid')
      setErrorMessage('Failed to verify code')
    }
  }, [verifyQuery.data, verifyQuery.error])

  const handleVerify = () => {
    if (!userCode.trim()) {
      setErrorMessage('Please enter a code')
      return
    }
    setErrorMessage('')
    setState('verifying')
  }

  const handleApprove = async () => {
    setState('approving')
    const result = await approveMutation.mutateAsync({ userCode })
    if (result.success) {
      setState('approved')
    } else {
      setState('error')
      setErrorMessage(result.error || 'Failed to approve')
    }
  }

  const handleDeny = async () => {
    setState('denying')
    const result = await denyMutation.mutateAsync({ userCode })
    if (result.success) {
      setState('denied')
    } else {
      setState('error')
      setErrorMessage(result.error || 'Failed to deny')
    }
  }

  const handleTryAgain = () => {
    setUserCode('')
    setErrorMessage('')
    setState('input')
  }

  if (state === 'loading' || isSessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Terminal className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">CLI Authorization</CardTitle>
          <CardDescription>
            {state === 'approved' || state === 'denied'
              ? 'Authorization complete'
              : 'Authorize Flowglad CLI to access your account'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Input state - user needs to enter code */}
          {state === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the code displayed in your terminal to authorize
                the CLI.
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Enter your code (e.g., ABCD-1234)"
                  value={userCode}
                  onChange={(e) =>
                    setUserCode(e.target.value.toUpperCase())
                  }
                  className="text-center font-mono text-lg tracking-widest"
                  autoFocus
                />
                {errorMessage && (
                  <p className="text-sm text-destructive">
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Verifying state */}
          {state === 'verifying' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Verifying code...
              </p>
            </div>
          )}

          {/* Invalid state */}
          {state === 'invalid' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-center font-medium text-destructive">
                  {errorMessage}
                </p>
                <p className="text-center text-sm text-muted-foreground">
                  The code may have expired. Please try again with a
                  new code from the CLI.
                </p>
              </div>
            </div>
          )}

          {/* Valid state - ready to approve/deny */}
          {state === 'valid' && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-center font-mono text-lg tracking-widest">
                  {userCode}
                </p>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Click &quot;Authorize&quot; to allow the CLI to access
                your account, or &quot;Deny&quot; to reject this
                request.
              </p>
            </div>
          )}

          {/* Approving/Denying state */}
          {(state === 'approving' || state === 'denying') && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {state === 'approving'
                  ? 'Authorizing...'
                  : 'Denying...'}
              </p>
            </div>
          )}

          {/* Approved state */}
          {state === 'approved' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="font-medium">
                  Authorization successful!
                </p>
                <p className="text-sm text-muted-foreground">
                  You can now close this window and return to your
                  terminal.
                </p>
              </div>
            </div>
          )}

          {/* Denied state */}
          {state === 'denied' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <XCircle className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Authorization denied</p>
                <p className="text-sm text-muted-foreground">
                  The CLI will not be able to access your account.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <XCircle className="h-12 w-12 text-destructive" />
              <div className="text-center">
                <p className="font-medium text-destructive">
                  Something went wrong
                </p>
                <p className="text-sm text-muted-foreground">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          {state === 'input' && (
            <Button onClick={handleVerify} className="w-full">
              Verify Code
            </Button>
          )}

          {state === 'valid' && (
            <>
              <Button
                variant="outline"
                onClick={handleDeny}
                className="flex-1"
              >
                Deny
              </Button>
              <Button onClick={handleApprove} className="flex-1">
                Authorize
              </Button>
            </>
          )}

          {(state === 'invalid' || state === 'error') && (
            <Button onClick={handleTryAgain} className="w-full">
              Try Again
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
