import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { execSync } from 'child_process'
import path from 'path'

// Run the CSS build script before tests start
try {
  const scriptPath = path.resolve(__dirname, './scripts/build-css.ts')
  execSync(`tsx ${scriptPath}`, { stdio: 'inherit' })
} catch (error) {
  console.error('Failed to build CSS:', error)
}

afterEach(() => {
  cleanup()
})
