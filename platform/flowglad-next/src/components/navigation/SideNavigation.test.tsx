/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessOnboardingStatus } from '@/types'
import type { NavUserProps } from './NavUser'

// Types for mock components
type MockChildrenProps = { children?: ReactNode }
type MockClassNameProps = MockChildrenProps & { className?: string }
type MockSidebarMenuButtonProps = MockChildrenProps & {
  onClick?: () => void
  'data-testid'?: string
}
type MockNavStandaloneItem = { title: string; url: string }

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
  useSession: () => ({ data: mockSession, isPending: false }),
  signOut: () => mockSignOut(),
}))

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
      banners: {
        getDismissedIds: {
          cancel: vi.fn(),
          getData: vi.fn(() => []),
          setData: vi.fn(),
          invalidate: vi.fn(),
        },
      },
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
    banners: {
      getDismissedIds: {
        useQuery: () => ({
          data: [],
          isLoading: false,
        }),
      },
      dismissAll: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const mockOrganization = {
  id: 'org-1',
  name: 'Test Organization',
  logoURL: null as string | null,
  onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
}

vi.mock('@/contexts/authContext', () => ({
  useAuthContext: () => ({ organization: mockOrganization }),
}))

const mockToggleSidebar = vi.fn()
vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({
    state: 'expanded',
    toggleSidebar: mockToggleSidebar,
  }),
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
    'data-testid': dataTestId,
  }: MockSidebarMenuButtonProps) => (
    <button onClick={onClick} data-testid={dataTestId}>
      {children}
    </button>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}))

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

vi.mock('./NavUser', () => ({
  NavUser: ({ user, organization, onSignOut }: NavUserProps) => (
    <div data-testid="nav-user">
      <span data-testid="nav-user-name">{user.name}</span>
      <span data-testid="nav-user-org-name">{organization.name}</span>
      <button data-testid="nav-user-signout" onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  ),
}))

vi.mock('./SidebarBannerCarousel', () => ({
  SidebarBannerCarousel: () => null,
}))

import { SideNavigation } from './SideNavigation'

describe('SideNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call toggleSidebar when logo button is clicked', () => {
    render(<SideNavigation />)

    fireEvent.click(screen.getByTestId('sidebar-logo-button'))

    expect(mockToggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('should toggle secondary nav items when More/Less is clicked', () => {
    render(<SideNavigation />)

    // Initially secondary items hidden
    expect(
      screen.queryByTestId('nav-item-subscriptions')
    ).not.toBeInTheDocument()

    // Click More to expand
    fireEvent.click(screen.getByTestId('more-less-toggle'))
    expect(
      screen.getByTestId('nav-item-subscriptions')
    ).toBeInTheDocument()

    // Click Less to collapse
    fireEvent.click(screen.getByTestId('more-less-toggle'))
    expect(
      screen.queryByTestId('nav-item-subscriptions')
    ).not.toBeInTheDocument()
  })

  it('should pass user and organization data to NavUser', () => {
    render(<SideNavigation />)

    expect(screen.getByTestId('nav-user-name')).toHaveTextContent(
      'Test User'
    )
    expect(screen.getByTestId('nav-user-org-name')).toHaveTextContent(
      'Test Organization'
    )
  })

  it('should call signOut when NavUser triggers sign out', () => {
    render(<SideNavigation />)

    fireEvent.click(screen.getByTestId('nav-user-signout'))

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})
