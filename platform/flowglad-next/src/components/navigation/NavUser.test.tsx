import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessOnboardingStatus } from '@/types'
import { NavUser, type NavUserProps } from './NavUser'

// Mock useSidebar hook
const mockUseSidebar = vi.fn()
vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => mockUseSidebar(),
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

const renderNavUser = (props: Partial<NavUserProps> = {}) => {
  return render(<NavUser {...defaultProps} {...props} />)
}

const defaultOrganizations = [
  {
    id: 'org-1',
    name: 'Acme Corp',
    logoURL: null,
  },
  {
    id: 'org-2',
    name: 'Beta Inc',
    logoURL: 'https://example.com/beta-logo.png',
  },
  {
    id: 'org-3',
    name: 'Gamma LLC',
    logoURL: null,
  },
]

describe('NavUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSidebar.mockReturnValue({ state: 'expanded' })
    mockUseOrganizationList.mockReturnValue({
      organizations: defaultOrganizations,
      currentOrganizationId: 'org-1',
      isLoading: false,
      isSwitching: false,
      switchOrganization: mockSwitchOrganization,
    })
  })

  describe('rendering', () => {
    it('should render avatar with image when user.image is provided', () => {
      renderNavUser()
      const avatarImage = screen.getByTestId('nav-user-avatar-image')
      expect(avatarImage).toHaveAttribute(
        'src',
        'https://example.com/avatar.jpg'
      )
    })

    it('should render fallback initials when no image provided', () => {
      renderNavUser({
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          image: null,
        },
      })
      const fallback = screen.getByTestId('nav-user-avatar-fallback')
      expect(fallback).toHaveTextContent('JD')
    })

    it('should render single initial for single name', () => {
      renderNavUser({
        user: {
          name: 'John',
          email: 'john@example.com',
          image: null,
        },
      })
      const fallback = screen.getByTestId('nav-user-avatar-fallback')
      expect(fallback).toHaveTextContent('J')
    })

    it('should show full user info when sidebar is expanded', () => {
      mockUseSidebar.mockReturnValue({ state: 'expanded' })
      renderNavUser()

      expect(screen.getByTestId('nav-user-name')).toHaveTextContent(
        'John Doe'
      )
      expect(screen.getByTestId('nav-user-org')).toHaveTextContent(
        'Acme Corp'
      )
    })

    it('should show only avatar when sidebar is collapsed', () => {
      mockUseSidebar.mockReturnValue({ state: 'collapsed' })
      renderNavUser()

      expect(
        screen.queryByTestId('nav-user-name')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('nav-user-org')
      ).not.toBeInTheDocument()
      // Avatar should still be visible
      expect(
        screen.getByTestId('nav-user-avatar-image')
      ).toBeInTheDocument()
    })
  })

  describe('dropdown menu', () => {
    it('should open dropdown when trigger is clicked', async () => {
      renderNavUser()

      const trigger = screen.getByTestId('nav-user-trigger')
      fireEvent.click(trigger)

      await waitFor(() => {
        expect(
          screen.getByTestId('nav-user-settings')
        ).toBeInTheDocument()
      })
    })

    it('should render Settings item that navigates to /settings', async () => {
      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        const settingsLink = screen.getByTestId('nav-user-settings')
        expect(settingsLink).toHaveAttribute('href', '/settings')
      })
    })

    it('should render Change Org item', async () => {
      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        expect(
          screen.getByTestId('nav-user-change-org')
        ).toBeInTheDocument()
      })
    })

    it('should render Documentation item with external link', async () => {
      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        const docLink = screen.getByTestId('nav-user-documentation')
        expect(docLink).toHaveAttribute(
          'href',
          'https://docs.flowglad.com'
        )
        expect(docLink).toHaveAttribute('target', '_blank')
      })
    })

    it('should render Discord item with external link', async () => {
      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        const discordLink = screen.getByTestId('nav-user-discord')
        expect(discordLink).toHaveAttribute(
          'href',
          'https://app.flowglad.com/invite-discord'
        )
        expect(discordLink).toHaveAttribute('target', '_blank')
      })
    })

    it('should call onSignOut when Log out is clicked', async () => {
      const mockOnSignOut = vi.fn()
      renderNavUser({ onSignOut: mockOnSignOut })

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        expect(
          screen.getByTestId('nav-user-logout')
        ).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('nav-user-logout'))

      expect(mockOnSignOut).toHaveBeenCalled()
    })

    it('should show Finish Setup when onboardingStatus is not FullyOnboarded', async () => {
      renderNavUser({
        organization: {
          id: 'org-1',
          name: 'Acme Corp',
          onboardingStatus:
            BusinessOnboardingStatus.PartiallyOnboarded,
        },
      })

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        const finishSetup = screen.getByTestId(
          'nav-user-finish-setup'
        )
        expect(finishSetup).toBeInTheDocument()
        expect(finishSetup).toHaveAttribute('href', '/onboarding')
      })
    })

    it('should hide Finish Setup when onboardingStatus is FullyOnboarded', async () => {
      renderNavUser({
        organization: {
          id: 'org-1',
          name: 'Acme Corp',
          onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
        },
      })

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        expect(
          screen.getByTestId('nav-user-settings')
        ).toBeInTheDocument()
      })

      expect(
        screen.queryByTestId('nav-user-finish-setup')
      ).not.toBeInTheDocument()
    })

    it('should toggle test mode when switch is clicked', async () => {
      const mockOnTestModeToggle = vi.fn()
      renderNavUser({
        onTestModeToggle: mockOnTestModeToggle,
        testModeEnabled: false,
      })

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        expect(
          screen.getByTestId('nav-user-test-mode-switch')
        ).toBeInTheDocument()
      })

      const switchElement = screen.getByTestId(
        'nav-user-test-mode-switch'
      )
      fireEvent.click(switchElement)

      expect(mockOnTestModeToggle).toHaveBeenCalledWith(true)
    })

    it('should show test mode switch as checked when testModeEnabled is true', async () => {
      renderNavUser({ testModeEnabled: true })

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        const switchElement = screen.getByTestId(
          'nav-user-test-mode-switch'
        )
        expect(switchElement).toHaveAttribute('data-state', 'checked')
      })
    })
  })

  describe('organization switching', () => {
    it('should render Change Org item with chevron icon', async () => {
      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        const changeOrgItem = screen.getByTestId(
          'nav-user-change-org'
        )
        expect(changeOrgItem).toBeInTheDocument()
        // ChevronRight icon is rendered by DropdownMenuSubTrigger
      })
    })

    it('should open submenu on hover of Change Org', async () => {
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
          screen.getByTestId('nav-user-org-submenu')
        ).toBeInTheDocument()
      })
    })

    it('should list all user organizations', async () => {
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
          screen.getByTestId('nav-user-org-org-1')
        ).toBeInTheDocument()
        expect(
          screen.getByTestId('nav-user-org-org-2')
        ).toBeInTheDocument()
        expect(
          screen.getByTestId('nav-user-org-org-3')
        ).toBeInTheDocument()
      })
    })

    it('should show checkmark on current organization', async () => {
      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        expect(
          screen.getByTestId('nav-user-change-org')
        ).toBeInTheDocument()
      })

      fireEvent.mouseEnter(screen.getByTestId('nav-user-change-org'))

      await waitFor(() => {
        const currentOrgItem = screen.getByTestId(
          'nav-user-org-org-1'
        )
        // Check icon inside current org item should be visible (opacity-100)
        const checkIcon =
          currentOrgItem.querySelector('svg.opacity-100')
        expect(checkIcon).toBeInTheDocument()
      })
    })

    it('should call switchOrganization when different org is selected', async () => {
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

    it('should render Create New Organization option', async () => {
      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        expect(
          screen.getByTestId('nav-user-change-org')
        ).toBeInTheDocument()
      })

      fireEvent.mouseEnter(screen.getByTestId('nav-user-change-org'))

      await waitFor(() => {
        const createOrgItem = screen.getByTestId(
          'nav-user-create-org'
        )
        expect(createOrgItem).toBeInTheDocument()
        expect(createOrgItem).toHaveTextContent(
          'Create New Organization'
        )
      })
    })

    it('should show loading spinner when switching organization', async () => {
      mockUseOrganizationList.mockReturnValue({
        organizations: defaultOrganizations,
        currentOrganizationId: 'org-1',
        isLoading: false,
        isSwitching: true,
        switchOrganization: mockSwitchOrganization,
      })

      renderNavUser()

      fireEvent.click(screen.getByTestId('nav-user-trigger'))

      await waitFor(() => {
        const changeOrgItem = screen.getByTestId(
          'nav-user-change-org'
        )
        // Should have Loader2 spinner when isSwitching is true
        const spinner = changeOrgItem.querySelector('.animate-spin')
        expect(spinner).toBeInTheDocument()
      })
    })
  })
})
