/* 
Test telemetry by triggering a task
Run with: NODE_ENV=development pnpm tsx src/scripts/example.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { helloWorldTask } from '@/trigger/example'
import runScript from './scriptRunner'

async function testTelemetry(db: PostgresJsDatabase) {
  console.log('🧪 Testing telemetry by triggering helloWorldTask...')
  
  try {
    // Trigger the task
    const handle = await helloWorldTask.trigger({
      message: 'Testing telemetry!'
    })
    
    console.log('✅ Task triggered successfully!')
    console.log(`📋 Run ID: ${handle.id}`)
    console.log(`🔗 Trigger.dev URL: https://cloud.trigger.dev/orgs/flowglad-b012/projects/flowglad-ByMZ/env/prod/runs?runId=${handle.id}`)
    
    // Wait a moment for the task to complete
    console.log('⏳ Waiting for task to complete...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    console.log('✅ Test completed! Check the trigger.dev dashboard to see the run.')
    
  } catch (error) {
    console.error('❌ Error triggering task:', error)
  }
}

runScript(testTelemetry)
