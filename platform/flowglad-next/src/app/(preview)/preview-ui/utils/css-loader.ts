interface CSSManifest {
  hash: string
  path: string
  size: number
  generatedAt: string
}

class PreviewCSSLoader {
  private static instance: PreviewCSSLoader
  private styleElement: HTMLStyleElement | null = null
  private cssCache: string | null = null
  private isLoaded = false
  private loadPromise: Promise<void> | null = null

  private constructor() {}

  static getInstance(): PreviewCSSLoader {
    if (!PreviewCSSLoader.instance) {
      PreviewCSSLoader.instance = new PreviewCSSLoader()
    }
    return PreviewCSSLoader.instance
  }

  async loadCSS(): Promise<void> {
    // Return existing promise if already loading
    if (this.loadPromise) {
      return this.loadPromise
    }

    // Return immediately if already loaded
    if (this.isLoaded && this.styleElement) {
      return Promise.resolve()
    }

    this.loadPromise = this.doLoadCSS()
    return this.loadPromise
  }

  private async doLoadCSS(): Promise<void> {
    try {
      // Fetch manifest to get the current CSS hash
      const manifestResponse = await fetch('/preview/manifest.json')
      if (!manifestResponse.ok) {
        throw new Error(`Failed to fetch manifest: ${manifestResponse.statusText}`)
      }
      
      const manifest: CSSManifest = await manifestResponse.json()
      
      // Use hashed version in production, regular in development
      const cssPath = process.env.NODE_ENV === 'production' 
        ? `/preview/preview.${manifest.hash}.css`
        : manifest.path
      
      // Fetch CSS content
      const cssResponse = await fetch(cssPath)
      if (!cssResponse.ok) {
        throw new Error(`Failed to fetch CSS: ${cssResponse.statusText}`)
      }
      
      const cssContent = await cssResponse.text()
      this.cssCache = cssContent
      
      // Inject CSS into the page
      this.injectCSS(cssContent)
      
      this.isLoaded = true
      console.log(`✅ Preview CSS loaded (${(manifest.size / 1024).toFixed(2)}kb)`)
      
    } catch (error) {
      console.error('Failed to load preview CSS:', error)
      // Fallback: try to load the non-hashed version
      await this.loadFallbackCSS()
    } finally {
      this.loadPromise = null
    }
  }

  private async loadFallbackCSS(): Promise<void> {
    try {
      const response = await fetch('/preview/preview.css')
      if (!response.ok) {
        throw new Error(`Failed to fetch fallback CSS: ${response.statusText}`)
      }
      
      const cssContent = await response.text()
      this.cssCache = cssContent
      this.injectCSS(cssContent)
      this.isLoaded = true
      
      console.log('✅ Preview CSS loaded (fallback)')
    } catch (error) {
      console.error('Failed to load fallback CSS:', error)
      throw error
    }
  }

  private injectCSS(css: string): void {
    if (typeof document === 'undefined') return
    
    // Remove existing style element if present
    this.removeCSS()
    
    // Create and inject new style element
    this.styleElement = document.createElement('style')
    this.styleElement.setAttribute('data-preview-css', 'true')
    this.styleElement.textContent = css
    
    // Insert at the beginning of head to allow overrides
    const head = document.head || document.getElementsByTagName('head')[0]
    if (head.firstChild) {
      head.insertBefore(this.styleElement, head.firstChild)
    } else {
      head.appendChild(this.styleElement)
    }
  }

  removeCSS(): void {
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement)
      this.styleElement = null
    }
    this.isLoaded = false
  }

  // Get cached CSS content
  getCachedCSS(): string | null {
    return this.cssCache
  }

  // Check if CSS is loaded
  isReady(): boolean {
    return this.isLoaded
  }
}

// Export singleton instance methods
export const cssLoader = PreviewCSSLoader.getInstance()

export const loadPreviewCSS = () => cssLoader.loadCSS()
export const removePreviewCSS = () => cssLoader.removeCSS()
export const isPreviewCSSReady = () => cssLoader.isReady()