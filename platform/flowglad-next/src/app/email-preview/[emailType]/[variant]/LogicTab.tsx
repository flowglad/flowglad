'use client'

import { Highlight, themes } from 'prism-react-renderer'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { EmailType } from '@/utils/email/registry'

export interface LogicData {
  triggerInfo: {
    summary: string
    conditions: string[]
    triggerTask: { file: string; taskId: string }
    decisionFunction?: { file: string; exportName: string }
    workflowFile?: string
  }
  decisionSource: {
    code: string
    filePath: string
    startLine: number
    endLine: number
  } | null
  triggerSource: {
    code: string
    filePath: string
    startLine: number
    endLine: number
  } | null
}

interface LogicTabProps {
  emailType: EmailType
  logicData: LogicData
}

function CodeBlock({
  code,
  filePath,
  startLine,
}: {
  code: string
  filePath: string
  startLine: number
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-150 text-left"
      >
        <code className="text-xs text-gray-700">{filePath}</code>
        <span className="text-xs text-gray-500">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      {isExpanded && (
        <div className="overflow-auto max-h-[400px]">
          <Highlight
            theme={themes.vsLight}
            code={code}
            language="typescript"
          >
            {({
              className,
              style,
              tokens,
              getLineProps,
              getTokenProps,
            }) => (
              <pre
                className={cn(className, 'p-3 text-xs')}
                style={{
                  ...style,
                  margin: 0,
                  background: 'transparent',
                }}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    <span className="inline-block w-10 text-right mr-3 text-gray-400 select-none">
                      {startLine + i}
                    </span>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      )}
    </div>
  )
}

function SourceLink({
  label,
  filePath,
}: {
  label: string
  filePath: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(filePath)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
      <div>
        <span className="text-xs font-medium text-gray-700">
          {label}
        </span>
        <code className="ml-2 text-xs text-gray-600">{filePath}</code>
      </div>
      <button
        onClick={handleCopy}
        className={cn(
          'text-xs px-2 py-1 rounded transition-colors',
          copied
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        )}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

export function LogicTab({ logicData }: LogicTabProps) {
  const { triggerInfo, decisionSource, triggerSource } = logicData

  return (
    <div className="p-6 min-h-[800px] overflow-auto">
      {/* Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-1">
          Summary
        </h3>
        <p className="text-sm text-blue-800">{triggerInfo.summary}</p>
      </div>

      {/* Conditions */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Trigger Conditions
        </h3>
        <ul className="space-y-1">
          {triggerInfo.conditions.map((condition, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-gray-700"
            >
              <span className="text-green-600 mt-0.5">✓</span>
              {condition}
            </li>
          ))}
        </ul>
      </div>

      {/* Flow */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Trigger Flow
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
          {triggerInfo.workflowFile && (
            <>
              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                Workflow
              </span>
              <span>→</span>
            </>
          )}
          {triggerInfo.decisionFunction && (
            <>
              <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded">
                {triggerInfo.decisionFunction.exportName}()
              </span>
              <span>→</span>
            </>
          )}
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
            {triggerInfo.triggerTask.taskId}
          </span>
          <span>→</span>
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
            Email Sent
          </span>
        </div>
      </div>

      {/* Decision Source */}
      {decisionSource && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Decision Logic{' '}
            <span className="text-xs font-normal text-gray-500">
              (live source)
            </span>
          </h3>
          <CodeBlock
            code={decisionSource.code}
            filePath={decisionSource.filePath}
            startLine={decisionSource.startLine}
          />
        </div>
      )}

      {/* Trigger Source */}
      {triggerSource && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Trigger Task{' '}
            <span className="text-xs font-normal text-gray-500">
              (live source)
            </span>
          </h3>
          <CodeBlock
            code={triggerSource.code}
            filePath={triggerSource.filePath}
            startLine={triggerSource.startLine}
          />
        </div>
      )}

      {/* Source Links */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Source Files
        </h3>
        <div className="space-y-2">
          {triggerInfo.workflowFile && (
            <SourceLink
              label="Workflow"
              filePath={triggerInfo.workflowFile}
            />
          )}
          {triggerInfo.decisionFunction && (
            <SourceLink
              label="Decision Function"
              filePath={triggerInfo.decisionFunction.file}
            />
          )}
          <SourceLink
            label="Trigger Task"
            filePath={triggerInfo.triggerTask.file}
          />
        </div>
      </div>
    </div>
  )
}
