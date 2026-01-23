/**
 * To allow the import of markdown files in the project
 */
declare module '*.md'

/**
 * Extend bun:test Matchers with jest-dom matchers
 */
declare module 'bun:test' {
  interface Matchers<T> {
    toBeDisabled(): void
    toBeEnabled(): void
    toBeEmptyDOMElement(): void
    toBeInTheDocument(): void
    toBeInvalid(): void
    toBeRequired(): void
    toBeValid(): void
    toBeVisible(): void
    toContainElement(element: Element | null): void
    toContainHTML(html: string): void
    toHaveAccessibleDescription(description?: string | RegExp): void
    toHaveAccessibleErrorMessage(message?: string | RegExp): void
    toHaveAccessibleName(name?: string | RegExp): void
    toHaveAttribute(attr: string, value?: string | RegExp): void
    toHaveClass(...classes: string[]): void
    toHaveDisplayValue(
      value: string | RegExp | Array<string | RegExp>
    ): void
    toHaveErrorMessage(message?: string | RegExp): void
    toHaveFocus(): void
    toHaveFormValues(values: Record<string, unknown>): void
    toHaveRole(role: string): void
    toHaveStyle(style: string | Record<string, unknown>): void
    toHaveTextContent(
      text: string | RegExp,
      options?: { normalizeWhitespace: boolean }
    ): void
    toHaveValue(value: string | string[] | number | null): void
    toBeChecked(): void
    toBePartiallyChecked(): void
    toHaveDescription(description?: string | RegExp): void
  }
}
