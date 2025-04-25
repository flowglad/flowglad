// scripts/removeDevRoutes.ts
import fs from 'fs'
import path from 'path'

console.log('====process.env.VERCEL_ENV', process.env.VERCEL_ENV)
if (process.env.VERCEL_ENV === 'production') {
  console.log('Removing development routes for production build...')
  const devRoutesPath = path.join(
    process.cwd(),
    'src',
    'app',
    '(non-prod)'
  )
  console.log('devRoutesPath', devRoutesPath)
  if (fs.existsSync(devRoutesPath)) {
    // Create a temporary backup (in case you need it)
    console.log('Creating backup of development routes...')
    const backupPath = path.join(process.cwd(), '.dev-routes-backup')
    fs.cpSync(devRoutesPath, backupPath, { recursive: true })

    // Remove the development routes
    fs.rmSync(devRoutesPath, { recursive: true, force: true })

    console.log('Development routes removed successfully.')
  } else {
    console.log('No development routes found.')
  }
}
