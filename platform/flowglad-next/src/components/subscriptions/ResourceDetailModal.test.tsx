/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResourceDetailModal } from './ResourceDetailModal'

describe('ResourceDetailModal', () => {
  const defaultProps = {
    resourceSlug: 'seats',
    capacity: 100,
    claimed: 75,
    available: 25,
    open: true,
    onOpenChange: () => {},
  }

  describe('usage percentage calculation', () => {
    it('calculates and displays correct usage percentage', () => {
      render(<ResourceDetailModal {...defaultProps} />)

      expect(screen.getByText('75%')).toBeInTheDocument()
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '75')
    })

    it('caps usage percentage at 100% when over-claimed', () => {
      render(
        <ResourceDetailModal
          {...defaultProps}
          capacity={50}
          claimed={75}
          available={-25}
        />
      )

      expect(screen.getByText('100%')).toBeInTheDocument()
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '100')
    })

    it('handles zero capacity without division by zero', () => {
      render(
        <ResourceDetailModal
          {...defaultProps}
          capacity={0}
          claimed={0}
          available={0}
        />
      )

      expect(screen.getByText('0%')).toBeInTheDocument()
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '0')
    })

    it('rounds percentage to nearest integer', () => {
      render(
        <ResourceDetailModal
          {...defaultProps}
          capacity={3}
          claimed={1}
          available={2}
        />
      )

      // 1/3 = 33.33...% should round to 33%
      expect(screen.getByText('33%')).toBeInTheDocument()
    })
  })

  describe('stats display', () => {
    it('displays capacity, claimed, and available values', () => {
      render(<ResourceDetailModal {...defaultProps} />)

      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('75')).toBeInTheDocument()
      expect(screen.getByText('25')).toBeInTheDocument()
      expect(screen.getByText('Total Capacity')).toBeInTheDocument()
      expect(screen.getByText('Claimed')).toBeInTheDocument()
      expect(screen.getByText('Available')).toBeInTheDocument()
    })

    it('displays resource slug as the modal title', () => {
      render(
        <ResourceDetailModal
          {...defaultProps}
          resourceSlug="api-calls"
        />
      )

      expect(screen.getByText('api-calls')).toBeInTheDocument()
    })
  })

  describe('modal visibility', () => {
    it('renders dialog when open is true', () => {
      render(<ResourceDetailModal {...defaultProps} open={true} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render dialog content when open is false', () => {
      render(<ResourceDetailModal {...defaultProps} open={false} />)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
