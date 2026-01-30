/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { ReactNode } from 'react'
import type { NavUserProps } from './NavUser'

// Mock sidebar context
mock.module('@/components/ui/sidebar', () => ({
  useSidebar: () => ({
    state: 'expanded',
    toggleSidebar: mock(),
  }),
}))

// Mock hooks
const mockSwitchOrganization = mock(() => Promise.resolve())
const mockSwitchPricingModel = mock(() => Promise.resolve())

mock.module('@/hooks/useOrganizationList', () => ({
  useOrganizationList: () => ({
    organizations: [
      { id: 'org-1', name: 'Org One', logoURL: null },
      {
        id: 'org-2',
        name: 'Org Two',
        logoURL: 'https://example.com/logo.png',
      },
    ],
    currentOrganizationId: 'org-1',
    isSwitching: false,
    switchOrganization: mockSwitchOrganization,
  }),
}))

mock.module('@/hooks/usePricingModelList', () => ({
  usePricingModelList: () => ({
    pricingModels: [
      {
        pricingModel: {
          id: 'pm-live-1',
          name: 'Production PM',
          livemode: true,
        },
      },
      {
        pricingModel: {
          id: 'pm-test-1',
          name: 'Test PM',
          livemode: false,
        },
      },
      {
        pricingModel: {
          id: 'pm-live-2',
          name: 'Another Live PM',
          livemode: true,
        },
      },
    ],
    currentPricingModelId: 'pm-live-1',
    isSwitching: false,
    switchPricingModel: mockSwitchPricingModel,
  }),
}))

// Mock next/image
mock.module('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string
    alt: string
    [key: string]: unknown
  }) => <img src={src} alt={alt} {...props} />,
}))

// Mock next/link
mock.module('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock CreateOrganizationModal
mock.module('../forms/CreateOrganizationModal', () => ({
  default: ({
    isOpen,
    setIsOpen,
  }: {
    isOpen: boolean
    setIsOpen: (open: boolean) => void
  }) => (
    <div
      data-testid="create-org-modal"
      data-open={isOpen}
      onClick={() => setIsOpen(false)}
    >
      Create Org Modal
    </div>
  ),
}))

// Mock CreatePricingModelModal
mock.module('../forms/CreatePricingModelModal', () => ({
  default: ({
    isOpen,
    setIsOpen,
  }: {
    isOpen: boolean
    setIsOpen: (open: boolean) => void
  }) => (
    <div
      data-testid="create-pm-modal"
      data-open={isOpen}
      onClick={() => setIsOpen(false)}
    >
      Create PM Modal
    </div>
  ),
}))

import { render, screen } from '@testing-library/react'
import { NavUser } from './NavUser'

const defaultProps: NavUserProps = {
  user: {
    name: 'Test User',
    email: 'test@example.com',
    image: 'https://example.com/avatar.jpg',
  },
  organization: {
    id: 'org-1',
    name: 'Test Organization',
    logoURL: null,
  },
  pricingModel: {
    id: 'pm-live-1',
    name: 'Production PM',
    livemode: true,
  },
  onSignOut: mock(),
}

describe('NavUser', () => {
  beforeEach(() => {
    mockSwitchOrganization.mockClear()
    mockSwitchPricingModel.mockClear()
    ;(defaultProps.onSignOut as ReturnType<typeof mock>).mockClear()
  })

  describe('Trigger button rendering', () => {
    it('displays organization name in the trigger button', () => {
      render(<NavUser {...defaultProps} />)

      expect(screen.getByTestId('nav-user-name')).toHaveTextContent(
        'Test Organization'
      )
    })

    it('displays pricing model name when provided', () => {
      render(<NavUser {...defaultProps} />)

      expect(screen.getByTestId('nav-user-org')).toHaveTextContent(
        'Production PM'
      )
    })

    it('displays "No pricing model" when pricingModel is undefined', () => {
      render(<NavUser {...defaultProps} pricingModel={undefined} />)

      expect(screen.getByTestId('nav-user-org')).toHaveTextContent(
        'No pricing model'
      )
    })

    it('displays avatar fallback with organization initials when no logo', () => {
      render(<NavUser {...defaultProps} />)

      const fallback = screen.getByTestId('nav-user-avatar-fallback')
      expect(fallback).toBeInTheDocument()
      expect(fallback).toHaveTextContent('TO') // Test Organization -> TO
    })

    it('renders the trigger button with correct testid', () => {
      render(<NavUser {...defaultProps} />)

      const trigger = screen.getByTestId('nav-user-trigger')
      expect(trigger).toBeInTheDocument()
      expect(trigger.tagName.toLowerCase()).toBe('button')
    })
  })

  describe('Organization initials generation', () => {
    it('generates single letter for single word org name', () => {
      render(
        <NavUser
          {...defaultProps}
          organization={{
            ...defaultProps.organization,
            name: 'Acme',
          }}
        />
      )

      const fallback = screen.getByTestId('nav-user-avatar-fallback')
      expect(fallback).toHaveTextContent('A')
    })

    it('generates two letters for multi-word org name', () => {
      render(
        <NavUser
          {...defaultProps}
          organization={{
            ...defaultProps.organization,
            name: 'Acme Corporation',
          }}
        />
      )

      const fallback = screen.getByTestId('nav-user-avatar-fallback')
      expect(fallback).toHaveTextContent('AC')
    })

    it('handles org names with extra whitespace', () => {
      render(
        <NavUser
          {...defaultProps}
          organization={{
            ...defaultProps.organization,
            name: '  Spaced   Out   ',
          }}
        />
      )

      const fallback = screen.getByTestId('nav-user-avatar-fallback')
      expect(fallback).toHaveTextContent('SO')
    })
  })

  describe('Pricing model display', () => {
    it('shows pricing model name when livemode PM is provided', () => {
      render(
        <NavUser
          {...defaultProps}
          pricingModel={{
            id: 'pm-1',
            name: 'My Live PM',
            livemode: true,
          }}
        />
      )

      expect(screen.getByTestId('nav-user-org')).toHaveTextContent(
        'My Live PM'
      )
    })

    it('shows pricing model name when testmode PM is provided', () => {
      render(
        <NavUser
          {...defaultProps}
          pricingModel={{
            id: 'pm-test',
            name: 'My Test PM',
            livemode: false,
          }}
        />
      )

      expect(screen.getByTestId('nav-user-org')).toHaveTextContent(
        'My Test PM'
      )
    })

    it('shows fallback text when pricingModel is undefined', () => {
      render(<NavUser {...defaultProps} pricingModel={undefined} />)

      expect(screen.getByTestId('nav-user-org')).toHaveTextContent(
        'No pricing model'
      )
    })
  })

  describe('Modal state initialization', () => {
    it('renders CreatePricingModelModal with isOpen=false initially', () => {
      render(<NavUser {...defaultProps} />)

      const modal = screen.getByTestId('create-pm-modal')
      expect(modal).toHaveAttribute('data-open', 'false')
    })

    it('renders CreateOrganizationModal with isOpen=false initially', () => {
      render(<NavUser {...defaultProps} />)

      const modal = screen.getByTestId('create-org-modal')
      expect(modal).toHaveAttribute('data-open', 'false')
    })
  })
})
