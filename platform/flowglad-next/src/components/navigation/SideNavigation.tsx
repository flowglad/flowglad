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
import { UserButton } from '@clerk/nextjs'
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

export const SideNavigation = () => {
  const pathname = usePathname()
  const selectedPath = pathname
  const { user, organization } = useAuthContext()
  const toggleTestMode = trpc.utils.toggleTestMode.useMutation()
  const focusedMembership = trpc.utils.getFocusedMembership.useQuery()
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
            <ParentChildNavigationItem
              parentLabel="Store"
              parentLeadingIcon={<Store size={16} />}
              childItems={[
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
                // {
                //   label: 'Communities',
                //   href: '/catalog/communities',
                // },
              ]}
              basePath="/store"
            />
            <ParentChildNavigationItem
              parentLabel="Customers"
              parentLeadingIcon={<Users size={16} />}
              childItems={[
                {
                  label: 'Profiles',
                  href: '/customers/profiles',
                },
              ]}
              basePath="/customer"
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
              await focusedMembership.refetch()
              router.refresh()
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
              <UserButton
                appearance={{
                  layout: { shimmer: false },
                  elements: { avatarBox: 'h-12 w-12' },
                }}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  {user?.fullName}
                </span>
                <span
                  className="text-xs text-subtle truncate max-w-[16ch]"
                  title={user?.primaryEmailAddress?.emailAddress}
                >
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
              </div>
            </div>
          </FallbackSkeleton>
        </div>
      </div>
    </div>
  )
}
