import { StatusTag, type StatusTagProps } from './StatusTag'
import type { StatusConfig } from './types'

/**
 * Creates a typed StatusTag component bound to a specific config.
 * Reduces boilerplate compared to creating individual wrapper files.
 *
 * @example
 * export const SubscriptionStatusTag = createStatusTag(subscriptionStatusConfig)
 */
export function createStatusTag<T extends string>(
  config: StatusConfig<T>
) {
  function BoundStatusTag(props: Omit<StatusTagProps<T>, 'config'>) {
    return <StatusTag {...props} config={config} />
  }

  // Preserve display name for React DevTools
  BoundStatusTag.displayName = `StatusTag(${Object.keys(config)[0] ?? 'unknown'})`

  return BoundStatusTag
}
