import { describe, it, expect } from 'vitest'
import { buttonVariants } from './button'

describe('buttonVariants', () => {
  it('should include destructive classes when destructive variant is set', () => {
    const classes = buttonVariants({ variant: 'destructive' })

    expect(classes).toContain('flowglad-bg-destructive')
    expect(classes).toContain('flowglad-text-white')
    expect(classes).toContain('hover:flowglad-bg-destructive/90')
    expect(classes).toContain(
      'flowglad-focus-visible:ring-destructive/20'
    )
    expect(classes).toContain(
      'flowglad-dark:focus-visible:ring-destructive/40'
    )
  })
})
