export function DetailLabel({
  label,
  value,
}: {
  label: string
  value: string | React.ReactNode
}) {
  const valueElement =
    typeof value === 'string' ? (
      <div className="text-sm font-semibold text-foreground">
        {value}
      </div>
    ) : (
      value
    )
  return (
    <div className="max-w-full min-w-0 flex flex-col gap-0.5">
      <div className="text-xs font-medium text-muted-foreground">
        {label}
      </div>
      {valueElement}
    </div>
  )
}
