'use client'

import { useEffect, useState } from 'react'
import { loadPreviewCSS, removePreviewCSS } from '../utils/css-loader'

interface PreviewWrapperProps {
  children: React.ReactNode
  className?: string
  showLoading?: boolean
}

export function PreviewWrapper({
  children,
  className = '',
  showLoading = true,
}: PreviewWrapperProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadStyles() {
      try {
        setIsLoading(true)
        setError(null)
        await loadPreviewCSS()

        if (mounted) {
          setIsLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load preview styles'
          )
          setIsLoading(false)
        }
      }
    }

    loadStyles()

    // Cleanup: optionally remove CSS on unmount
    return () => {
      mounted = false
      // Uncomment to remove CSS on unmount:
      // removePreviewCSS()
    }
  }, [])

  if (isLoading && showLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-sm text-muted-foreground">
            Loading preview styles...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-6 max-w-md">
          <div className="text-red-500 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground">
            Failed to Load Styles
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`preview-wrapper ${className}`}
      data-preview-loaded="true"
    >
      {children}
    </div>
  )
}
