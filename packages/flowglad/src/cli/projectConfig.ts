/**
 * Project-level configuration stored in .flowglad/config.json (cwd).
 * Stores linked organization and pricing model for this project.
 * Different from user credentials (~/.flowglad/credentials.json).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
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
const getProjectConfigDir = (): string =>
  process.env.FLOWGLAD_PROJECT_CONFIG_DIR ??
  join(process.cwd(), '.flowglad')

/**
 * Returns the project config file path.
 * Default: .flowglad/config.json
 */
const getProjectConfigPath = (): string =>
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
 * Loads project config from .flowglad/config.json in current working directory.
 * Returns null if the file doesn't exist or is invalid.
 */
export const loadProjectConfig = (): ProjectConfig | null => {
  const configPath = getProjectConfigPath()
  if (!existsSync(configPath)) return null
  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!isProjectConfig(parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Saves project config to .flowglad/config.json in current working directory.
 * Creates the .flowglad directory if it doesn't exist.
 */
export const saveProjectConfig = (config: ProjectConfig): void => {
  const configDir = getProjectConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  writeFileSync(
    getProjectConfigPath(),
    JSON.stringify(config, null, 2)
  )
}
