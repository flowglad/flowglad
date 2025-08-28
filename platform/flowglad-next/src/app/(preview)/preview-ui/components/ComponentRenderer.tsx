'use client'

import { useState, Suspense, lazy } from 'react'
import type { ComponentType } from 'react'

interface ComponentConfig {
  name: string
  displayName: string
  description?: string
  component: ComponentType<any>
  defaultProps?: Record<string, any>
  variants?: Array<{
    name: string
    props: Record<string, any>
  }>
}

interface ComponentRendererProps {
  config: ComponentConfig
}

export function ComponentRenderer({ config }: ComponentRendererProps) {
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [showCode, setShowCode] = useState(false)
  
  const Component = config.component
  const currentProps = config.variants?.[selectedVariant]?.props || config.defaultProps || {}

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900">{config.displayName}</h3>
        {config.description && (
          <p className="mt-1 text-sm text-gray-600">{config.description}</p>
        )}
      </div>

      {config.variants && config.variants.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {config.variants.map((variant, index) => (
            <button
              key={index}
              onClick={() => setSelectedVariant(index)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selectedVariant === index
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {variant.name}
            </button>
          ))}
        </div>
      )}

      <div className="preview-component-wrapper">
        <Suspense fallback={<ComponentLoadingFallback />}>
          <Component {...currentProps} />
        </Suspense>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowCode(!showCode)}
          className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 text-sm font-medium"
        >
          {showCode ? 'Hide' : 'Show'} Code
        </button>
      </div>

      {showCode && (
        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
          <pre className="text-sm">
            <code>
              {`<${config.displayName}${Object.entries(currentProps).length > 0 ? '\n' : ''}${
                Object.entries(currentProps)
                  .map(([key, value]) => {
                    if (typeof value === 'string') {
                      return `  ${key}="${value}"`
                    }
                    if (typeof value === 'boolean') {
                      return value ? `  ${key}` : ''
                    }
                    return `  ${key}={${JSON.stringify(value)}}`
                  })
                  .filter(Boolean)
                  .join('\n')
              }${Object.entries(currentProps).length > 0 ? '\n' : ''}/>`}
            </code>
          </pre>
        </div>
      )}
    </div>
  )
}

function ComponentLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-pulse text-gray-400">Loading component...</div>
    </div>
  )
}

interface ComponentGalleryProps {
  components: ComponentConfig[]
}

export function ComponentGallery({ components }: ComponentGalleryProps) {
  const [searchTerm, setSearchTerm] = useState('')
  
  const filteredComponents = components.filter(comp =>
    comp.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-8">
      <div>
        <input
          type="text"
          placeholder="Search components..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="space-y-12">
        {filteredComponents.map((config) => (
          <ComponentRenderer key={config.name} config={config} />
        ))}
      </div>

      {filteredComponents.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No components found matching "{searchTerm}"
        </div>
      )}
    </div>
  )
}