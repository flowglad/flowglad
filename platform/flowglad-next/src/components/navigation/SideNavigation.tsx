'use client'
import {
  Settings,
  Gauge,
  Store,
  Users,
  CircleDollarSign,
  PanelLeft,
  BookOpen,
} from 'lucide-react'
import {
  NavigationMenu,
  NavigationMenuList,
} from '@/components/ion/Navigation'
import { UserButton } from '@stackframe/stack'
import { useAuthContext } from '@/contexts/authContext'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import OnboardingNavigationSection from './OnboardingNavigationSection'
import ParentChildNavigationItem from './ParentChildNavigationItem'
import StandaloneNavigationItem from './StandaloneNavigationItem'
import Switch from '../ion/Switch'
import { trpc } from '@/app/_trpc/client'
import { cn } from '@/utils/core'
import { useEffect, useState } from 'react'
import { FallbackSkeleton } from '@/components/ui/skeleton'
import { FeatureFlag } from '@/types'
import { RiDiscordFill } from '@remixicon/react'

export const SideNavigation = () => {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { user, organization } = useAuthContext()
  const toggleTestMode = trpc.utils.toggleTestMode.useMutation({
    onSuccess: async () => {
      await invalidateTRPC()
      await focusedMembership.refetch()
      router.refresh()
    },
  })
  const { invalidate: invalidateTRPC } = trpc.useUtils()
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const [
    initialFocusedMembershipLoading,
    setInitialFocusedMembershipLoading,
  ] = useState(true)
  const focusedMembershipData = focusedMembership.data
  useEffect(() => {
    if (focusedMembershipData) {
      setInitialFocusedMembershipLoading(false)
    }
  }, [focusedMembershipData])
  const livemode = focusedMembership.data?.membership.livemode
  const router = useRouter()
  const maybeLogo = organization?.logoURL ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <Image
      className="rounded-full object-cover h-10 w-10 bg-white"
      alt={organization?.name}
      src={organization?.logoURL}
      width={40}
      height={40}
    />
  ) : (
    <></>
  )
  const storeChildItems = [
    {
      label: 'Catalogs',
      href: '/store/catalogs',
    },
    {
      label: 'Products',
      href: '/store/products',
    },
    {
      label: 'Discounts',
      href: '/store/discounts',
    },
    {
      label: 'Purchases',
      href: '/store/purchases',
    },
  ]
  if (
    organization &&
    organization.featureFlags?.[FeatureFlag.Usage]
  ) {
    storeChildItems.push({
      label: 'Usage Meters',
      href: '/store/usage-meters',
    })
  }
  return (
    <div
      className={cn(
        'bg-nav h-full flex flex-col gap-3 border-r border-container justify-between',
        'transition-[width] duration-300 ease-in-out',
        isCollapsed ? 'w-[64px]' : 'w-[240px]'
      )}
    >
      <div className="flex-1 flex flex-col min-h-0">
        <div
          className={cn(
            'w-full flex items-center border-b border-stroke-subtle py-3',
            isCollapsed
              ? 'justify-center px-3'
              : 'justify-between px-3 gap-2.5'
          )}
        >
          <div
            className={cn(
              'flex items-center',
              'overflow-hidden',
              isCollapsed
                ? 'max-w-0 opacity-0'
                : 'max-w-md opacity-100'
            )}
          >
            <div className="flex items-center gap-3 rounded-radius-sm">
              {maybeLogo}
              <div className="flex flex-col justify-center gap-0.5 whitespace-nowrap">
                <div className="text-sm font-semibold text-foreground truncate">
                  {organization?.name}
                </div>
                <div className="text-xs font-medium text-subtle truncate">
                  {organization?.tagline}
                </div>
              </div>
            </div>
          </div>
          <button
            className={cn(
              'flex-shrink-0 flex items-center py-3 px-3 text-subtle'
            )}
            onClick={() => {
              setIsCollapsed(!isCollapsed)
            }}
          >
            <PanelLeft size={16} />
          </button>
        </div>
        <NavigationMenu className="pt-3 flex-1 overflow-y-auto flex flex-col">
          <NavigationMenuList
            className={cn(
              'flex flex-col gap-1',
              isCollapsed ? 'px-0 items-center' : 'px-3 w-full'
            )}
          >
            <OnboardingNavigationSection isCollapsed={isCollapsed} />
            <StandaloneNavigationItem
              title="Dashboard"
              href="/dashboard"
              icon={<Gauge size={16} />}
              basePath="/dashboard"
              isCollapsed={isCollapsed}
            />
            <StandaloneNavigationItem
              title="Customers"
              href="/customers"
              icon={<Users size={16} />}
              basePath="/customers"
              isCollapsed={isCollapsed}
            />
            <ParentChildNavigationItem
              parentLabel="Store"
              parentLeadingIcon={<Store size={16} />}
              childItems={storeChildItems}
              basePath="/store"
              isCollapsed={isCollapsed}
              onClickParent={() => {
                setIsCollapsed(false)
              }}
            />
            <ParentChildNavigationItem
              parentLabel="Finance"
              parentLeadingIcon={<CircleDollarSign size={16} />}
              childItems={[
                {
                  label: 'Payments',
                  href: '/finance/payments',
                },
                {
                  label: 'Subscriptions',
                  href: '/finance/subscriptions',
                },
                {
                  label: 'Invoices',
                  href: '/finance/invoices',
                },
              ]}
              basePath="/finance"
              isCollapsed={isCollapsed}
              onClickParent={() => {
                setIsCollapsed(false)
              }}
            />
            <StandaloneNavigationItem
              title="Settings"
              href="/settings"
              icon={<Settings size={16} />}
              basePath="/settings"
              isCollapsed={isCollapsed}
            />
          </NavigationMenuList>
          <div className="flex-1" />
        </NavigationMenu>
      </div>

      <div
        className={cn(
          'flex flex-col gap-3 p-3 overflow-hidden transition-all duration-300 ease-in-out',
          isCollapsed
            ? 'opacity-0 max-h-0 pointer-events-none'
            : 'opacity-100 max-h-[300px]'
        )}
      >
        <div className="flex flex-col gap-1">
          <StandaloneNavigationItem
            title="Discord"
            href="https://app.flowglad.com/invite-discord"
            icon={<RiDiscordFill size={16} />}
            basePath="https://app.flowglad.com/invite-discord"
            isCollapsed={isCollapsed}
          />
          <StandaloneNavigationItem
            title="Documentation"
            href="https://docs.flowglad.com"
            icon={<BookOpen size={16} />}
            basePath="https://docs.flowglad.com"
            isCollapsed={isCollapsed}
          />
        </div>
        <div className="flex-0 w-full flex items-center border-b border-stroke-subtle pb-6 pl-2">
          <FallbackSkeleton
            showSkeleton={!user}
            className="w-full h-12"
          >
            <div className="flex h-full items-center gap-3">
              <UserButton />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  {user?.display_name}
                </span>
                <span
                  className="text-xs text-subtle truncate max-w-[16ch]"
                  title={user?.primary_email ?? ''}
                >
                  {user?.primary_email}
                </span>
              </div>
            </div>
          </FallbackSkeleton>
        </div>
        <div className="flex flex-row justify-between pt-4 pl-2">
          <FallbackSkeleton
            showSkeleton={initialFocusedMembershipLoading}
            className="w-full h-6 justify-between flex flex-row"
          >
            <span className="text-sm font-medium text-foreground">
              Test Mode
            </span>
            <Switch
              label=""
              checked={!livemode}
              onCheckedChange={async () => {
                await toggleTestMode.mutateAsync({
                  livemode: !Boolean(livemode),
                })
              }}
              disabled={
                toggleTestMode.isPending ||
                focusedMembership.isPending
              }
              className={
                'data-[state=checked]:!bg-orange-primary-500'
              }
              thumbClassName={'data-[state=checked]:!bg-white'}
              labelClassName={
                'text-sm font-medium text-foreground data-[state=checked]:!text-orange-primary-500'
              }
            />
          </FallbackSkeleton>
        </div>
      </div>
    </div>
  )
}
