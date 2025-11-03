import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const packagesDir = path.join(process.cwd(), 'packages')

interface PackageInfo {
  dir: string
  name: string
  scripts: Record<string, string>
  workspaceDependencies: string[]
}

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const collectPackages = async (
  dir: string
): Promise<PackageInfo[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const packages: PackageInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue
    }

    const packageDir = path.join(dir, entry.name)
    const packageJsonPath = path.join(packageDir, 'package.json')

    if (await fileExists(packageJsonPath)) {
      const packageJsonRaw = await readFile(packageJsonPath, 'utf8')
      const packageJson = JSON.parse(packageJsonRaw) as {
        name?: string
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
      }

      const workspaceDependencies = new Set<string>()
      const dependencyGroups: Array<
        Record<string, string> | undefined
      > = [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.peerDependencies,
        packageJson.optionalDependencies,
      ]

      for (const group of dependencyGroups) {
        if (!group) continue
        for (const [depName, version] of Object.entries(group)) {
          if (
            typeof version === 'string' &&
            version.startsWith('workspace:')
          ) {
            workspaceDependencies.add(depName)
          }
        }
      }

      packages.push({
        dir: packageDir,
        name:
          packageJson.name ??
          path.relative(process.cwd(), packageDir),
        scripts: packageJson.scripts ?? {},
        workspaceDependencies: Array.from(workspaceDependencies),
      })
    }

    packages.push(...(await collectPackages(packageDir)))
  }

  return packages
}

const runInPackage = async (
  pkg: PackageInfo,
  scriptName: string,
  extraArgs: string[]
) => {
  if (!pkg.scripts[scriptName]) {
    console.log(
      `⚪️  Skipping ${pkg.name} (no \"${scriptName}\" script)`
    )
    return
  }

  const relativeDir = path.relative(process.cwd(), pkg.dir)
  console.log(
    `\n▶ Running \"${scriptName}\" in ${pkg.name} (${relativeDir})`
  )

  await new Promise<void>((resolve, reject) => {
    const args = ['run', scriptName]
    if (extraArgs.length > 0) {
      args.push('--', ...extraArgs)
    }

    const child = spawn('bun', args, {
      cwd: pkg.dir,
      stdio: 'inherit',
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          `\"${scriptName}\" failed in ${pkg.name} with code ${code}`
        )
      )
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

export const runScriptForPackages = async (
  scriptName: string,
  extraArgs: string[]
) => {
  if (!(await fileExists(packagesDir))) {
    console.warn(`Packages directory not found at ${packagesDir}`)
    return
  }

  const packages = await collectPackages(packagesDir)

  const packageMap = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const visitOrder: PackageInfo[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const visit = (pkg: PackageInfo) => {
    if (visited.has(pkg.name)) return
    if (visiting.has(pkg.name)) {
      throw new Error(
        `Circular dependency detected involving ${pkg.name}`
      )
    }

    visiting.add(pkg.name)
    for (const dep of pkg.workspaceDependencies) {
      const depPackage = packageMap.get(dep)
      if (depPackage) {
        visit(depPackage)
      }
    }
    visiting.delete(pkg.name)
    visited.add(pkg.name)
    visitOrder.push(pkg)
  }

  const packagesByName = [...packages].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  for (const pkg of packagesByName) {
    visit(pkg)
  }

  if (visitOrder.length === 0) {
    console.log('No packages found under ./packages')
    return
  }

  for (const pkg of visitOrder) {
    await runInPackage(pkg, scriptName, extraArgs)
  }
}
