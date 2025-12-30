const isValidURL = (url: string) => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export const validateUrl = (
  url: string | undefined,
  propName: string,
  allowRelative = false
) => {
  if (typeof url === 'undefined') {
    return
  }

  const isValid = allowRelative
    ? url.startsWith('/') || isValidURL(url)
    : isValidURL(url)

  if (!isValid) {
    const expectedMsg = allowRelative
      ? 'a valid URL or relative path starting with a forward slash (/)'
      : 'a valid URL'
    throw new Error(
      `FlowgladProvider: Received invalid \`${propName}\` property. Expected ${expectedMsg}. Received: "${url}"`
    )
  }
}
