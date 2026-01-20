/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Divider } from './Divider'

describe('Divider', () => {
  describe('default rendering', () => {
    it('renders horizontal rule with default styling', () => {
      const { getByTestId } = render(<Divider />)

      const divider = getByTestId('divider')
      expect(divider).toBeInTheDocument()
    })

    it('uses default border color of #e6e6e6', () => {
      const { getByTestId } = render(<Divider />)

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        borderColor: '#e6e6e6',
      })
    })

    it('uses default margins of 16px', () => {
      const { getByTestId } = render(<Divider />)

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        marginTop: '16px',
        marginBottom: '16px',
      })
    })
  })

  describe('custom props', () => {
    it('accepts custom marginTop', () => {
      const { getByTestId } = render(<Divider marginTop="32px" />)

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        marginTop: '32px',
      })
    })

    it('accepts custom marginBottom', () => {
      const { getByTestId } = render(<Divider marginBottom="24px" />)

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        marginBottom: '24px',
      })
    })

    it('accepts custom color', () => {
      const { getByTestId } = render(<Divider color="#cccccc" />)

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        borderColor: '#cccccc',
      })
    })

    it('accepts custom style object that overrides defaults', () => {
      const { getByTestId } = render(
        <Divider
          style={{
            marginTop: '48px',
            marginBottom: '48px',
          }}
        />
      )

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        marginTop: '48px',
        marginBottom: '48px',
      })
    })
  })

  describe('border styling', () => {
    it('renders with only bottom border', () => {
      const { getByTestId } = render(<Divider />)

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
      })
    })
  })

  describe('common use cases', () => {
    it('works with no margins for tight spacing', () => {
      const { getByTestId } = render(
        <Divider marginTop="0px" marginBottom="0px" />
      )

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        marginTop: '0px',
        marginBottom: '0px',
      })
    })

    it('works with large margins for section separation', () => {
      const { getByTestId } = render(
        <Divider marginTop="40px" marginBottom="40px" />
      )

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        marginTop: '40px',
        marginBottom: '40px',
      })
    })

    it('works with dark color for emphasis', () => {
      const { getByTestId } = render(<Divider color="#333333" />)

      const divider = getByTestId('divider')
      expect(divider).toHaveStyle({
        borderColor: '#333333',
      })
    })
  })
})
