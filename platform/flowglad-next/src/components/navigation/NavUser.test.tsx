import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { BusinessOnboardingStatus } from '@/types'
import { NavUser, type NavUserProps } from './NavUser'

// Mock trpc client
vi.mock('@/app/_trpc/client', () => ({
  trpc: {
    organizations: {
      create: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
    },
    useContext: () => ({
      organizations: {
        getOrganizations: {
          invalidate: vi.fn(),
        },
        getFocusedMembership: {
          invalidate: vi.fn(),
        },
      },
    }),
  },
}))

// Mock authContext for CreateOrganizationModal
vi.mock('@/contexts/authContext', () => ({
  useAuthContext: () => ({
    setOrganization: vi.fn(),
  }),
}))

// Mock Next.js router for CreateOrganizationModal
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Mock useOrganizationList hook
const mockSwitchOrganization = vi.fn()
const mockUseOrganizationList = vi.fn()
vi.mock('@/hooks/useOrganizationList', () => ({
  useOrganizationList: () => mockUseOrganizationList(),
}))

const defaultProps: NavUserProps = {
  user: {
    name: 'John Doe',
    email: 'john@example.com',
    image: 'https://example.com/avatar.jpg',
  },
  organization: {
    id: 'org-1',
    name: 'Acme Corp',
    onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
  },
  onSignOut: vi.fn(),
  onTestModeToggle: vi.fn(),
  testModeEnabled: false,
}

type RenderOptions = {
  props?: Partial<NavUserProps>
  sidebarOpen?: boolean
}

const renderNavUser = ({
  props = {},
  sidebarOpen = true,
}: RenderOptions = {}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SidebarProvider open={sidebarOpen}>{children}</SidebarProvider>
  )
  return render(<NavUser {...defaultProps} {...props} />, {
    wrapper: Wrapper,
  })
}

const defaultOrganizations = [
  { id: 'org-1', name: 'Acme Corp', logoURL: null },
  { id: 'org-2', name: 'Beta Inc', logoURL: null },
]

describe('NavUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseOrganizationList.mockReturnValue({
      organizations: defaultOrganizations,
      currentOrganizationId: 'org-1',
      isLoading: false,
      isSwitching: false,
      switchOrganization: mockSwitchOrganization,
    })
  })

  it('should render and open dropdown menu', async () => {
    renderNavUser()

    const trigger = screen.getByTestId('nav-user-trigger')
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(
        screen.getByTestId('nav-user-settings')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('nav-user-logout')
      ).toBeInTheDocument()
    })
  })

  it('should call onSignOut when Log out is clicked', async () => {
    const mockOnSignOut = vi.fn()
    renderNavUser({ props: { onSignOut: mockOnSignOut } })

    fireEvent.click(screen.getByTestId('nav-user-trigger'))

    await waitFor(() => {
      expect(
        screen.getByTestId('nav-user-logout')
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('nav-user-logout'))
    expect(mockOnSignOut).toHaveBeenCalled()
  })

  it('should toggle test mode when switch is clicked', async () => {
    const mockOnTestModeToggle = vi.fn()
    renderNavUser({
      props: {
        onTestModeToggle: mockOnTestModeToggle,
        testModeEnabled: false,
      },
    })

    fireEvent.click(screen.getByTestId('nav-user-trigger'))

    await waitFor(() => {
      expect(
        screen.getByTestId('nav-user-test-mode-switch')
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('nav-user-test-mode-switch'))
    expect(mockOnTestModeToggle).toHaveBeenCalledWith(true)
  })

  it('should call switchOrganization when a different org is selected', async () => {
    renderNavUser()

    fireEvent.click(screen.getByTestId('nav-user-trigger'))

    await waitFor(() => {
      expect(
        screen.getByTestId('nav-user-change-org')
      ).toBeInTheDocument()
    })

    fireEvent.mouseEnter(screen.getByTestId('nav-user-change-org'))

    await waitFor(() => {
      expect(
        screen.getByTestId('nav-user-org-org-2')
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('nav-user-org-org-2'))

    await waitFor(() => {
      expect(mockSwitchOrganization).toHaveBeenCalledWith('org-2')
    })
  })
})
