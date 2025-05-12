'use client'

import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { sentenceCase } from 'change-case'
import Link from 'next/link'

const pathMap: Record<string, string> = {
  products: '/store/products',
  payments: '/finance/payments',
}

const BreadcrumbComponent = ({
  segment,
  single,
}: {
  segment: string
  single?: boolean
}) => {
  const path = pathMap[segment]
  const leftIcon = single ? (
    <ChevronLeft size={14} className="mr-1" />
  ) : null
  const rightIcon = single ? null : (
    <ChevronRight size={14} className="mx-1" />
  )
  const breadCrumbLabel = (
    <>
      {leftIcon}
      {sentenceCase(segment)}
      {rightIcon}
    </>
  )
  return path ? (
    <div className="flex items-center text-sm text-foreground">
      <Link href={path} className="flex items-center">
        {breadCrumbLabel}
      </Link>
    </div>
  ) : (
    <span className="flex items-center text-sm text-foreground">
      <span className="flex items-center">{breadCrumbLabel}</span>
    </span>
  )
}

/**
 * Path segments that correspond to conceptual groupings of pages, and therefore
 * should not be displayed in the breadcrumb.
 */
const noCrumbList = [
  'finance',
  'catalog',
  'store',
  'customers',
  'settings',
]

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
    <div className="flex items-center text-sm text-foreground">
      {breadcrumbTrail}
    </div>
  )
}

export default Breadcrumb
