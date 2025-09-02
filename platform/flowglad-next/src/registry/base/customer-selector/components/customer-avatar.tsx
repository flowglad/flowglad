'use client'

import * as React from 'react'
import { User } from 'lucide-react'
import { cn } from '@/utils/core'
import type { CustomerAvatarProps } from '../types'

export function CustomerAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
}: CustomerAvatarProps) {
  const [imageError, setImageError] = React.useState(false)

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  }

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 0) return 'U'
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || 'U'
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  if (avatarUrl && !imageError) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-full bg-muted',
          sizeClasses[size],
          className
        )}
      >
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => {
            // If image fails to load, show fallback
            setImageError(true)
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-muted',
        sizeClasses[size],
        className
      )}
    >
      {name ? (
        <span className="font-medium text-muted-foreground">
          {getInitials(name)}
        </span>
      ) : (
        <User
          className={cn('text-muted-foreground', iconSizes[size])}
        />
      )}
    </div>
  )
}
