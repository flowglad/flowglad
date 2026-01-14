const isValidURL = (url: string) => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Validates a URL string and throws an error if invalid.
 * @param url - The URL string to validate
 * @param propName - The name of the property being validated (used in error messages)
 * @param allowRelative - If true, allows relative paths starting with '/' in addition to full URLs
 * @throws {Error} When the URL is invalid according to the validation rules
 */
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
