'use client'

import { PreviewWrapper } from './components/PreviewWrapper'
import { ComponentGallery } from './components/ComponentRenderer'
import { registryComponents } from './registry-index'

export default function PreviewUIPage() {
  return (
    <PreviewWrapper>
      <div className="min-h-screen bg-gray-50">
        <div className="preview-container">
          <header className="mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Component Preview
            </h1>
            <p className="text-lg text-gray-600">
              Isolated preview environment with custom Tailwind configuration
            </p>
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This page uses a completely separate CSS build pipeline. 
                No styles are inherited from the main application.
              </p>
            </div>
          </header>

          <section>
            <ComponentGallery components={registryComponents} />
          </section>

          <footer className="mt-16 pt-8 border-t border-gray-200">
            <div className="text-sm text-gray-500 space-y-2">
              <p>
                <strong>CSS Pipeline:</strong> Built with tailwind.preview.config.ts
              </p>
              <p>
                <strong>Styles Location:</strong> /public/preview/preview.css
              </p>
              <p>
                <strong>Loading Method:</strong> Dynamic injection via PreviewWrapper
              </p>
              <p className="mt-4">
                To add new components, update the registry in{' '}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">
                  registry-index.ts
                </code>
              </p>
            </div>
          </footer>
        </div>
      </div>
    </PreviewWrapper>
  )
}