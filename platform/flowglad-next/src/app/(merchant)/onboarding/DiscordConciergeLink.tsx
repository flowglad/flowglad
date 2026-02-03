'use client'

import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import { useAuthContext } from '@/contexts/authContext'
import { sanitizeChannelName } from '@/utils/discord'

export function DiscordConciergeLink() {
  const [isLoading, setIsLoading] = useState(false)
  const { organization } = useAuthContext()

  const createChannel =
    trpc.organizations.createDiscordConciergeChannel.useMutation({
      onSuccess: (data) => {
        // Open Discord invite in new tab (noopener for security)
        window.open(data.inviteUrl, '_blank', 'noopener,noreferrer')
        setIsLoading(false)
      },
      onError: (error) => {
        console.error('Failed to create Discord channel:', error)
        setIsLoading(false)
      },
    })

  const handleClick = () => {
    setIsLoading(true)
    createChannel.mutate({})
  }

  const channelName = `${sanitizeChannelName(organization?.name ?? 'your-org')}-flowglad-concierge`

  return (
    <div className="flex flex-col gap-3 border border-border rounded-[4px] bg-card p-4 w-full">
      <p className="text-sm text-muted-foreground">
        Get direct access to the founders and engineering team via
        your{' '}
        <span className="font-mono text-foreground">
          {channelName}
        </span>{' '}
        Discord channel.
      </p>
      <div className="flex flex-col gap-1">
        <Button
          className="w-full bg-[#717BF7] hover:bg-[#5865F2] text-white"
          onClick={handleClick}
          disabled={isLoading}
        >
          {isLoading
            ? 'Creating channel...'
            : 'Join Concierge Channel'}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          2min avg response time
        </p>
      </div>
    </div>
  )
}
