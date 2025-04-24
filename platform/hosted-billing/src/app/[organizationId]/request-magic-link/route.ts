import { NextRequest, NextResponse } from 'next/server'

export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) => {
  const { organizationId } = await params

  const { email, customerExternalId } = await request.json()
  if (!email || !customerExternalId) {
    return NextResponse.json(
      { error: 'Email and customerExternalId are required' },
      { status: 400 }
    )
  }
  console.log('organizationId', organizationId)
  return NextResponse.json({ message: 'Magic link sent' })
}
