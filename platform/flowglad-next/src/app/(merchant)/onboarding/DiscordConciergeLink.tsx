'use client'

import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'

export function DiscordConciergeLink() {
  const [isLoading, setIsLoading] = useState(false)

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

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
    >
      {isLoading
        ? 'Creating channel...'
        : 'Join Discord for dedicated support →'}
    </button>
  )
}
