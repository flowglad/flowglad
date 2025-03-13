import { exec } from 'child_process'
import chokidar from 'chokidar'
import debounce from 'debounce'
// @ts-expect-error - chalk's export
import chalk from 'chalk'

const initialPublish = async () => {
  console.log(chalk.blue('🚀 Initial publish of all packages...'))
  try {
    await exec('pnpm yalc:publish')
    console.log(chalk.green('✅ Initial publish complete\n'))
  } catch (error) {
    console.error(chalk.red('❌ Initial publish failed:'), error)
    process.exit(1)
  }
}

const linkPackagesGlobally = async () => {
  console.log(chalk.blue('🔗 Linking packages globally...'))
  try {
    for (const packageName of Object.keys(dependencyGraph)) {
      const packagePath = `packages/${packageName.replace('@flowglad/', '')}`
      console.log(chalk.yellow(`Linking ${packageName}...`))
      await exec(`cd ${packagePath} && pnpm link --global`)
    }
    console.log(chalk.green('✅ All packages linked globally\n'))
  } catch (error) {
    console.error(chalk.red('❌ Global linking failed:'), error)
    process.exit(1)
  }
}

// Define dependency graph
const dependencyGraph: Record<string, string[]> = {
  '@flowglad/shared': [],
  '@flowglad/react': ['@flowglad/shared'],
  '@flowglad/server': ['@flowglad/shared'],
  '@flowglad/nextjs': ['@flowglad/react', '@flowglad/server'],
  '@flowglad/types': [],
}

// Get all dependencies that need to be rebuilt when a package changes
const getDependentPackages = (packageName: string): string[] => {
  const dependents: string[] = []

  for (const [pkg, deps] of Object.entries(dependencyGraph)) {
    if (deps.includes(packageName)) {
      dependents.push(pkg)
      // Recursively get packages that depend on this one
      dependents.push(...getDependentPackages(pkg))
    }
  }

  return [...new Set(dependents)]
}

const buildAndPushPackage = async (packageName: string) => {
  const packagePath = `packages/${packageName.replace('@flowglad/', '')}`

  console.log(
    `📦 Building ${packageName}... at packagePath: ${packagePath}`
  )

  try {
    // Build the package
    await exec(
      `cd ${packagePath} && pnpm build && pnpm build:declarations`
    )

    // Push to yalc - add --copy flag to force file copying instead of symlinks
    await exec(`cd ${packagePath} && yalc push --force --copy`)

    console.log(`✅ Built and pushed ${packageName}`)

    // Get dependent packages that need to be rebuilt
    const dependents = getDependentPackages(packageName)

    // Rebuild and push all dependent packages
    for (const dependent of dependents) {
      await buildAndPushPackage(dependent)
    }
  } catch (error) {
    console.error(`Error building ${packageName}:`, error)
  }
}

const getPackageFromPath = (path: string) => {
  // Extract package name from path like packages/react/src/...
  const match = path.match(/packages\/([^/]+)/)
  return match ? `@flowglad/${match[1]}` : null
}

const rebuildAndPush = debounce(async (path: string) => {
  const packageName = getPackageFromPath(path)
  if (!packageName) return

  console.log(
    chalk.yellow(
      `🔄 Rebuilding ${packageName} due to changes in ${path}`
    )
  )

  try {
    await buildAndPushPackage(packageName)

    // Force update in all consuming projects
    console.log(
      chalk.blue('📡 Pushing updates to consuming projects...')
    )
    await exec(
      'cd playground/supabase-auth && yalc update && touch app/page.tsx'
    )

    console.log(chalk.green('✅ Updates pushed successfully'))
  } catch (error) {
    console.error(chalk.red('❌ Error during rebuild:'), error)
  }
}, 100)

// Watch all package source files
const main = async () => {
  await initialPublish()
  await linkPackagesGlobally()
  const watcher = chokidar
    .watch('./packages', {
      usePolling: false,
      persistent: true,
      ignoreInitial: true,
      depth: 99,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      ignored: [
        /(^|[\/\\])\../, // dotfiles
        /node_modules/,
        /dist/,
        /build/,
        /packages\/react\/src\/generated\/styles/,
      ],
    })
    .on('change', (path) => {
      console.log(`🔄 File changed: ${path}`)
      rebuildAndPush(path)
    })

  const watchedPaths = new Set()
  watcher.on('add', (path) => watchedPaths.add(path))
  watcher.on('addDir', (path) => watchedPaths.add(path))

  // Log watched paths after initial scan
  watcher.on('ready', () => {
    console.log('\nWatched paths:')
    console.log(Array.from(watchedPaths).join('\n'))
  })
}

main().catch(console.error)
