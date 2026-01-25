'use client'

import {
  type ResourceClaim,
  useBilling,
  useResource,
} from '@flowglad/nextjs'
import { Loader2, Trash2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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

export function HomeClient() {
  const router = useRouter()
  const { data: session, isPending: isSessionPending } =
    authClient.useSession()
  const billing = useBilling()
  const {
    usage: seatUsage,
    claims,
    claim,
    release,
    isLoading: isLoadingSeats,
    isLoadingClaims,
  } = useResource('seats')

  const [inviteEmail, setInviteEmail] = useState('')
  const [newQuantity, setNewQuantity] = useState(1)
  const [isClaimingLoading, setIsClaimingLoading] = useState(false)
  const [isReleasingId, setIsReleasingId] = useState<string | null>(
    null
  )
  const [isAdjustingSeats, setIsAdjustingSeats] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previousUserIdRef = useRef<string | undefined>(undefined)

  // Refetch billing data when user ID changes to prevent showing previous user's data
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

  // Initialize newQuantity when seat usage loads (only run once when capacity becomes available)
  const hasInitializedQuantity = useRef(false)
  useEffect(() => {
    if (seatUsage?.capacity && !hasInitializedQuantity.current) {
      setNewQuantity(seatUsage.capacity)
      hasInitializedQuantity.current = true
    }
  }, [seatUsage?.capacity])

  // Check if user is on free plan and redirect to pricing page
  useEffect(() => {
    if (isSessionPending || !billing.loaded) {
      return
    }

    const hasNonFreePlan =
      billing.currentSubscriptions &&
      billing.currentSubscriptions.length > 0 &&
      billing.currentSubscriptions.some((sub) => !sub.isFreePlan)

    if (!hasNonFreePlan) {
      router.push('/pricing')
    }
  }, [
    isSessionPending,
    billing.loaded,
    billing.currentSubscriptions,
    router,
  ])

  if (isSessionPending || !billing.loaded) {
    return <DashboardSkeleton />
  }

  if (
    !session?.user ||
    billing.errors !== null ||
    !billing.pricingModel ||
    !billing.customer
  ) {
    return <DashboardSkeleton />
  }

  const currentSubscription = billing.currentSubscriptions?.[0]
  const planName = currentSubscription?.name || 'Unknown Plan'

  const handleClaimSeat = async () => {
    if (!inviteEmail.trim()) return

    setIsClaimingLoading(true)
    setError(null)

    try {
      await claim({ externalId: inviteEmail.trim() })
      setInviteEmail('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add team member. Please try again.'
      )
    } finally {
      setIsClaimingLoading(false)
    }
  }

  const handleReleaseSeat = async (externalId: string) => {
    setIsReleasingId(externalId)
    setError(null)

    try {
      await release({ externalId })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to remove team member. Please try again.'
      )
    } finally {
      setIsReleasingId(null)
    }
  }

  const handleAdjustSeats = async () => {
    if (!billing.adjustSubscription) return

    // Block reducing below claimed count
    const claimedCount = seatUsage?.claimed ?? 0
    if (newQuantity < claimedCount) {
      setError(
        `Cannot reduce seats below ${claimedCount}. Release some seats first.`
      )
      return
    }

    // Derive slug from current subscription's priceId using catalog
    const currentSubscription = billing.currentSubscriptions?.[0]
    const currentPriceId = currentSubscription?.priceId
    if (!currentPriceId || !billing.catalog) {
      setError('Unable to determine current subscription plan.')
      return
    }

    // Find the price slug from the catalog
    let priceSlug: string | null = null
    for (const product of billing.catalog.products) {
      const price = product.prices.find(
        (p) => p.id === currentPriceId
      )
      if (price?.slug) {
        priceSlug = price.slug
        break
      }
    }

    if (!priceSlug) {
      setError('Unable to find price slug for current subscription.')
      return
    }

    setIsAdjustingSeats(true)
    setError(null)

    try {
      await billing.adjustSubscription({
        priceSlug,
        quantity: newQuantity,
      })
      // Reset initialized flag so the useEffect will update newQuantity after reload
      hasInitializedQuantity.current = false
      // Reload billing to get updated subscription
      await billing.reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to adjust seats. Please try again.'
      )
    } finally {
      setIsAdjustingSeats(false)
    }
  }

  // Calculate progress percentage
  const capacity = seatUsage?.capacity ?? 0
  const claimed = seatUsage?.claimed ?? 0
  const available = seatUsage?.available ?? 0
  const progressPercent =
    capacity > 0 ? (claimed / capacity) * 100 : 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <main className="flex min-h-screen w-full max-w-2xl flex-col p-8">
        <div className="w-full space-y-6">
          {/* Seat Usage Card */}
          <Card>
            <CardHeader>
              <CardTitle>Current Plan: {planName}</CardTitle>
              <CardDescription>
                Seats: {claimed}/{capacity} used ({available}{' '}
                available)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSeats ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Progress value={progressPercent} className="h-3" />
                  <p className="text-sm text-muted-foreground text-right">
                    {Math.round(progressPercent)}% utilized
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Members List */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage seats assigned to team members
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingClaims ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : claims.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No team members assigned yet. Add someone below.
                </p>
              ) : (
                <div className="space-y-3">
                  {claims.map((claimItem: ResourceClaim) => (
                    <div
                      key={claimItem.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {claimItem.externalId ?? 'Anonymous Seat'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Added{' '}
                          {new Date(
                            claimItem.claimedAt
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      {claimItem.externalId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleReleaseSeat(claimItem.externalId!)
                          }
                          disabled={
                            isReleasingId === claimItem.externalId
                          }
                        >
                          {isReleasingId === claimItem.externalId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Invite Member Form */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-medium mb-3">
                  Add Team Member
                </h4>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>
                    ) => setInviteEmail(e.target.value)}
                    onKeyDown={(
                      e: React.KeyboardEvent<HTMLInputElement>
                    ) => {
                      if (e.key === 'Enter') {
                        handleClaimSeat()
                      }
                    }}
                    disabled={isClaimingLoading || available === 0}
                  />
                  <Button
                    onClick={handleClaimSeat}
                    disabled={
                      isClaimingLoading ||
                      !inviteEmail.trim() ||
                      available === 0
                    }
                  >
                    {isClaimingLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {available === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    No seats available. Increase your seat count
                    below.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Adjust Seat Count UI */}
          <Card>
            <CardHeader>
              <CardTitle>Adjust Seat Count</CardTitle>
              <CardDescription>
                Current: {capacity} seats ($
                {((capacity * 1000) / 100).toFixed(0)}/month)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-10 w-10 p-0"
                    onClick={() =>
                      setNewQuantity(
                        Math.max(claimed, newQuantity - 1)
                      )
                    }
                    disabled={
                      newQuantity <= claimed || isAdjustingSeats
                    }
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    value={newQuantity}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>
                    ) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= 1 && val <= 100) {
                        setNewQuantity(val)
                      }
                    }}
                    className="w-20 text-center"
                    min={claimed}
                    max={100}
                    disabled={isAdjustingSeats}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-10 w-10 p-0"
                    onClick={() =>
                      setNewQuantity(Math.min(100, newQuantity + 1))
                    }
                    disabled={newQuantity >= 100 || isAdjustingSeats}
                  >
                    +
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    seats (${((newQuantity * 1000) / 100).toFixed(0)}
                    /month)
                  </span>
                </div>

                {newQuantity < claimed && (
                  <p className="text-sm text-destructive">
                    Cannot reduce below {claimed} (currently claimed
                    seats). Release some seats first.
                  </p>
                )}

                <Button
                  onClick={handleAdjustSeats}
                  disabled={
                    isAdjustingSeats ||
                    newQuantity === capacity ||
                    newQuantity < claimed ||
                    !billing.adjustSubscription
                  }
                  className="w-full"
                >
                  {isAdjustingSeats ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Updating...
                    </>
                  ) : newQuantity === capacity ? (
                    'No Changes'
                  ) : newQuantity > capacity ? (
                    `Add ${newQuantity - capacity} Seat${newQuantity - capacity > 1 ? 's' : ''}`
                  ) : (
                    `Remove ${capacity - newQuantity} Seat${capacity - newQuantity > 1 ? 's' : ''}`
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="py-4">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
