interface PageHeaderProps {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export function PageHeader({
  title,
  subtitle,
  action,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between ${className || ''}`}
    >
      <div className="space-y-1 min-w-0 flex-1">
        {(title || children) && (
          <h1 className="text-2xl truncate">{title || children}</h1>
        )}
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  )
}
