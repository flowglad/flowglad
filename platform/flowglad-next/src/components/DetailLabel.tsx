export function DetailLabel({
  label,
  value,
}: {
  label: string
  value: string | React.ReactNode
}) {
  const valueElement =
    typeof value === 'string' ? (
      <div className="text-sm font-semibold text-primary-foreground-hover">
        {value}
      </div>
    ) : (
      value
    )
  return (
    <div className="w-fit flex flex-col gap-0.5">
      <div className="text-xs font-medium text-muted-foreground">
        {label}
      </div>
      {valueElement}
    </div>
  )
}
