#!/usr/bin/env tsx
/* 
Check telemetry data in Redis
Run with: NODE_ENV=development pnpm tsx src/scripts/check-telemetry.ts --skip-env-pull
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { redis } from '@/utils/redis'

async function checkTelemetry(db: PostgresJsDatabase) {
  console.log('🔍 Checking telemetry data in Redis...')
  
  try {
    // Get all telemetry keys
    const keys = await redis().keys('telemetry:*')
    console.log(`📋 Found ${keys.length} telemetry keys:`)
    
    for (const key of keys) {
      console.log(`  - ${key}`)
      
      // Get the value for each key
      const value = await redis().get(key)
      console.log(`    Value: ${value}`)
    }
    
    if (keys.length === 0) {
      console.log('❌ No telemetry data found in Redis')
    } else {
      console.log('✅ Telemetry data found!')
    }
    
  } catch (error) {
    console.error('❌ Error checking telemetry:', error)
  }
}

runScript(checkTelemetry)
