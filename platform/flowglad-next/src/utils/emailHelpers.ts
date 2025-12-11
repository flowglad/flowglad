/**
 * Masks an email address for display purposes while maintaining readability
 * @param email - The email address to mask
 * @returns Masked email string (e.g., "jo***n@example.com")
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')

  if (!domain) {
    // Invalid email format, return as-is
    return email
  }

  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }

  const visibleChars = Math.min(2, Math.floor(local.length / 3))
  const masked =
    local.slice(0, visibleChars) + '***' + local.slice(-1)
  return `${masked}@${domain}`
}
