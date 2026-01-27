import Link from 'next/link'

interface VariantSelectorProps {
  emailType: string
  currentVariant: string
  variants: string[]
}

/**
 * Component for selecting email preview variants.
 * Shows all variants as a toggle group where the current variant is highlighted.
 */
export function VariantSelector({
  emailType,
  currentVariant,
  variants,
}: VariantSelectorProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Variant:</span>
      <div
        className="inline-flex items-center gap-0.5"
        role="group"
        aria-label="Select variant"
      >
        {variants.map((variant) => {
          const isActive = variant === currentVariant

          if (isActive) {
            return (
              <span
                key={variant}
                className="px-2.5 py-1 text-xs font-medium rounded bg-secondary text-foreground"
                aria-current="page"
              >
                {variant}
              </span>
            )
          }

          return (
            <Link
              key={variant}
              href={`/email-preview/${encodeURIComponent(emailType)}/${encodeURIComponent(variant)}`}
              className="px-2.5 py-1 text-xs font-medium rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {variant}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
