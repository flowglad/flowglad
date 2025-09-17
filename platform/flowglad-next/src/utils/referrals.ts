import { z } from 'zod'

export const REFERRAL_OPTIONS = [
  'Bluesky',
  'Bookface',
  'Discord',
  'Event',
  'Facebook',
  'Flowglad Founder',
  'Friend',
  'Hacker News',
  'Indie Hackers',
  'Instagram',
  'LinkedIn',
  'Mastodon',
  'Newsletter',
  'Product Hunt',
  'Reddit',
  'Search',
  'Slack',
  'Telegram',
  'Threads',
  'TikTok',
  'WhatsApp',
  'X',
  'Y Combinator Site',
  'YouTube',
  'Other',
] as const

export const referralOptionEnum = z.enum(REFERRAL_OPTIONS)
export type ReferralOption = typeof REFERRAL_OPTIONS[number]


