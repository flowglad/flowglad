/**
 * Minimal DOM preload for bun test.
 *
 * This file MUST be loaded before any other modules that might need DOM APIs.
 * It sets up happy-dom globals synchronously at the top level.
 *
 * Usage:
 *   bun test --preload ./bun.dom.preload.ts
 */

import { Window } from 'happy-dom'

const happyWindow = new Window({
  url: 'http://localhost:3000',
  width: 1024,
  height: 768,
})

// Set up global DOM APIs immediately (using 'as any' for type compatibility)
const g = globalThis as any
g.window = happyWindow
g.document = happyWindow.document
g.navigator = happyWindow.navigator
g.location = happyWindow.location
g.history = happyWindow.history
g.getComputedStyle = happyWindow.getComputedStyle.bind(happyWindow)
g.requestAnimationFrame =
  happyWindow.requestAnimationFrame.bind(happyWindow)
g.cancelAnimationFrame =
  happyWindow.cancelAnimationFrame.bind(happyWindow)
g.ResizeObserver = happyWindow.ResizeObserver
g.MutationObserver = happyWindow.MutationObserver
g.IntersectionObserver = happyWindow.IntersectionObserver
g.HTMLElement = happyWindow.HTMLElement
g.HTMLDivElement = happyWindow.HTMLDivElement
g.HTMLSpanElement = happyWindow.HTMLSpanElement
g.HTMLButtonElement = happyWindow.HTMLButtonElement
g.HTMLInputElement = happyWindow.HTMLInputElement
g.HTMLFormElement = happyWindow.HTMLFormElement
g.HTMLAnchorElement = happyWindow.HTMLAnchorElement
g.Element = happyWindow.Element
g.Node = happyWindow.Node
g.DocumentFragment = happyWindow.DocumentFragment
g.Text = happyWindow.Text
g.Comment = happyWindow.Comment
g.Event = happyWindow.Event
g.CustomEvent = happyWindow.CustomEvent
g.MouseEvent = happyWindow.MouseEvent
g.KeyboardEvent = happyWindow.KeyboardEvent
g.FocusEvent = happyWindow.FocusEvent
g.InputEvent = happyWindow.InputEvent
g.PointerEvent = happyWindow.PointerEvent
g.DOMParser = happyWindow.DOMParser
g.XMLSerializer = happyWindow.XMLSerializer
g.Range = happyWindow.Range
g.Selection = happyWindow.Selection
g.NodeFilter = happyWindow.NodeFilter
g.CSSStyleDeclaration = happyWindow.CSSStyleDeclaration

// SVG elements
g.SVGElement = happyWindow.SVGElement
g.SVGSVGElement = happyWindow.SVGSVGElement
g.SVGGraphicsElement = happyWindow.SVGGraphicsElement

// File APIs
g.File = happyWindow.File
g.FileList = happyWindow.FileList
g.Blob = happyWindow.Blob
g.FileReader = happyWindow.FileReader
g.FormData = happyWindow.FormData
g.URL = happyWindow.URL
g.URLSearchParams = happyWindow.URLSearchParams

// Export the window for potential cleanup
export { happyWindow }
