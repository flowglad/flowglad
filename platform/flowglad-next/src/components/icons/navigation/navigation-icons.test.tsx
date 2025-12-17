import { render, screen } from '@testing-library/react'
import { Gauge } from 'lucide-react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { FinishSetupIcon } from '../FinishSetupIcon'
import { MoreIcon } from '../MoreIcon'
import { PaymentsIcon } from '../PaymentsIcon'
import { SettingsIcon } from '../SettingsIcon'
import {
  createNavIcon,
  NAV_ICON_SIZE,
  NAV_ICON_STROKE_WIDTH,
} from './createNavIcon'
import { CustomersIcon, SubscriptionsIcon } from './PhosphorWrappers'

describe('Navigation Icon System', () => {
  describe('constants', () => {
    it('should export NAV_ICON_SIZE as 20', () => {
      expect(NAV_ICON_SIZE).toBe(20)
    })

    it('should export NAV_ICON_STROKE_WIDTH as 2', () => {
      expect(NAV_ICON_STROKE_WIDTH).toBe(2)
    })
  })

  describe('createNavIcon factory', () => {
    const TestIcon = createNavIcon(Gauge, 'TestIcon')

    it('should create an icon with default size of 20', () => {
      render(<TestIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg).toHaveAttribute('height', '20')
    })

    it('should create an icon with default strokeWidth of 2', () => {
      render(<TestIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('stroke-width', '2')
    })

    it('should allow overriding size', () => {
      render(<TestIcon size={24} data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
    })

    it('should allow overriding strokeWidth', () => {
      render(<TestIcon strokeWidth={1.5} data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('stroke-width', '1.5')
    })

    it('should include shrink-0 class by default', () => {
      render(<TestIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveClass('shrink-0')
    })

    it('should set displayName correctly', () => {
      expect(TestIcon.displayName).toBe('TestIcon')
    })
  })
})

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

    it('should use default size of 20', () => {
      render(<PaymentsIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg).toHaveAttribute('height', '20')
    })

    it('should accept size prop', () => {
      render(<PaymentsIcon size={24} data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
    })

    it('should use default strokeWidth of 2', () => {
      render(<PaymentsIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      const path = svg.querySelector('path')
      expect(path).toHaveAttribute('stroke-width', '2')
    })

    it('should accept strokeWidth prop', () => {
      render(<PaymentsIcon strokeWidth={1.5} data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      const path = svg.querySelector('path')
      expect(path).toHaveAttribute('stroke-width', '1.5')
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

    it('should use default size of 20', () => {
      render(<MoreIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg).toHaveAttribute('height', '20')
    })

    it('should accept size prop', () => {
      render(<MoreIcon size={24} data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
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

    it('should use default size of 20', () => {
      render(<SettingsIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg).toHaveAttribute('height', '20')
    })

    it('should accept size prop', () => {
      render(<SettingsIcon size={24} data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
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

    it('should use default size of 20', () => {
      render(<FinishSetupIcon data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg).toHaveAttribute('height', '20')
    })

    it('should accept size prop', () => {
      render(<FinishSetupIcon size={24} data-testid="icon" />)
      const svg = screen.getByTestId('icon')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
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
