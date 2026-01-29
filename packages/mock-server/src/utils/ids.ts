import { nanoid } from 'nanoid'

/**
 * Generate a unique ID with an optional prefix.
 * @param prefix - Optional prefix to prepend to the ID (e.g., "msg_", "app_")
 * @param size - Length of the random part (default: 21)
 */
export function generateId(prefix?: string, size = 21): string {
  const id = nanoid(size)
  return prefix ? `${prefix}${id}` : id
}

/**
 * Generate a Svix-style message ID (prefixed with "msg_")
 */
export function generateSvixMessageId(): string {
  return generateId('msg_')
}

/**
 * Generate a Svix-style application ID (prefixed with "app_")
 */
export function generateSvixAppId(): string {
  return generateId('app_')
}

/**
 * Generate an Unkey-style key ID (prefixed with "key_")
 */
export function generateUnkeyKeyId(): string {
  return generateId('key_')
}

/**
 * Generate a Trigger.dev-style run ID (prefixed with "run_")
 */
export function generateTriggerRunId(): string {
  return generateId('run_')
}
