/**
 * Shared components for detail pages (features, usage meters, etc.)
 * These provide consistent styling for displaying field labels, values, and helper text.
 */

/**
 * Section label component with monospace font (Berkeley Mono style)
 */
export function SectionLabel({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <p className="font-mono font-medium text-sm text-muted-foreground leading-[1.2]">
      {children}
    </p>
  )
}

/**
 * Section value component with standard font
 */
export function SectionValue({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <p className="font-sans font-normal text-base text-foreground leading-6">
      {children}
    </p>
  )
}

/**
 * Helper text component for descriptions under fields
 */
export function HelperText({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <p className="font-sans font-normal text-sm text-muted-foreground leading-tight">
      {children}
    </p>
  )
}

/**
 * Content section container component
 */
export function ContentSection({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="flex flex-col gap-2 w-full">{children}</div>
}
