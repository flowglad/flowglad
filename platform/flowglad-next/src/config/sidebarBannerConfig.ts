import type { BannerSlide } from '@/components/navigation/SidebarBannerCarousel'

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
