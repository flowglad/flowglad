import { z } from 'zod'

/**
 * Valid banner IDs as a const tuple for Zod enum validation.
 * This must be kept in sync with SIDEBAR_BANNER_SLIDES.
 */
const BANNER_IDS = [
  'banner-discord',
  'banner-docs',
  'banner-twitter',
  'banner-blog',
  'banner-github',
] as const

/**
 * Zod schema for validating banner IDs.
 * Used by tRPC input validation to prevent arbitrary string injection.
 */
export const bannerIdSchema = z.enum(BANNER_IDS)

export type BannerId = z.infer<typeof bannerIdSchema>

/**
 * Banner slide configuration for the sidebar carousel.
 */
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

export const SIDEBAR_BANNER_SLIDES: BannerSlide[] = [
  {
    id: 'banner-discord',
    imageUrl: '/banners/Discord-banner-image.jpg',
    alt: 'Join Discord',
    href: 'https://discord.gg/XTK7hVyQD9',
    ctaText: 'Join Discord',
  },
  {
    id: 'banner-docs',
    imageUrl: '/banners/Docs-banner-image.jpg',
    alt: 'Read Docs',
    href: 'https://docs.flowglad.com/quickstart',
    ctaText: 'Read Docs',
  },
  {
    id: 'banner-twitter',
    imageUrl: '/banners/Twitter-banner-image.jpg',
    alt: 'Follow on X',
    href: 'https://x.com/flowglad',
    ctaText: 'Follow on X',
  },
  {
    id: 'banner-blog',
    imageUrl: '/banners/Blog-banner-image.jpg',
    alt: 'Read Blog',
    href: 'https://www.flowglad.com/blog',
    ctaText: 'Read Blog',
  },
  {
    id: 'banner-github',
    imageUrl: '/banners/Github-banner-image.jpg',
    alt: 'View Repo',
    href: 'https://github.com/flowglad/flowglad',
    ctaText: 'View Repo',
  },
]
