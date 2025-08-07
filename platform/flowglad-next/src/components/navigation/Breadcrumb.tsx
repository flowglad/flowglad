'use client'

import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { sentenceCase } from 'change-case'
import Link from 'next/link'

/**
 * A mapping of specific URL path segments to their full, clickable path.
 * This allows certain parts of a URL to become navigable links in the breadcrumb.
 */
const pathMap: Record<string, string> = {
  products: '/store/products',
  payments: '/finance/payments',
  subscriptions: '/finance/subscriptions',
	map: '/customers/map',
  customers: '/customers',
}

/**
 * Renders a single segment of the breadcrumb trail.
 * It can be either a clickable link or plain text, and displays directional chevrons.
 * @param props - The component props.
 * @param props.segment - The URL segment to display (e.g., 'subscriptions').
 * @param props.single - If true, indicates this is the only breadcrumb, and a left-pointing chevron is shown.
 * @returns A single breadcrumb item.
 */
const BreadcrumbComponent = ({
  segment,
  single,
}: {
  segment: string
  single?: boolean
}) => {
  const path = pathMap[segment]
  const leftIcon = single ? (
    <ChevronLeft
      size={14}
      className="mr-1"
      data-testid="breadcrumb-left-icon"
    />
  ) : null
  const rightIcon = single ? null : (
    <ChevronRight
      size={14}
      className="mx-1"
      data-testid="breadcrumb-right-icon"
    />
  )
  const breadCrumbLabel = (
    <>
      {leftIcon}
      {sentenceCase(segment)}
      {rightIcon}
    </>
  )
  return path ? (
    <div
      className="flex items-center text-sm text-foreground"
      data-testid="breadcrumb-item"
    >
      <Link
        href={path}
        className="flex items-center"
        data-testid="breadcrumb-link"
      >
        {breadCrumbLabel}
      </Link>
    </div>
  ) : (
    <span
      className="flex items-center text-sm text-foreground"
      data-testid="breadcrumb-item"
    >
      <span
        className="flex items-center"
        data-testid="breadcrumb-text"
      >
        {breadCrumbLabel}
      </span>
    </span>
  )
}

/**
 * A list of path segments that correspond to conceptual groupings of pages
 * and therefore should not be displayed in the breadcrumb trail. For instance,
 * in the path '/finance/payments', 'finance' is a grouping and is excluded.
 */
const noCrumbList = [
  'finance',
  'catalog',
  'store',
  'settings',
]

/**
 * Constructs and displays the entire breadcrumb trail based on the current page's URL pathname.
 * It parses the pathname, filters out non-crumbable segments, and then maps the remaining
 * segments to individual `BreadcrumbComponent` instances.
 * @returns A container with the fully assembled breadcrumb trail.
 */
const Breadcrumb = () => {
  const pathname = usePathname()
  const pathSegments = pathname.split('/').filter(Boolean)
  const crumbableSubsegments = pathSegments
    .slice(0, -1)
    .filter((segment) => !noCrumbList.includes(segment))
  const breadcrumbTrail = crumbableSubsegments.map(
    (segment, index) => (
      <BreadcrumbComponent
        key={index}
        segment={segment}
        single={crumbableSubsegments.length === 1}
      />
    )
  )
  return (
    <div
      className="flex items-center text-sm text-foreground"
      data-testid="breadcrumb-container"
    >
      {breadcrumbTrail}
    </div>
  )
}

export default Breadcrumb
