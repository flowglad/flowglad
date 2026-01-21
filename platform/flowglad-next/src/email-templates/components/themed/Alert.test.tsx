/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert } from './Alert'

describe('Alert', () => {
  describe('info variant', () => {
    it('renders with blue styling', () => {
      const { getByTestId } = render(
        <Alert variant="info">Important information</Alert>
      )

      const alert = getByTestId('alert-info')
      expect(alert).toBeInTheDocument()

      // Check computed styles include the info variant colors
      expect(alert).toHaveStyle({
        backgroundColor: '#eff6ff',
        borderColor: '#3b82f6',
      })
    })

    it('is the default variant when not specified', () => {
      const { getByTestId } = render(
        <Alert>Default info alert</Alert>
      )

      const alert = getByTestId('alert-info')
      expect(alert).toBeInTheDocument()
    })
  })

  describe('warning variant', () => {
    it('renders with yellow/amber styling', () => {
      const { getByTestId } = render(
        <Alert variant="warning">Warning message</Alert>
      )

      const alert = getByTestId('alert-warning')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveStyle({
        backgroundColor: '#fffbeb',
        borderColor: '#f59e0b',
      })
    })
  })

  describe('error variant', () => {
    it('renders with red styling', () => {
      const { getByTestId } = render(
        <Alert variant="error">Error message</Alert>
      )

      const alert = getByTestId('alert-error')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveStyle({
        backgroundColor: '#fef2f2',
        borderColor: '#ef4444',
      })
    })
  })

  describe('success variant', () => {
    it('renders with green styling', () => {
      const { getByTestId } = render(
        <Alert variant="success">Success message</Alert>
      )

      const alert = getByTestId('alert-success')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveStyle({
        backgroundColor: '#f0fdf4',
        borderColor: '#22c55e',
      })
    })
  })

  describe('content rendering', () => {
    it('renders children content', () => {
      const { getByTestId } = render(
        <Alert variant="info">Important message here</Alert>
      )

      const content = getByTestId('alert-content')
      expect(content).toHaveTextContent('Important message here')
    })

    it('renders title when provided', () => {
      const { getByTestId } = render(
        <Alert variant="warning" title="Warning Title">
          Warning content
        </Alert>
      )

      const title = getByTestId('alert-title')
      expect(title).toHaveTextContent('Warning Title')
    })

    it('does not render title element when title not provided', () => {
      const { queryByTestId } = render(
        <Alert variant="info">No title alert</Alert>
      )

      expect(queryByTestId('alert-title')).not.toBeInTheDocument()
    })
  })

  describe('custom styling', () => {
    it('accepts custom margin props', () => {
      const { getByTestId } = render(
        <Alert
          variant="info"
          style={{ marginTop: '32px', marginBottom: '32px' }}
        >
          Custom margin alert
        </Alert>
      )

      const alert = getByTestId('alert-info')
      expect(alert).toHaveStyle({
        marginTop: '32px',
        marginBottom: '32px',
      })
    })
  })

  describe('accessibility', () => {
    it('renders title with bold styling for visual hierarchy', () => {
      const { getByTestId } = render(
        <Alert variant="error" title="Error">
          Something went wrong
        </Alert>
      )

      const title = getByTestId('alert-title')
      expect(title).toHaveStyle({
        fontWeight: 'bold',
      })
    })
  })
})
