'use client'

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ScrollButtonProps {
  /** Icon component to render */
  icon: React.ElementType
  /** Click handler */
  onClick?: () => void
  /** Whether the button is disabled */
  disabled?: boolean
}

/**
 * Scroll button for the legend slider.
 * Supports continuous scrolling when held down.
 */
export function ScrollButton({
  icon,
  onClick,
  disabled,
}: ScrollButtonProps) {
  const Icon = icon
  const [isPressed, setIsPressed] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isPressed) {
      intervalRef.current = setInterval(() => {
        onClick?.()
      }, 300)
    } else {
      clearInterval(intervalRef.current as NodeJS.Timeout)
    }
    return () => clearInterval(intervalRef.current as NodeJS.Timeout)
  }, [isPressed, onClick])

  useEffect(() => {
    if (disabled) {
      clearInterval(intervalRef.current as NodeJS.Timeout)
      setIsPressed(false)
    }
  }, [disabled])

  return (
    <button
      type="button"
      className={cn(
        // base
        'group inline-flex size-5 items-center truncate rounded transition',
        disabled
          ? 'cursor-not-allowed text-muted-foreground opacity-50'
          : 'cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        setIsPressed(true)
      }}
      onMouseUp={(e) => {
        e.stopPropagation()
        setIsPressed(false)
      }}
    >
      <Icon className="size-full" aria-hidden="true" />
    </button>
  )
}
