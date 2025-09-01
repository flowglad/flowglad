'use client'

import { ComponentGallery } from './components/ComponentRenderer'
import { ThemeToggle } from './components/ThemeToggle'
import { registryComponents } from './registry-index'

export default function PreviewUIPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="preview-container">
        <header className="mb-12">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Component Preview
              </h1>
              <p className="text-lg text-muted-foreground">
                Isolated preview environment with custom Tailwind
                configuration
              </p>
            </div>
            <ThemeToggle />
          </div>
          <div className="mt-4 p-4 bg-accent border border-border rounded-lg">
            <p className="text-sm text-accent-foreground">
              <strong>Note:</strong> This page uses a completely
              separate CSS build pipeline. No styles are inherited
              from the main application.
            </p>
          </div>
        </header>

        <section>
          <ComponentGallery components={registryComponents} />
        </section>

        <footer className="mt-16 pt-8 border-t border-border">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>CSS Pipeline:</strong> Built with
              tailwind.preview.config.ts
            </p>
            <p>
              <strong>Styles Location:</strong>{' '}
              /public/preview/preview.css
            </p>
            <p>
              <strong>Loading Method:</strong> Link tag in layout
            </p>
            <p className="mt-4">
              To add new components, update the registry in{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                registry-index.ts
              </code>
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
