import { NextResponse } from 'next/server'
import core from '@/utils/core'

export const GET = async () => {
  const discordInviteLink = core.envVariable(
    'NEXT_PUBLIC_DISCORD_INVITE_LINK'
  )
  return NextResponse.redirect(discordInviteLink)
}
