#!/usr/bin/env tsx
/* eslint-disable no-console */

import fs from 'fs'
import path from 'path'
import { z } from 'zod'

const fileSchema = z.object({
  path: z.string(),
  type: z.enum([
    'registry:lib',
    'registry:block',
    'registry:component',
    'registry:ui',
    'registry:hook',
    'registry:theme',
    'registry:page',
    'registry:file',
    'registry:style',
    'registry:item',
  ]),
  target: z.string().optional(),
  content: z.string().optional(),
})

const itemSchema = z.object({
  name: z.string(),
  type: z.enum([
    'registry:lib',
    'registry:block',
    'registry:component',
    'registry:ui',
    'registry:hook',
    'registry:theme',
    'registry:page',
    'registry:file',
    'registry:style',
    'registry:item',
  ]),
  title: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()).optional(),
  devDependencies: z.array(z.string()).optional(),
  registryDependencies: z.array(z.string()).optional(),
  files: z.array(fileSchema).min(1),
  tailwind: z
    .object({
      config: z
        .object({
          content: z.array(z.string()).optional(),
          theme: z.record(z.string(), z.any()).optional(),
          plugins: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  cssVars: z
    .object({
      theme: z.record(z.string(), z.string()).optional(),
      light: z.record(z.string(), z.string()).optional(),
      dark: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  css: z.record(z.string(), z.any()).optional(),
  envVars: z.record(z.string(), z.string()).optional(),
  meta: z.record(z.string(), z.any()).optional(),
  docs: z.string().optional(),
  categories: z.array(z.string()).optional(),
  extends: z.string().optional(),
})

const registrySchema = z.object({
  $schema: z.string(),
  name: z.string(),
  homepage: z.string(),
  items: z.array(itemSchema).min(1),
})

interface ValidationError {
  type: 'error' | 'warning'
  message: string
  item?: string
  file?: string
}

class RegistryValidator {
  private errors: ValidationError[] = []
  private registryPath: string
  private registryDir: string

  constructor(registryPath: string) {
    this.registryPath = registryPath
    this.registryDir = path.dirname(registryPath)
  }

  async validate(): Promise<{
    valid: boolean
    errors: ValidationError[]
  }> {
    this.errors = []

    // 1. Check if registry.json exists
    if (!fs.existsSync(this.registryPath)) {
      this.errors.push({
        type: 'error',
        message: 'registry.json file not found',
      })
      return { valid: false, errors: this.errors }
    }

    // 2. Parse and validate JSON structure
    let registry: any
    try {
      const content = fs.readFileSync(this.registryPath, 'utf-8')
      registry = JSON.parse(content)
    } catch (error) {
      this.errors.push({
        type: 'error',
        message: `Invalid JSON in registry.json: ${error}`,
      })
      return { valid: false, errors: this.errors }
    }

    // 3. Validate against schema
    try {
      registrySchema.parse(registry)
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          this.errors.push({
            type: 'error',
            message: `Schema validation: ${issue.path.join('.')}: ${issue.message}`,
          })
        }
      }
      return { valid: false, errors: this.errors }
    }

    // 4. Additional validation rules
    for (const item of registry.items) {
      this.validateItem(item)
    }

    // 5. Check for duplicate component names
    this.checkDuplicateNames(registry.items)

    // 6. Validate cross-references
    this.validateCrossReferences(registry.items)

    // 7. Check for orphaned files
    this.checkOrphanedFiles(registry.items)

    return {
      valid:
        this.errors.filter((e) => e.type === 'error').length === 0,
      errors: this.errors,
    }
  }

  private validateItem(item: any) {
    // Rule: registry:page and registry:file must have target
    for (const file of item.files) {
      if (
        (file.type === 'registry:page' ||
          file.type === 'registry:file') &&
        !file.target
      ) {
        this.errors.push({
          type: 'error',
          message: `File with type '${file.type}' must have a 'target' property`,
          item: item.name,
          file: file.path,
        })
      }

      // Rule: All referenced files must exist
      const filePath = path.join(this.registryDir, file.path)
      if (!fs.existsSync(filePath)) {
        this.errors.push({
          type: 'error',
          message: `Referenced file does not exist: ${file.path}`,
          item: item.name,
        })
      }

      // Rule: Check for TypeScript/TSX files have proper extensions
      if (fs.existsSync(filePath)) {
        const ext = path.extname(file.path)
        const content = fs.readFileSync(filePath, 'utf-8')

        if (
          file.type === 'registry:component' ||
          file.type === 'registry:ui'
        ) {
          if (ext !== '.tsx' && ext !== '.jsx') {
            this.errors.push({
              type: 'warning',
              message: `Component file should have .tsx or .jsx extension`,
              item: item.name,
              file: file.path,
            })
          }
        }

        // Rule: Check for missing imports
        if (content.includes('import') && content.includes('from')) {
          this.validateImports(
            content,
            item.name,
            file.path,
            item.registryDependencies
          )
        }
      }
    }

    // Rule: Component naming convention
    if (!item.name.match(/^[a-z][a-z0-9-]*$/)) {
      this.errors.push({
        type: 'warning',
        message: `Component name should be kebab-case: ${item.name}`,
        item: item.name,
      })
    }

    // Rule: Must have title and description
    if (!item.title || item.title.trim() === '') {
      this.errors.push({
        type: 'error',
        message: 'Item must have a non-empty title',
        item: item.name,
      })
    }

    if (!item.description || item.description.trim() === '') {
      this.errors.push({
        type: 'error',
        message: 'Item must have a non-empty description',
        item: item.name,
      })
    }

    // Rule: Check dependencies exist in package.json
    if (item.dependencies) {
      this.validateDependencies(item.dependencies, item.name)
    }

    // Rule: Check devDependencies exist in package.json
    if (item.devDependencies) {
      this.validateDependencies(item.devDependencies, item.name, true)
    }
  }

  private validateImports(
    content: string,
    itemName: string,
    filePath: string,
    registryDependencies?: string[]
  ) {
    // Check for common shadcn/ui imports that should be in registryDependencies
    const shadcnImports = content.match(
      /from\s+["']@\/components\/ui\/([\w-]+)["']/g
    )
    if (shadcnImports) {
      const existingDeps = new Set(registryDependencies || [])
      shadcnImports.forEach((imp) => {
        const componentName = imp.match(/ui\/([\w-]+)/)?.[1]
        if (componentName && !existingDeps.has(componentName)) {
          this.errors.push({
            type: 'warning',
            message: `Consider adding '${componentName}' to registryDependencies`,
            item: itemName,
            file: filePath,
          })
        }
      })
    }
  }

  private validateDependencies(
    deps: string[],
    itemName: string,
    isDevDep: boolean = false
  ) {
    const packageJsonPath = path.join(
      this.registryDir,
      'package.json'
    )
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf-8')
      )
      const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      }

      for (const dep of deps) {
        if (!allDeps[dep]) {
          const depType = isDevDep ? 'DevDependency' : 'Dependency'
          this.errors.push({
            type: 'error',
            message: `${depType} '${dep}' not found in package.json`,
            item: itemName,
          })
        }
      }
    }
  }

  private checkDuplicateNames(items: any[]) {
    const names = new Set<string>()
    const duplicates = new Set<string>()

    for (const item of items) {
      if (names.has(item.name)) {
        duplicates.add(item.name)
      }
      names.add(item.name)
    }

    for (const dup of duplicates) {
      this.errors.push({
        type: 'error',
        message: `Duplicate component name: ${dup}`,
      })
    }
  }

  private validateCrossReferences(items: any[]) {
    const availableComponents = new Set(items.map((i) => i.name))

    for (const item of items) {
      if (item.registryDependencies) {
        for (const dep of item.registryDependencies) {
          // Skip URLs (external registries)
          if (dep.startsWith('http')) continue

          // Check if it's a known shadcn/ui component (common ones)
          const knownComponents = [
            'button',
            'input',
            'label',
            'textarea',
            'card',
            'badge',
            'dialog',
            'select',
            'tooltip',
            'dropdown-menu',
            'sheet',
          ]

          if (
            !knownComponents.includes(dep) &&
            !availableComponents.has(dep)
          ) {
            this.errors.push({
              type: 'warning',
              message: `Registry dependency '${dep}' not found in current registry and may not be a standard shadcn/ui component`,
              item: item.name,
            })
          }
        }
      }

      // Check extends reference
      if (
        item.extends &&
        item.extends !== 'none' &&
        !availableComponents.has(item.extends)
      ) {
        this.errors.push({
          type: 'error',
          message: `Extended component '${item.extends}' not found in registry`,
          item: item.name,
        })
      }
    }
  }

  private checkOrphanedFiles(items: any[]) {
    const referencedFiles = new Set<string>()

    for (const item of items) {
      for (const file of item.files) {
        referencedFiles.add(file.path)
      }
    }

    // Check for component files that exist but aren't referenced
    const registryRoot = path.join(
      this.registryDir,
      'src',
      'registry'
    )
    if (fs.existsSync(registryRoot)) {
      this.checkDirectoryForOrphans(
        registryRoot,
        referencedFiles,
        'src/registry'
      )
    }
  }

  private checkDirectoryForOrphans(
    dir: string,
    referencedFiles: Set<string>,
    relativePath: string
  ) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relPath = path.join(relativePath, entry.name)
      // Normalize path separators to forward slashes for comparison
      const normalizedRelPath = relPath.split(path.sep).join('/')

      if (entry.isDirectory()) {
        this.checkDirectoryForOrphans(
          fullPath,
          referencedFiles,
          relPath
        )
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))
      ) {
        // Skip layout files as they are legitimate Next.js layout files
        if (
          entry.name === 'layout.tsx' ||
          entry.name === 'layout.ts'
        ) {
          continue
        }

        // Skip test files as they don't need to be in the registry
        if (entry.name.endsWith('.test.tsx')) {
          continue
        }

        if (!referencedFiles.has(normalizedRelPath)) {
          this.errors.push({
            type: 'warning',
            message: `Orphaned file not referenced in registry: ${normalizedRelPath}`,
          })
        }
      }
    }
  }

  printReport() {
    const errors = this.errors.filter((e) => e.type === 'error')
    const warnings = this.errors.filter((e) => e.type === 'warning')

    if (errors.length > 0) {
      console.error('\n❌ Errors found:')
      for (const error of errors) {
        console.error(`  • ${error.message}`)
        if (error.item) console.error(`    Component: ${error.item}`)
        if (error.file) console.error(`    File: ${error.file}`)
      }
    }

    if (warnings.length > 0) {
      console.warn('\n⚠️  Warnings:')
      for (const warning of warnings) {
        console.warn(`  • ${warning.message}`)
        if (warning.item)
          console.warn(`    Component: ${warning.item}`)
        if (warning.file) console.warn(`    File: ${warning.file}`)
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log('\n✅ Registry validation passed!')
    }
  }
}

// Main execution
async function main() {
  const registryPath = path.join(process.cwd(), 'registry.json')
  const validator = new RegistryValidator(registryPath)

  const result = await validator.validate()
  validator.printReport()

  // Exit with error code if validation failed
  if (!result.valid) {
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Validation failed:', error)
    process.exit(1)
  })
}

export { RegistryValidator }
