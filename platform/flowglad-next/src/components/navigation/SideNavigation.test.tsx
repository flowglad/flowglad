import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessOnboardingStatus } from '@/types'
import type { NavUserProps } from './NavUser'

// Types for mock components
type MockChildrenProps = {
  children?: ReactNode
}

type MockClassNameProps = MockChildrenProps & {
  className?: string
}

type MockSidebarMenuButtonProps = MockChildrenProps & {
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
}

type MockImageProps = {
  src: string
  alt: string
  className?: string
  'data-testid'?: string
}

type MockNavStandaloneItem = {
  title: string
  url: string
}

// Mock session data
const mockSession = {
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    image: 'https://example.com/avatar.jpg',
  },
}

const mockSignOut = vi.fn()
vi.mock('@/utils/authClient', () => ({
  useSession: () => ({
    data: mockSession,
    isPending: false,
  }),
  signOut: () => mockSignOut(),
}))

// Mock trpc
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    utils: {
      toggleTestMode: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      invalidate: vi.fn(),
    }),
    organizations: {
      getFocusedMembership: {
        useQuery: () => ({
          data: { membership: { livemode: true } },
          isPending: false,
          refetch: vi.fn(),
        }),
      },
    },
  },
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Mock authContext
const mockOrganization = {
  id: 'org-1',
  name: 'Test Organization',
  logoURL: null as string | null,
  onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
}

vi.mock('@/contexts/authContext', () => ({
  useAuthContext: () => ({
    organization: mockOrganization,
  }),
}))

// Mock useSidebar
const mockToggleSidebar = vi.fn()
const mockUseSidebar = vi.fn()
vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => mockUseSidebar(),
  SidebarHeader: ({ children, className }: MockClassNameProps) => (
    <div data-testid="sidebar-header" className={className}>
      {children}
    </div>
  ),
  SidebarContent: ({ children, className }: MockClassNameProps) => (
    <div data-testid="sidebar-content" className={className}>
      {children}
    </div>
  ),
  SidebarFooter: ({ children, className }: MockClassNameProps) => (
    <div data-testid="sidebar-footer" className={className}>
      {children}
    </div>
  ),
  SidebarGroup: ({ children }: MockChildrenProps) => (
    <div>{children}</div>
  ),
  SidebarMenu: ({ children }: MockChildrenProps) => (
    <ul>{children}</ul>
  ),
  SidebarMenuItem: ({ children }: MockChildrenProps) => (
    <li>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    onClick,
    disabled,
    tooltip,
  }: MockSidebarMenuButtonProps) => (
    <button onClick={onClick} disabled={disabled} title={tooltip}>
      {children}
    </button>
  ),
}))

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    className,
    'data-testid': dataTestId,
  }: MockImageProps) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      data-testid={dataTestId}
    />
  ),
}))

// Mock NavStandalone to render all items for testing
vi.mock('./NavStandalone', () => ({
  NavStandalone: ({ items }: { items: MockNavStandaloneItem[] }) => (
    <div data-testid="nav-standalone">
      {items.map((item) => (
        <a
          key={item.title}
          href={item.url}
          data-testid={`nav-item-${item.title.toLowerCase().replace(' ', '-')}`}
        >
          {item.title}
        </a>
      ))}
    </div>
  ),
}))

// Mock NavUser component
const mockOnTestModeToggle = vi.fn()
vi.mock('./NavUser', () => ({
  NavUser: ({
    user,
    organization,
    onSignOut,
    testModeEnabled,
  }: NavUserProps) => (
    <div data-testid="nav-user">
      <span data-testid="nav-user-name">{user.name}</span>
      <span data-testid="nav-user-email">{user.email}</span>
      <span data-testid="nav-user-org-name">{organization.name}</span>
      {user.image && (
        <span data-testid="nav-user-image">{user.image}</span>
      )}
      <button data-testid="nav-user-signout" onClick={onSignOut}>
        Sign Out
      </button>
      <span data-testid="nav-user-test-mode">
        {testModeEnabled ? 'test' : 'live'}
      </span>
    </div>
  ),
}))

// Must import after mocks
import { SideNavigation } from './SideNavigation'

describe('SideNavigation - Logo Section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSidebar.mockReturnValue({
      state: 'expanded',
      toggleSidebar: mockToggleSidebar,
    })
    mockOrganization.logoURL = null
  })

  describe('logo display', () => {
    it('should show Flowglad logo when organization has no logoURL', () => {
      mockOrganization.logoURL = null
      render(<SideNavigation />)

      const flowgladLogo = screen.getByTestId('sidebar-flowglad-logo')
      expect(flowgladLogo).toBeInTheDocument()
      // FlowgladLogomark is an SVG component, not an image
      expect(flowgladLogo.tagName.toLowerCase()).toBe('svg')
    })

    it('should show organization logo when logoURL exists', () => {
      mockOrganization.logoURL = 'https://example.com/org-logo.png'
      render(<SideNavigation />)

      const orgLogo = screen.getByTestId('sidebar-org-logo')
      expect(orgLogo).toBeInTheDocument()
      expect(orgLogo).toHaveAttribute(
        'src',
        'https://example.com/org-logo.png'
      )
      expect(orgLogo).toHaveAttribute('alt', 'Test Organization')
    })
  })

  describe('hover behavior', () => {
    it('should show collapse icon on hover when expanded', () => {
      mockUseSidebar.mockReturnValue({
        state: 'expanded',
        toggleSidebar: mockToggleSidebar,
      })
      render(<SideNavigation />)

      const logoButton = screen.getByTestId('sidebar-logo-button')
      const collapseIconContainer = screen.getByTestId(
        'sidebar-collapse-icon'
      )

      // Initially icon should be hidden (opacity-0)
      expect(collapseIconContainer).toHaveClass('opacity-0')

      // On hover, icon should become visible (opacity-100)
      fireEvent.mouseEnter(logoButton)
      expect(collapseIconContainer).toHaveClass('opacity-100')

      // On mouse leave, icon should hide again
      fireEvent.mouseLeave(logoButton)
      expect(collapseIconContainer).toHaveClass('opacity-0')
    })

    it('should show expand icon on hover when collapsed', () => {
      mockUseSidebar.mockReturnValue({
        state: 'collapsed',
        toggleSidebar: mockToggleSidebar,
      })
      render(<SideNavigation />)

      const logoButton = screen.getByTestId('sidebar-logo-button')
      const collapseIconContainer = screen.getByTestId(
        'sidebar-collapse-icon'
      )

      // Hover should show the icon
      fireEvent.mouseEnter(logoButton)
      expect(collapseIconContainer).toHaveClass('opacity-100')
    })

    it('should hide logo when hovered', () => {
      mockOrganization.logoURL = null
      render(<SideNavigation />)

      const logoButton = screen.getByTestId('sidebar-logo-button')
      const logo = screen.getByTestId('sidebar-flowglad-logo')

      // Initially logo should be visible
      expect(logo).not.toHaveClass('opacity-0')

      // On hover, logo should be hidden
      fireEvent.mouseEnter(logoButton)
      expect(logo).toHaveClass('opacity-0')

      // On mouse leave, logo should return to visible
      fireEvent.mouseLeave(logoButton)
      expect(logo).not.toHaveClass('opacity-0')
    })
  })

  describe('click behavior', () => {
    it('should call toggleSidebar when logo button is clicked (expanded)', () => {
      mockUseSidebar.mockReturnValue({
        state: 'expanded',
        toggleSidebar: mockToggleSidebar,
      })
      render(<SideNavigation />)

      const logoButton = screen.getByTestId('sidebar-logo-button')
      fireEvent.click(logoButton)

      expect(mockToggleSidebar).toHaveBeenCalledTimes(1)
    })

    it('should call toggleSidebar when logo button is clicked (collapsed)', () => {
      mockUseSidebar.mockReturnValue({
        state: 'collapsed',
        toggleSidebar: mockToggleSidebar,
      })
      render(<SideNavigation />)

      const logoButton = screen.getByTestId('sidebar-logo-button')
      fireEvent.click(logoButton)

      expect(mockToggleSidebar).toHaveBeenCalledTimes(1)
    })

    it('should have correct aria-label when expanded', () => {
      mockUseSidebar.mockReturnValue({
        state: 'expanded',
        toggleSidebar: mockToggleSidebar,
      })
      render(<SideNavigation />)

      const logoButton = screen.getByTestId('sidebar-logo-button')
      expect(logoButton).toHaveAttribute(
        'aria-label',
        'Collapse sidebar'
      )
    })

    it('should have correct aria-label when collapsed', () => {
      mockUseSidebar.mockReturnValue({
        state: 'collapsed',
        toggleSidebar: mockToggleSidebar,
      })
      render(<SideNavigation />)

      const logoButton = screen.getByTestId('sidebar-logo-button')
      expect(logoButton).toHaveAttribute(
        'aria-label',
        'Expand sidebar'
      )
    })
  })

  describe('header structure', () => {
    it('should not render OrganizationSwitcher in header', () => {
      render(<SideNavigation />)

      // OrganizationSwitcher would have a combobox role or specific testid
      // The absence of the OrganizationSwitcher import means it's not rendered
      expect(
        screen.queryByRole('combobox', {
          name: /switch organization/i,
        })
      ).not.toBeInTheDocument()
    })

    it('should not render organization name and tagline in header', () => {
      render(<SideNavigation />)

      // The organization name should not be visible in header (only in NavUser)
      const header = screen.getByTestId('sidebar-header')
      expect(header).not.toHaveTextContent('Test Organization')
    })
  })
})

describe('SideNavigation - More/Less Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSidebar.mockReturnValue({
      state: 'expanded',
      toggleSidebar: mockToggleSidebar,
    })
    mockOrganization.logoURL = null
  })

  describe('default state', () => {
    it('should show primary nav items and More button', () => {
      render(<SideNavigation />)

      // Primary items should be visible
      expect(
        screen.getByTestId('nav-item-dashboard')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('nav-item-pricing')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('nav-item-customers')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('nav-item-payments')
      ).toBeInTheDocument()

      // More button should be visible with "More" text
      const moreButton = screen.getByTestId('more-less-toggle')
      expect(moreButton).toBeInTheDocument()
      expect(moreButton).toHaveTextContent('More')

      // Secondary items should NOT be visible
      expect(
        screen.queryByTestId('nav-item-subscriptions')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('nav-item-products')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('nav-item-discounts')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('nav-item-purchases')
      ).not.toBeInTheDocument()
    })
  })

  describe('expanded state', () => {
    it('should show secondary items when More is clicked', () => {
      render(<SideNavigation />)

      // Click More button
      const moreButton = screen.getByTestId('more-less-toggle')
      fireEvent.click(moreButton)

      // Secondary items should now be visible
      expect(
        screen.getByTestId('nav-item-subscriptions')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('nav-item-discounts')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('nav-item-purchases')
      ).toBeInTheDocument()
    })

    it('should change More to Less with X icon when expanded', () => {
      render(<SideNavigation />)

      // Initially should say "More"
      const moreButton = screen.getByTestId('more-less-toggle')
      expect(moreButton).toHaveTextContent('More')

      // Click to expand
      fireEvent.click(moreButton)

      // Should now say "Less"
      expect(moreButton).toHaveTextContent('Less')
    })

    it('should collapse back when Less is clicked', () => {
      render(<SideNavigation />)

      const toggleButton = screen.getByTestId('more-less-toggle')

      // Expand
      fireEvent.click(toggleButton)
      expect(
        screen.getByTestId('nav-item-subscriptions')
      ).toBeInTheDocument()

      // Collapse
      fireEvent.click(toggleButton)
      expect(
        screen.queryByTestId('nav-item-subscriptions')
      ).not.toBeInTheDocument()
      expect(toggleButton).toHaveTextContent('More')
    })
  })
})

describe('SideNavigation - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSidebar.mockReturnValue({
      state: 'expanded',
      toggleSidebar: mockToggleSidebar,
    })
    mockOrganization.logoURL = null
    mockOrganization.onboardingStatus =
      BusinessOnboardingStatus.FullyOnboarded
  })

  describe('footer structure', () => {
    it('should render NavUser in footer', () => {
      render(<SideNavigation />)

      const navUser = screen.getByTestId('nav-user')
      expect(navUser).toBeInTheDocument()
    })

    it('should render test mode toggle in footer', () => {
      render(<SideNavigation />)

      // Test mode toggle should be visible
      expect(screen.getByText('Test Mode')).toBeInTheDocument()
    })

    it('should NOT render Settings in content area as standalone nav item', () => {
      render(<SideNavigation />)

      // Settings is now in NavUser dropdown, not a standalone nav item
      expect(
        screen.queryByTestId('nav-item-settings')
      ).not.toBeInTheDocument()
    })
  })

  describe('data flow', () => {
    it('should pass user data from session to NavUser', () => {
      render(<SideNavigation />)

      expect(screen.getByTestId('nav-user-name')).toHaveTextContent(
        'Test User'
      )
      expect(screen.getByTestId('nav-user-email')).toHaveTextContent(
        'test@example.com'
      )
      expect(screen.getByTestId('nav-user-image')).toHaveTextContent(
        'https://example.com/avatar.jpg'
      )
    })

    it('should pass organization from authContext to NavUser', () => {
      mockOrganization.name = 'Acme Corp'
      render(<SideNavigation />)

      expect(
        screen.getByTestId('nav-user-org-name')
      ).toHaveTextContent('Acme Corp')
    })

    it('should call signOut when NavUser triggers sign out', () => {
      render(<SideNavigation />)

      const signOutButton = screen.getByTestId('nav-user-signout')
      fireEvent.click(signOutButton)

      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })

    it('should pass correct test mode state to NavUser (livemode=true means testModeEnabled=false)', () => {
      render(<SideNavigation />)

      // livemode is true in mock, so testModeEnabled should be false
      expect(
        screen.getByTestId('nav-user-test-mode')
      ).toHaveTextContent('live')
    })
  })
})
