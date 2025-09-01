import db from '@/db/client'
import { sql } from 'drizzle-orm'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function checkColumns() {
  try {
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND column_name IN ('cancellation_reason', 'replaced_by_subscription_id', 'is_free_plan')
    `)
    
    console.log('Existing columns:', result.rows)
    
    if (result.rows.length === 0) {
      console.log('None of the new columns exist! Running migration...')
      
      // Try to add the columns
      await db.execute(sql`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancellation_reason" text`)
      await db.execute(sql`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "replaced_by_subscription_id" text`)
      await db.execute(sql`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "is_free_plan" boolean DEFAULT false`)
      
      console.log('Columns added successfully!')
    } else {
      console.log('Columns already exist')
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    process.exit(0)
  }
}

checkColumns()