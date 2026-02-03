/**
 * Project-level configuration stored in .flowglad/config.json (cwd).
 * Stores linked organization and pricing model for this project.
 * Different from user credentials (~/.flowglad/credentials.json).
 *
 * Note: The .flowglad/ directory contains org/PM IDs which are generally
 * safe to commit. Users should decide based on their project needs whether
 * to add .flowglad/ to .gitignore.
 */
import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'

export interface ProjectConfig {
  organizationId: string
  organizationName: string
  pricingModelId: string
  pricingModelName: string
  livemode: boolean
  updatedAt?: string // ISO date - set by pull, checked by push for concurrent edit protection
}

/**
 * Returns the project-level config directory path.
 * Default: .flowglad (relative to cwd)
 * Can be overridden with FLOWGLAD_PROJECT_CONFIG_DIR environment variable (used for testing).
 */
export const getProjectConfigDir = (): string =>
  process.env.FLOWGLAD_PROJECT_CONFIG_DIR ??
  join(process.cwd(), '.flowglad')

/**
 * Returns the project config file path.
 * Default: .flowglad/config.json
 */
export const getProjectConfigPath = (): string =>
  join(getProjectConfigDir(), 'config.json')

/**
 * Type guard to validate the shape of project config.
 */
const isProjectConfig = (obj: unknown): obj is ProjectConfig => {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  const record = obj as Record<string, unknown>
  return (
    typeof record.organizationId === 'string' &&
    typeof record.organizationName === 'string' &&
    typeof record.pricingModelId === 'string' &&
    typeof record.pricingModelName === 'string' &&
    typeof record.livemode === 'boolean' &&
    (record.updatedAt === undefined ||
      typeof record.updatedAt === 'string')
  )
}

/**
 * Type guard for Node.js errors with code property.
 */
const isNodeError = (
  error: unknown
): error is NodeJS.ErrnoException => {
  return error instanceof Error && 'code' in error
}

/**
 * Loads project config from .flowglad/config.json in current working directory.
 * Returns null if the file doesn't exist or contains invalid JSON/schema.
 * Re-throws errors for permission issues, disk errors, etc.
 */
export const loadProjectConfig =
  async (): Promise<ProjectConfig | null> => {
    const configPath = getProjectConfigPath()

    try {
      const content = await readFile(configPath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      if (!isProjectConfig(parsed)) {
        return null
      }
      return parsed
    } catch (error) {
      // Return null if file doesn't exist or contains invalid JSON
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      if (error instanceof SyntaxError) {
        return null
      }
      throw error
    }
  }

/**
 * Saves project config to .flowglad/config.json in current working directory.
 * Creates the .flowglad directory if it doesn't exist.
 * Uses atomic write (write to temp file, then rename) to prevent corruption.
 */
export const saveProjectConfig = async (
  config: ProjectConfig
): Promise<void> => {
  const configDir = getProjectConfigDir()
  const configPath = getProjectConfigPath()

  // Ensure directory exists
  await mkdir(configDir, { recursive: true })

  // Use atomic write pattern: write to temp file, then rename
  const tempPath = join(configDir, `.config-${randomUUID()}.tmp`)

  try {
    const content = JSON.stringify(config, null, 2)
    await writeFile(tempPath, content)

    // Atomic rename
    await rename(tempPath, configPath)
  } catch (error) {
    // Clean up temp file on failure
    try {
      await rm(tempPath, { force: true })
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}

/**
 * Clears project config by removing the config file.
 * Does not throw if the file doesn't exist.
 * Useful for implementing an "unlink" command.
 */
export const clearProjectConfig = async (): Promise<void> => {
  const configPath = getProjectConfigPath()

  try {
    await rm(configPath)
  } catch (error) {
    // Ignore if file doesn't exist
    if (isNodeError(error) && error.code === 'ENOENT') {
      return
    }
    throw error
  }
}
