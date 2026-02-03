/**
 * Merchant auth API route handler.
 * Handles all auth endpoints for merchant dashboard users at /api/auth/merchant/*.
 *
 * Supports:
 * - Email/password authentication
 * - Google OAuth
 * - Device authorization (CLI)
 * - Admin plugin endpoints
 * - Magic link (for password reset)
 */
import { toNextJsHandler } from 'better-auth/next-js'
import { merchantAuth } from '@/utils/auth/merchantAuth'

export const { POST, GET } = toNextJsHandler(merchantAuth)
