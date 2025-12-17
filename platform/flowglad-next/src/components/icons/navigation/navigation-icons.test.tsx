import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { FinishSetupIcon } from '../FinishSetupIcon'
import { MoreIcon } from '../MoreIcon'
import { PaymentsIcon } from '../PaymentsIcon'
import { SettingsIcon } from '../SettingsIcon'
import { CustomersIcon, SubscriptionsIcon } from './PhosphorWrappers'

describe('Custom Navigation Icons', () => {
  describe('PaymentsIcon', () => {
    it('should render with className prop', () => {
      render(
        <PaymentsIcon className="test-class" data-testid="icon" />
      )
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveClass('test-class')
    })

    it('should forward ref to SVG element', () => {
      const ref = React.createRef<SVGSVGElement>()
      render(<PaymentsIcon ref={ref} />)
      expect(ref.current).toBeInstanceOf(SVGSVGElement)
    })

    it('should use currentColor for stroke', () => {
      render(<PaymentsIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      const path = svg.querySelector('path')
      expect(path).toHaveAttribute('stroke', 'currentColor')
    })
  })

  describe('MoreIcon', () => {
    it('should render with className prop', () => {
      render(<MoreIcon className="test-class" data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveClass('test-class')
    })

    it('should forward ref to SVG element', () => {
      const ref = React.createRef<SVGSVGElement>()
      render(<MoreIcon ref={ref} />)
      expect(ref.current).toBeInstanceOf(SVGSVGElement)
    })

    it('should use currentColor for stroke', () => {
      render(<MoreIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      const path = svg.querySelector('path')
      expect(path).toHaveAttribute('stroke', 'currentColor')
    })
  })

  describe('SettingsIcon', () => {
    it('should render with className prop', () => {
      render(
        <SettingsIcon className="test-class" data-testid="icon" />
      )
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveClass('test-class')
    })

    it('should forward ref to SVG element', () => {
      const ref = React.createRef<SVGSVGElement>()
      render(<SettingsIcon ref={ref} />)
      expect(ref.current).toBeInstanceOf(SVGSVGElement)
    })

    it('should use currentColor for stroke', () => {
      render(<SettingsIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      const path = svg.querySelector('path')
      expect(path).toHaveAttribute('stroke', 'currentColor')
    })
  })

  describe('FinishSetupIcon', () => {
    it('should render with className prop', () => {
      render(
        <FinishSetupIcon className="test-class" data-testid="icon" />
      )
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveClass('test-class')
    })

    it('should forward ref to SVG element', () => {
      const ref = React.createRef<SVGSVGElement>()
      render(<FinishSetupIcon ref={ref} />)
      expect(ref.current).toBeInstanceOf(SVGSVGElement)
    })

    it('should use currentColor for fill', () => {
      render(<FinishSetupIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      const path = svg.querySelector('path')
      expect(path).toHaveAttribute('fill', 'currentColor')
    })
  })

  describe('PhosphorWrappers', () => {
    describe('CustomersIcon', () => {
      it('should render with className prop', () => {
        render(
          <CustomersIcon className="test-class" data-testid="icon" />
        )
        const svg = screen.getByTestId('icon')
        expect(svg).toHaveClass('test-class')
      })

      it('should accept size prop', () => {
        render(<CustomersIcon size={24} data-testid="icon" />)
        const svg = screen.getByTestId('icon')
        expect(svg).toHaveAttribute('width', '24')
        expect(svg).toHaveAttribute('height', '24')
      })

      it('should use default size of 20', () => {
        render(<CustomersIcon data-testid="icon" />)
        const svg = screen.getByTestId('icon')
        expect(svg).toHaveAttribute('width', '20')
        expect(svg).toHaveAttribute('height', '20')
      })
    })

    describe('SubscriptionsIcon', () => {
      it('should render with className prop', () => {
        render(
          <SubscriptionsIcon
            className="test-class"
            data-testid="icon"
          />
        )
        const svg = screen.getByTestId('icon')
        expect(svg).toHaveClass('test-class')
      })

      it('should accept size prop', () => {
        render(<SubscriptionsIcon size={24} data-testid="icon" />)
        const svg = screen.getByTestId('icon')
        expect(svg).toHaveAttribute('width', '24')
        expect(svg).toHaveAttribute('height', '24')
      })

      it('should use default size of 20', () => {
        render(<SubscriptionsIcon data-testid="icon" />)
        const svg = screen.getByTestId('icon')
        expect(svg).toHaveAttribute('width', '20')
        expect(svg).toHaveAttribute('height', '20')
      })
    })
  })
})
