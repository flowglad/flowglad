'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { useSidebar } from '@/components/ui/sidebar'
import type { BannerId } from '@/config/sidebarBannerConfig'
import { cn } from '@/lib/utils'

export interface BannerSlide {
  id: BannerId
  /** Image URL - if provided, will display the image */
  imageUrl?: string
  /** Alt text for image */
  alt?: string
  /** Link URL */
  href?: string
  /** CTA button text (default: "Learn More") */
  ctaText?: string
  /** CTA button link - if different from main href */
  ctaHref?: string
}

export interface SidebarBannerCarouselProps {
  slides: BannerSlide[]
}

export const SidebarBannerCarousel: React.FC<
  SidebarBannerCarouselProps
> = ({ slides }) => {
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)
  const [hasStoppedAutoSlide, setHasStoppedAutoSlide] =
    useState(false)

  // Fetch dismissed banner IDs from Redis via tRPC
  const { data: dismissedIds, isLoading } =
    trpc.banners.getDismissedIds.useQuery()
  const utils = trpc.useUtils()

  // Mutation to dismiss banners - accepts array of banner IDs
  const dismissMutation = trpc.banners.dismissAll.useMutation({
    // Optimistic update: immediately mark banners as dismissed in cache
    onMutate: async ({ bannerIds }) => {
      // Cancel outgoing refetches
      await utils.banners.getDismissedIds.cancel()

      // Snapshot previous value
      const previousDismissedIds =
        utils.banners.getDismissedIds.getData()

      // Optimistically update cache
      utils.banners.getDismissedIds.setData(undefined, (old) => {
        const currentIds = old ?? []
        return [...new Set([...currentIds, ...bannerIds])]
      })

      return { previousDismissedIds }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousDismissedIds) {
        utils.banners.getDismissedIds.setData(
          undefined,
          context.previousDismissedIds
        )
      }
    },
    onSettled: () => {
      // Refetch to ensure cache is in sync with server
      utils.banners.getDismissedIds.invalidate()
    },
  })

  // Filter out dismissed banners
  const visibleSlides = useMemo(() => {
    if (!dismissedIds) return slides
    return slides.filter((slide) => !dismissedIds.includes(slide.id))
  }, [slides, dismissedIds])

  // Track current slide and scroll state for pagination dots and nav buttons
  const onSelect = useCallback(() => {
    if (!api) return
    setCurrent(api.selectedScrollSnap())
    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [api])

  // Set up carousel API callbacks
  useEffect(() => {
    if (!api) return

    onSelect()
    api.on('select', onSelect)

    return () => {
      api.off('select', onSelect)
    }
  }, [api, onSelect])

  // Reset carousel to valid index when visibleSlides shrinks
  // (e.g., after dismissedIds loads with pre-existing dismissals)
  useEffect(() => {
    if (current >= visibleSlides.length && visibleSlides.length > 0) {
      api?.scrollTo(0)
    }
  }, [visibleSlides.length, current, api])

  // Auto-slide every 3 seconds (stops permanently on hover)
  useEffect(() => {
    if (!api || visibleSlides.length <= 1 || hasStoppedAutoSlide)
      return

    const interval = setInterval(() => {
      if (api.canScrollNext()) {
        api.scrollNext()
      } else {
        // Loop back to the beginning
        api.scrollTo(0)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [api, visibleSlides.length, hasStoppedAutoSlide])

  // Handle dismiss - dismisses ALL visible banners in a single mutation
  const handleDismiss = () => {
    const bannerIds = visibleSlides.map((slide) => slide.id)
    dismissMutation.mutate({ bannerIds })
  }

  // Don't render while loading, collapsed, or no visible slides
  if (isLoading || isCollapsed || visibleSlides.length === 0) {
    return null
  }

  const currentSlide = visibleSlides[current]
  const ctaLink = currentSlide?.ctaHref ?? currentSlide?.href

  return (
    <div
      className="flex flex-col gap-1 w-full"
      data-testid="sidebar-banner-carousel"
    >
      {/* Close button row - right aligned, ABOVE the image */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          disabled={dismissMutation.isPending}
          className="h-8 w-8 rounded-full"
          aria-label="Dismiss banner"
          data-testid="sidebar-banner-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Banner image container with overlaid navigation */}
      <Carousel setApi={setApi} className="w-full">
        <div
          className="group/banner relative h-[147px] bg-secondary border border-border rounded-[6px] overflow-hidden"
          onMouseEnter={() => setHasStoppedAutoSlide(true)}
        >
          {/* [&>div]:h-full ensures the embla-carousel overflow wrapper inherits height */}
          <div className="h-full [&>div]:h-full">
            <CarouselContent className="-ml-0 h-full [&>div]:h-full">
              {visibleSlides.map((slide) => (
                <CarouselItem key={slide.id} className="pl-0 h-full">
                  <div className="relative h-full w-full overflow-hidden rounded">
                    {slide.imageUrl ? (
                      <Image
                        src={slide.imageUrl}
                        alt={slide.alt ?? ''}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full" />
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </div>

          {/* Navigation buttons - OVERLAID, visible on mobile, hover on desktop, hidden at edges */}
          {visibleSlides.length > 1 && (
            <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
              <Button
                variant="outline"
                size="icon"
                onClick={() => api?.scrollPrev()}
                className={cn(
                  'h-8 w-8 rounded-full bg-background border-input shadow-sm pointer-events-auto',
                  'transition-opacity duration-200',
                  canScrollPrev
                    ? 'opacity-100 md:opacity-0 md:group-hover/banner:opacity-100'
                    : 'opacity-0 pointer-events-none'
                )}
                data-testid="sidebar-banner-prev"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous banner</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => api?.scrollNext()}
                className={cn(
                  'h-8 w-8 rounded-full bg-background border-input shadow-sm pointer-events-auto',
                  'transition-opacity duration-200',
                  canScrollNext
                    ? 'opacity-100 md:opacity-0 md:group-hover/banner:opacity-100'
                    : 'opacity-0 pointer-events-none'
                )}
                data-testid="sidebar-banner-next"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next banner</span>
              </Button>
            </div>
          )}

          {/* CTA Button - OVERLAID at bottom, visible on mobile, hover on desktop */}
          {currentSlide && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
              <Button
                variant="outline"
                size="sm"
                asChild={!!ctaLink}
                className={cn(
                  'h-[26px] bg-background border-input shadow-sm pointer-events-auto',
                  'opacity-100 md:opacity-0 md:group-hover/banner:opacity-100 transition-opacity duration-200'
                )}
                data-testid="sidebar-banner-cta"
              >
                {ctaLink ? (
                  <Link
                    href={ctaLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {currentSlide.ctaText ?? 'Learn More'}
                  </Link>
                ) : (
                  <span>{currentSlide.ctaText ?? 'Learn More'}</span>
                )}
              </Button>
            </div>
          )}
        </div>
      </Carousel>

      {/* Pagination dots - BELOW the image */}
      {visibleSlides.length > 1 && (
        <div
          className="flex items-center justify-center gap-1.5 py-2"
          data-testid="sidebar-banner-pagination"
        >
          {visibleSlides.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => api?.scrollTo(index)}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                current === index ? 'bg-foreground' : 'bg-input'
              )}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={current === index ? 'true' : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
