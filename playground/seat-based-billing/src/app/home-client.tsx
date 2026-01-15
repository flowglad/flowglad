'use client'

import { useBilling } from '@flowglad/nextjs'
import { Loader2, Trash2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { authClient } from '@/lib/auth-client'
import {
  adjustSeatCount,
  claimSeat,
  getSeats,
  listSeatClaims,
  releaseSeat,
} from '@/lib/seat-actions'

interface ResourceUsage {
  resourceSlug: string
  resourceId: string
  capacity: number
  claimed: number
  available: number
}

interface ResourceClaim {
  id: string
  externalId: string | null
  claimedAt: number
  metadata: Record<string, unknown> | null
}

export function HomeClient() {
  const router = useRouter()
  const { data: session, isPending: isSessionPending } =
    authClient.useSession()
  const billing = useBilling()

  // Seat management state
  const [seatUsage, setSeatUsage] = useState<ResourceUsage | null>(
    null
  )
  const [claims, setClaims] = useState<ResourceClaim[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [newQuantity, setNewQuantity] = useState(1)
  const [isLoadingSeats, setIsLoadingSeats] = useState(true)
  const [isClaimingOngoing, setIsClaimingOngoing] = useState(false)
  const [isReleasingOngoing, setIsReleasingOngoing] = useState<
    string | null
  >(null)
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previousUserIdRef = useRef<string | undefined>(undefined)

  // Fetch seat data
  const refreshData = useCallback(async () => {
    try {
      setIsLoadingSeats(true)
      setError(null)

      const [seatsResult, claimsResult] = await Promise.all([
        getSeats(),
        listSeatClaims(),
      ])

      // Find the seats resource
      const seatsResource = seatsResult.resources.find(
        (r: ResourceUsage) => r.resourceSlug === 'seats'
      )
      setSeatUsage(seatsResource ?? null)
      setClaims(claimsResult.claims)

      // Set newQuantity to current capacity
      if (seatsResource) {
        setNewQuantity(seatsResource.capacity)
      }
    } catch (err) {
      // If no subscription, seats will fail - that's expected for free plan
      console.error('Error fetching seats:', err)
      setSeatUsage(null)
      setClaims([])
    } finally {
      setIsLoadingSeats(false)
    }
  }, [])

  // Refetch billing data when user ID changes
  useEffect(() => {
    const currentUserId = session?.user?.id
    if (
      currentUserId &&
      currentUserId !== previousUserIdRef.current &&
      billing.loaded &&
      billing.reload
    ) {
      previousUserIdRef.current = currentUserId
      billing.reload()
    } else if (currentUserId) {
      previousUserIdRef.current = currentUserId
    }
  }, [session?.user?.id, billing])

  // Check if user is on free plan and redirect to pricing page
  useEffect(() => {
    if (isSessionPending || !billing.loaded) {
      return
    }

    const hasNonFreePlan =
      billing.currentSubscriptions &&
      billing.currentSubscriptions.length > 0 &&
      billing.currentSubscriptions.some(
        (sub: { isFreePlan?: boolean }) => !sub.isFreePlan
      )

    if (!hasNonFreePlan) {
      router.push('/pricing')
    }
  }, [
    isSessionPending,
    billing.loaded,
    billing.currentSubscriptions,
    router,
  ])

  // Fetch seats when billing is loaded
  useEffect(() => {
    if (
      billing.loaded &&
      billing.currentSubscriptions?.some(
        (s: { isFreePlan?: boolean }) => !s.isFreePlan
      )
    ) {
      refreshData()
    }
  }, [billing.loaded, billing.currentSubscriptions, refreshData])

  // Action handlers
  const handleClaimSeat = async () => {
    if (!inviteEmail.trim()) {
      setError('Please enter an email address')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail)) {
      setError('Please enter a valid email address')
      return
    }

    setIsClaimingOngoing(true)
    setError(null)

    try {
      await claimSeat(inviteEmail.trim())
      setInviteEmail('')
      await refreshData()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to claim seat'
      )
    } finally {
      setIsClaimingOngoing(false)
    }
  }

  const handleReleaseSeat = async (email: string) => {
    setIsReleasingOngoing(email)
    setError(null)

    try {
      await releaseSeat(email)
      await refreshData()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to release seat'
      )
    } finally {
      setIsReleasingOngoing(null)
    }
  }

  const handleAdjustSeats = async () => {
    if (newQuantity < 1) {
      setError('Seat count must be at least 1')
      return
    }

    // Check if we're trying to reduce below claimed count
    if (seatUsage && newQuantity < seatUsage.claimed) {
      setError(
        `Cannot reduce to ${newQuantity} seats. ${seatUsage.claimed} seats are currently claimed. Release some seats first.`
      )
      return
    }

    setIsAdjusting(true)
    setError(null)

    try {
      await adjustSeatCount(newQuantity)
      await billing.reload()
      await refreshData()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to adjust seat count'
      )
    } finally {
      setIsAdjusting(false)
    }
  }

  if (isSessionPending || !billing.loaded) {
    return <DashboardSkeleton />
  }

  if (
    billing.loadBilling !== true ||
    billing.errors !== null ||
    !billing.pricingModel
  ) {
    return <DashboardSkeleton />
  }

  const currentSubscription = billing.currentSubscriptions?.[0]
  const planName = currentSubscription?.name || 'Unknown Plan'

  // Calculate progress
  const capacity = seatUsage?.capacity ?? 0
  const claimed = seatUsage?.claimed ?? 0
  const available = seatUsage?.available ?? 0
  const usageProgress = capacity > 0 ? (claimed / capacity) * 100 : 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <main className="flex min-h-screen w-full max-w-2xl flex-col p-8">
        <div className="w-full space-y-6">
          {/* Plan & Seat Usage Card */}
          <Card>
            <CardHeader>
              <CardTitle>Current Plan: {planName}</CardTitle>
              <CardDescription>
                Manage your team seats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSeats ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : seatUsage ? (
                <>
                  {/* Seat Usage Display */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Seats
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {claimed}/{capacity} used ({available}{' '}
                        available)
                      </span>
                    </div>
                    <Progress value={usageProgress} className="h-3" />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No seat allocation found. Your plan may not include
                  seats.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Team Members Card */}
          {seatUsage && (
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  {claims.length === 0
                    ? 'No team members assigned yet'
                    : `${claims.length} seat${claims.length === 1 ? '' : 's'} assigned`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Claims List */}
                {claims.length > 0 && (
                  <div className="space-y-2">
                    {claims.map((claim) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {claim.externalId || 'Anonymous seat'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Added{' '}
                            {new Date(
                              claim.claimedAt
                            ).toLocaleDateString()}
                          </span>
                        </div>
                        {claim.externalId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleReleaseSeat(claim.externalId!)
                            }
                            disabled={
                              isReleasingOngoing === claim.externalId
                            }
                          >
                            {isReleasingOngoing ===
                            claim.externalId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Member Form */}
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="team@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleClaimSeat()
                      }
                    }}
                    disabled={isClaimingOngoing || available === 0}
                  />
                  <Button
                    onClick={handleClaimSeat}
                    disabled={
                      isClaimingOngoing ||
                      available === 0 ||
                      !inviteEmail.trim()
                    }
                  >
                    {isClaimingOngoing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
                {available === 0 && (
                  <p className="text-xs text-muted-foreground">
                    All seats are in use. Increase your seat count to
                    add more members.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Adjust Seats Card */}
          {seatUsage && (
            <Card>
              <CardHeader>
                <CardTitle>Adjust Seat Count</CardTitle>
                <CardDescription>
                  Change how many seats your subscription includes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setNewQuantity(Math.max(1, newQuantity - 1))
                      }
                      disabled={newQuantity <= 1 || isAdjusting}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={newQuantity}
                      onChange={(e) =>
                        setNewQuantity(
                          Math.max(
                            1,
                            Math.min(
                              100,
                              parseInt(e.target.value) || 1
                            )
                          )
                        )
                      }
                      className="w-20 text-center"
                      disabled={isAdjusting}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setNewQuantity(Math.min(100, newQuantity + 1))
                      }
                      disabled={newQuantity >= 100 || isAdjusting}
                    >
                      +
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {newQuantity === 1 ? 'seat' : 'seats'}
                    </span>
                  </div>
                </div>

                {newQuantity !== capacity && (
                  <div className="text-sm">
                    {newQuantity > capacity ? (
                      <span className="text-green-600 dark:text-green-400">
                        Adding {newQuantity - capacity} seat
                        {newQuantity - capacity === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        Removing {capacity - newQuantity} seat
                        {capacity - newQuantity === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleAdjustSeats}
                  disabled={isAdjusting || newQuantity === capacity}
                  className="w-full"
                >
                  {isAdjusting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Subscription'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
