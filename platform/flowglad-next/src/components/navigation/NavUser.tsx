'use client'

import {
  Check,
  CheckCircle2,
  Circle,
  DollarSign,
  Loader2,
  Plus,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import {
  BookOpen,
  ExternalLink,
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSidebar } from '@/components/ui/sidebar'
import { useOrganizationList } from '@/hooks/useOrganizationList'
import { usePricingModelList } from '@/hooks/usePricingModelList'
import { cn } from '@/lib/utils'
import CreateOrganizationModal from '../forms/CreateOrganizationModal'
import CreatePricingModelModal from '../forms/CreatePricingModelModal'

export type NavUserProps = {
  user: {
    name: string
    email: string
    image?: string | null
  }
  organization: {
    id: string
    name: string
    logoURL?: string | null
  }
  pricingModel?: {
    id: string
    name: string
    livemode: boolean
  }
  onSignOut: () => void
}

/**
 * Generates initials from an organization's name.
 * Returns the first letter of the first word, optionally combined with
 * the first letter of the second word.
 */
const getOrgInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return `${parts[0][0]?.toUpperCase() ?? ''}${parts[1][0]?.toUpperCase() ?? ''}`
}

export const NavUser: React.FC<NavUserProps> = ({
  user,
  organization,
  pricingModel,
  onSignOut,
}) => {
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'
  const initials = getOrgInitials(organization.name)

  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] =
    useState(false)
  const [isCreatePmModalOpen, setIsCreatePmModalOpen] =
    useState(false)

  const {
    organizations,
    currentOrganizationId,
    isSwitching: isSwitchingOrg,
    switchOrganization,
  } = useOrganizationList()

  const {
    pricingModels,
    currentPricingModelId,
    isSwitching: isSwitchingPm,
    switchPricingModel,
  } = usePricingModelList()

  const handleSwitchOrganization = async (orgId: string) => {
    await switchOrganization(orgId)
  }

  const handleSwitchPricingModel = async (pmId: string) => {
    await switchPricingModel(pmId)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded p-2 text-left transition-colors shadow-realistic-sm',
              'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isCollapsed
                ? 'justify-center px-[7px] py-1.5'
                : 'border border-border px-3 py-2 hover:border-muted-foreground'
            )}
            data-testid="nav-user-trigger"
          >
            <Avatar className="h-8 w-8 shrink-0">
              {organization.logoURL && (
                <AvatarImage
                  src={organization.logoURL}
                  alt={organization.name}
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
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className="truncate text-sm font-semibold text-sidebar-accent-foreground"
                  data-testid="nav-user-name"
                >
                  {organization.name}
                </span>
                <span
                  className="truncate text-xs font-medium text-muted-foreground"
                  data-testid="nav-user-org"
                >
                  {pricingModel?.name ?? 'No pricing model'}
                </span>
              </div>
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="flex items-center gap-2"
                data-testid="nav-user-change-org"
                disabled={isSwitchingOrg}
              >
                {isSwitchingOrg ? (
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
                  <ScrollArea className="max-h-64">
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
                  </ScrollArea>
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="flex items-center gap-2"
                data-testid="nav-user-change-pricing"
                disabled={isSwitchingPm}
              >
                {isSwitchingPm ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DollarSign className="h-4 w-4" />
                )}
                <span>Change Pricing</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  className="w-64"
                  data-testid="nav-user-pricing-submenu"
                >
                  <ScrollArea className="max-h-64">
                    {pricingModels.map(({ pricingModel: pm }) => {
                      const isSelected =
                        currentPricingModelId === pm.id
                      return (
                        <DropdownMenuItem
                          key={pm.id}
                          className={cn(
                            'group flex items-center gap-2 cursor-pointer',
                            isSelected && 'bg-accent'
                          )}
                          data-testid={`nav-user-pm-${pm.id}`}
                          onSelect={() =>
                            handleSwitchPricingModel(pm.id)
                          }
                        >
                          {pm.livemode ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-jade-muted-foreground fill-jade-muted-foreground" />
                          ) : (
                            <Circle className="h-5 w-5 shrink-0 text-amber-400" />
                          )}
                          <span className="truncate flex-1">
                            {pm.name}
                          </span>
                          {pm.livemode ? (
                            <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-medium shrink-0 bg-jade-muted-foreground text-primary-foreground">
                              Live
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex items-center rounded px-1 py-0.5 text-xs font-medium shrink-0 border-[1.5px] border-amber-400 text-amber-500 bg-transparent transition-opacity',
                                isSelected
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100'
                              )}
                            >
                              Test
                            </span>
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </ScrollArea>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer"
                    data-testid="nav-user-create-pm"
                    onSelect={() => setIsCreatePmModalOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Pricing Model</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
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

      <CreatePricingModelModal
        isOpen={isCreatePmModalOpen}
        setIsOpen={setIsCreatePmModalOpen}
      />
    </>
  )
}
