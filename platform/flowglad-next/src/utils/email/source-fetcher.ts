import { readFile } from 'fs/promises'
import path from 'path'
import type { EmailTriggerInfo } from './trigger-map'

export interface FetchedSource {
  code: string
  filePath: string
  startLine: number
  endLine: number
  exportName?: string
}

/**
 * Escapes special regex metacharacters in a string.
 * This prevents regex injection when interpolating user/config values into patterns.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractExport(
  content: string,
  exportName: string
): { code: string; startLine: number; endLine: number } | null {
  const lines = content.split('\n')
  const safeExportName = escapeRegex(exportName)
  const exportPatterns = [
    new RegExp(`^export\\s+const\\s+${safeExportName}\\s*=`),
    new RegExp(`^export\\s+function\\s+${safeExportName}\\s*[(<]`),
    new RegExp(
      `^export\\s+async\\s+function\\s+${safeExportName}\\s*[(<]`
    ),
  ]

  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (
      exportPatterns.some((pattern) => pattern.test(lines[i].trim()))
    ) {
      startLine = i
      break
    }
  }
  if (startLine === -1) return null

  let braceDepth = 0
  let endLine = startLine
  let foundOpenBrace = false

  for (let i = startLine; i < lines.length; i++) {
    for (const char of lines[i]) {
      if (char === '{' || char === '(') {
        braceDepth++
        foundOpenBrace = true
      } else if (char === '}' || char === ')') {
        braceDepth--
      }
    }
    if (foundOpenBrace && braceDepth === 0) {
      endLine = i
      break
    }
  }

  return {
    code: lines.slice(startLine, endLine + 1).join('\n'),
    startLine: startLine + 1,
    endLine: endLine + 1,
  }
}

export async function fetchDecisionFunctionSource(
  triggerInfo: EmailTriggerInfo
): Promise<FetchedSource | null> {
  if (!triggerInfo.decisionFunction) return null
  const { file, exportName } = triggerInfo.decisionFunction
  const filePath = path.join(process.cwd(), file)

  try {
    const content = await readFile(filePath, 'utf-8')
    const extracted = extractExport(content, exportName)
    if (!extracted) return null
    return { ...extracted, filePath: file, exportName }
  } catch {
    return null
  }
}

export async function fetchTriggerTaskSource(
  triggerInfo: EmailTriggerInfo
): Promise<FetchedSource | null> {
  const { file } = triggerInfo.triggerTask
  const filePath = path.join(process.cwd(), file)

  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    let startLine = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('= task({')) {
        startLine = i
        break
      }
    }
    if (startLine === -1) {
      return {
        code: lines.slice(0, 50).join('\n'),
        filePath: file,
        startLine: 1,
        endLine: 50,
      }
    }

    let braceDepth = 0
    let endLine = startLine
    for (let i = startLine; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') braceDepth++
        else if (char === '}') braceDepth--
      }
      if (braceDepth === 0 && i > startLine) {
        endLine = i
        break
      }
    }

    return {
      code: lines.slice(startLine, endLine + 1).join('\n'),
      filePath: file,
      startLine: startLine + 1,
      endLine: endLine + 1,
    }
  } catch {
    return null
  }
}
