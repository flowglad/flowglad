'use client'
import {
  Settings,
  Gauge,
  Store,
  Users,
  CircleDollarSign,
} from 'lucide-react'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
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
import { FallbackSkeleton } from '../ion/Skeleton'
import { FeatureFlag } from '@/types'

export const SideNavigation = () => {
  const pathname = usePathname()
  const selectedPath = pathname
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
    <div className="bg-nav h-full w-fit max-w-[240px] min-w-[240px] flex flex-col gap-3 border-r border-container justify-between">
      <div className="flex-1 flex flex-col">
        <div className="w-full flex items-center gap-2.5">
          <div className="flex-1 w-full flex items-center py-3 border-b border-container">
            <div className="w-[225px] flex items-center gap-3 p-3 rounded-radius-sm">
              {maybeLogo}
              <div className="flex-1 w-full flex flex-col justify-center gap-0.5">
                <div className="text-sm font-semibold text-foreground w-full pr-12 truncate">
                  {organization?.name}
                </div>
                <div className="text-xs font-medium text-subtle w-full">
                  {organization?.tagline}
                </div>
              </div>
            </div>
          </div>
        </div>
        <NavigationMenu className="pt-3">
          <NavigationMenuList className="w-full flex flex-col gap-1 px-3">
            <OnboardingNavigationSection />
            <StandaloneNavigationItem
              title="Dashboard"
              href="/dashboard"
              icon={<Gauge size={16} />}
              basePath="/dashboard"
            />
            <StandaloneNavigationItem
              title="Customers"
              href="/customers"
              icon={<Users size={16} />}
              basePath="/customers"
            />
            <ParentChildNavigationItem
              parentLabel="Store"
              parentLeadingIcon={<Store size={16} />}
              childItems={storeChildItems}
              basePath="/store"
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
            />
            <NavigationMenuItem>
              <NavigationMenuLink
                iconLeading={<Settings size={14} />}
                className="w-full"
                selected={selectedPath.startsWith('settings')}
                href="/settings"
              >
                Settings
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <FallbackSkeleton
          showSkeleton={initialFocusedMembershipLoading}
          className="w-full h-6"
        >
          <Switch
            label="Test Mode"
            checked={!livemode}
            onCheckedChange={async () => {
              await toggleTestMode.mutateAsync({
                livemode: !Boolean(livemode),
              })
            }}
            disabled={
              toggleTestMode.isPending || focusedMembership.isPending
            }
            className={'data-[state=checked]:!bg-orange-primary-500'}
            thumbClassName={'data-[state=checked]:!bg-white'}
            labelClassName={
              'text-sm font-medium text-foreground data-[state=checked]:!text-orange-primary-500'
            }
          />
        </FallbackSkeleton>
        <div className="flex-0 w-full flex items-center">
          <FallbackSkeleton
            showSkeleton={!user}
            // We don't need h-12 here anymore since the component handles its own height
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
      </div>
    </div>
  )
}
