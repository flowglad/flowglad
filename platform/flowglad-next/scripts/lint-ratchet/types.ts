export interface RatchetConfig {
  rules: RatchetRule[]
  exclude: string[]
  packages: PackageConfig[]
}

export interface RatchetRule {
  name: string
  plugin: string
  filePatterns: string[]
  severity: 'warn' | 'off'
}

export interface PackageConfig {
  path: string // relative to repo root
}

export interface BaselineEntry {
  filePath: string // relative to package root
  ruleName: string
  count: number
}

export interface PackageBaseline {
  packagePath: string
  baselinePath: string
  entries: BaselineEntry[]
}

export interface BiomeDiagnostic {
  filePath: string
  category: string
  message: string
  line: number
}
