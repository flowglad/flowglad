import { NextRequest, NextResponse } from 'next/server'
import { selectProperNounsByQuery } from '@/db/tableMethods/properNounMethods'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'

export const GET = async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query')

  if (!query) {
    return NextResponse.json([])
  }

  try {
    const properNouns = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectProperNounsByQuery(query, transaction)
      }
    )
    return NextResponse.json(properNouns)
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'Failed to fetch proper nouns' },
      { status: 500 }
    )
  }
}
