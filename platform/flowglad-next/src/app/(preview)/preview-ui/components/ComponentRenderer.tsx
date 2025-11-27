'use client'

import type { ComponentType } from 'react'
import { lazy, Suspense, useState } from 'react'

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

export function ComponentRenderer({
  config,
}: ComponentRendererProps) {
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [showCode, setShowCode] = useState(false)

  const Component = config.component
  const currentProps =
    config.variants?.[selectedVariant]?.props ||
    config.defaultProps ||
    {}

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground">
          {config.displayName}
        </h3>
        {config.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {config.description}
          </p>
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
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
          className="px-4 py-2 bg-foreground text-background rounded-md hover:bg-foreground/90 text-sm font-medium"
        >
          {showCode ? 'Hide' : 'Show'} Code
        </button>
      </div>

      {showCode && (
        <div className="bg-muted text-muted-foreground p-4 rounded-lg overflow-x-auto">
          <pre className="text-sm">
            <code>
              {`<${config.displayName}${Object.entries(currentProps).length > 0 ? '\n' : ''}${Object.entries(
                currentProps
              )
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
                .join(
                  '\n'
                )}${Object.entries(currentProps).length > 0 ? '\n' : ''}/>`}
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
      <div className="animate-pulse text-muted-foreground">
        Loading component...
      </div>
    </div>
  )
}

interface ComponentGalleryProps {
  components: ComponentConfig[]
}

export function ComponentGallery({
  components,
}: ComponentGalleryProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredComponents = components.filter(
    (comp) =>
      comp.displayName
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      comp.description
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-8">
      <div>
        <input
          type="text"
          placeholder="Search components..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-border bg-background text-foreground rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      <div className="space-y-12">
        {filteredComponents.map((config) => (
          <ComponentRenderer key={config.name} config={config} />
        ))}
      </div>

      {filteredComponents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No components found matching &quot;{searchTerm}&quot;
        </div>
      )}
    </div>
  )
}
