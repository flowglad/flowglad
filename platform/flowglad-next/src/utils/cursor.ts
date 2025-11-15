export const cursorDeepLink = (prompt: string) => {
  const cursorLink = new URL(`https://cursor.com/link/prompt`)
  cursorLink.searchParams.set('text', prompt)
  return cursorLink.toString()
}
