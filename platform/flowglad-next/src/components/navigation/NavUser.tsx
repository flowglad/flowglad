'use client'

import { Check, Loader2, Plus } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import {
  BookOpen,
  ChevronsUpDown,
  ExternalLink,
  FinishSetupIcon,
  Flag,
  LogOut,
  RiDiscordFill,
  SettingsIcon,
  Shuffle,
} from '@/components/icons/navigation'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSidebar } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { useOrganizationList } from '@/hooks/useOrganizationList'
import { cn } from '@/lib/utils'
import { BusinessOnboardingStatus } from '@/types'
import CreateOrganizationModal from '../forms/CreateOrganizationModal'

export type NavUserProps = {
  user: {
    name: string
    email: string
    image?: string | null
  }
  organization: {
    id: string
    name: string
    onboardingStatus: BusinessOnboardingStatus
  }
  onSignOut: () => void
  onTestModeToggle: (enabled: boolean) => void
  testModeEnabled: boolean
}

/**
 * Generates initials from a user's name.
 * Returns the first letter of the first name, optionally combined with
 * the first letter of the last name.
 */
const getUserInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return `${parts[0][0]?.toUpperCase() ?? ''}${parts[parts.length - 1][0]?.toUpperCase() ?? ''}`
}

export const NavUser: React.FC<NavUserProps> = ({
  user,
  organization,
  onSignOut,
  onTestModeToggle,
  testModeEnabled,
}) => {
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'
  const initials = getUserInitials(user.name)
  const showFinishSetup =
    organization.onboardingStatus !==
    BusinessOnboardingStatus.FullyOnboarded

  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] =
    useState(false)
  const {
    organizations,
    currentOrganizationId,
    isSwitching,
    switchOrganization,
  } = useOrganizationList()

  const handleSwitchOrganization = async (orgId: string) => {
    await switchOrganization(orgId)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-[6px] p-2 text-left transition-colors',
              'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isCollapsed
                ? 'justify-center px-[7px] py-1.5'
                : 'border border-border hover:border-muted-foreground'
            )}
            data-testid="nav-user-trigger"
          >
            <Avatar className="h-8 w-8 shrink-0">
              {user.image && (
                <AvatarImage
                  src={user.image}
                  alt={user.name}
                  data-testid="nav-user-avatar-image"
                />
              )}
              <AvatarFallback
                className="bg-primary/10 text-primary text-xs font-semibold"
                data-testid="nav-user-avatar-fallback"
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate text-sm font-medium text-foreground"
                    data-testid="nav-user-name"
                  >
                    {user.name}
                  </span>
                  <span
                    className="truncate text-xs text-muted-foreground"
                    data-testid="nav-user-org"
                  >
                    {organization.name}
                  </span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
          align="start"
          side="top"
          sideOffset={8}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link
                href="/settings"
                className="flex items-center gap-2"
                data-testid="nav-user-settings"
              >
                <SettingsIcon className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="flex items-center gap-2"
                data-testid="nav-user-change-org"
                disabled={isSwitching}
              >
                {isSwitching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shuffle className="h-4 w-4" />
                )}
                <span>Change Org</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  className="w-56"
                  data-testid="nav-user-org-submenu"
                >
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={`nav-user-org-${org.id}`}
                      onSelect={() =>
                        handleSwitchOrganization(org.id)
                      }
                    >
                      {org.logoURL ? (
                        <Image
                          className="rounded-full object-cover h-4 w-4 bg-white"
                          alt={org.name}
                          src={org.logoURL}
                          width={16}
                          height={16}
                        />
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-muted-foreground/20" />
                      )}
                      <span className="truncate flex-1">
                        {org.name}
                      </span>
                      <Check
                        className={cn(
                          'h-4 w-4 ml-auto',
                          currentOrganizationId === org.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer"
                    data-testid="nav-user-create-org"
                    onSelect={() => setIsCreateOrgModalOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create New Organization</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            {showFinishSetup && (
              <DropdownMenuItem asChild>
                <Link
                  href="/onboarding"
                  className="flex items-center gap-2"
                  data-testid="nav-user-finish-setup"
                >
                  <FinishSetupIcon
                    className="h-4 w-4"
                    color="orange"
                  />
                  <span>Finish Setup</span>
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <a
                href="https://docs.flowglad.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
                data-testid="nav-user-documentation"
              >
                <BookOpen className="h-4 w-4" />
                <span className="flex-1">Documentation</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href="https://app.flowglad.com/invite-discord"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
                data-testid="nav-user-discord"
              >
                <RiDiscordFill className="h-4 w-4" />
                <span className="flex-1">Discord</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
            }}
            className="flex items-center justify-between"
            data-testid="nav-user-test-mode"
          >
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4" />
              <span>Test Mode</span>
            </div>
            <Switch
              checked={testModeEnabled}
              onCheckedChange={onTestModeToggle}
              aria-label="Toggle test mode"
              data-testid="nav-user-test-mode-switch"
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onSignOut}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
            data-testid="nav-user-logout"
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationModal
        isOpen={isCreateOrgModalOpen}
        setIsOpen={setIsCreateOrgModalOpen}
      />
    </>
  )
}
