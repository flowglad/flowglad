'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface EmailCardProps {
  emailType: string
  description: string
  variants: string[]
}

/**
 * Client component for email preview cards.
 * Allows clicking the entire card to navigate to the default variant,
 * while still allowing individual variant links to work.
 */
export function EmailCard({
  emailType,
  description,
  variants,
}: EmailCardProps) {
  const router = useRouter()
  const defaultVariant = variants[0] ?? 'default'

  const navigateToDefault = () => {
    router.push(
      `/email-preview/${encodeURIComponent(emailType)}/${encodeURIComponent(defaultVariant)}`
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigateToDefault()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={navigateToDefault}
      onKeyDown={handleKeyDown}
      className="border border-border rounded-lg p-4 bg-card-muted shadow-sm hover:shadow-md hover:border-primary transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <h3 className="font-medium text-card-foreground mb-1">
        {emailType.split('.').slice(1).join(' → ')}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {description}
      </p>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => (
          <Link
            key={`${emailType}-${variant}`}
            href={`/email-preview/${encodeURIComponent(emailType)}/${encodeURIComponent(variant)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            {variant}
          </Link>
        ))}
      </div>
    </div>
  )
}
