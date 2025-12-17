export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | 'credit_trial'
  | 'inactive'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'unpaid'

export function getStatusColor(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'text-jade-foreground bg-jade-background border-jade-foreground/20'
    case 'trialing':
      return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800'
    case 'past_due':
      return 'text-destructive bg-destructive/10 border-destructive/20'
    case 'canceled':
      return 'text-muted-foreground bg-muted border-border'
    default:
      return 'text-muted-foreground bg-muted border-border'
  }
}

export function getStatusBadgeVariant(
  status: SubscriptionStatus
): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'trialing':
      return 'secondary'
    case 'past_due':
      return 'destructive'
    case 'canceled':
      return 'outline'
    default:
      return 'outline'
  }
}

export function getStatusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'trialing':
      return 'Trial'
    case 'past_due':
      return 'Past Due'
    case 'canceled':
      return 'Canceled'
    default:
      return status
  }
}
