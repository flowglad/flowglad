import { describe, it, expect } from 'vitest'
import {
  themeEntryToCss,
  themeToCss,
  themeEntryToCssAst,
  themeToCssAst,
  FlowgladThemeConfig,
  type FlowgladColors,
  defaultTheme,
} from './themes'

// Define types for CSS AST
interface CssDeclaration {
  type: string
  property: string
  value: string
}

// Import css-tools dynamically
let cssTools: { parse: any } | null = null

// Initialize css-tools
const initCssTools = async () => {
  if (!cssTools) {
    const module = await import('@adobe/css-tools')
    cssTools = {
      parse: module.parse,
    }
  }
  return cssTools
}

describe('themeEntryToCssAst', () => {
  it('should create a valid CSS AST rule for a theme entry', () => {
    const themeEntry: [keyof FlowgladColors, string] = [
      'background',
      '#ffffff',
    ]
    const ast = themeEntryToCssAst(themeEntry)

    expect(ast.type).toBe('rule')
    expect(ast.selectors).toEqual(['.flowglad-root'])
    expect(ast.declarations).toHaveLength(1)
    expect(ast.declarations?.[0].type).toBe('declaration')
    expect(ast.declarations?.[0].property).toBe(
      '--flowglad-background'
    )
    expect(ast.declarations?.[0].value).toBe('#ffffff')
  })
})

describe('themeToCssAst', () => {
  it('should return an empty stylesheet when theme is undefined', () => {
    const ast = themeToCssAst(undefined)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(0)
  })

  it('should create a valid CSS AST stylesheet for a light theme', () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const ast = themeToCssAst(theme)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    const rule = ast.stylesheet?.rules[0]
    expect(rule.type).toBe('rule')
    expect(rule.selectors).toEqual(['.flowglad-root'])
    expect(rule.declarations).toHaveLength(7)

    // Verify that .flowglad-root class doesn't include any styles on its own
    const rootDeclarations = rule.declarations
    expect(
      rootDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      rootDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)

    // Check that each property is correctly mapped
    const declarations = rule.declarations
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-background'
      )?.value
    ).toBe('#ffffff')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-foreground'
      )?.value
    ).toBe('#000000')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-border'
      )?.value
    ).toBe('#cccccc')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-primary'
      )?.value
    ).toBe('#007bff')
    expect(
      declarations.find(
        (d: CssDeclaration) =>
          d.property === '--flowglad-primary-foreground'
      )?.value
    ).toBe('#ffffff')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-destructive'
      )?.value
    ).toBe('#dc3545')
    expect(
      declarations.find(
        (d: CssDeclaration) =>
          d.property === '--flowglad-destructive-foreground'
      )?.value
    ).toBe('#ffffff')
  })

  it('should create a valid CSS AST stylesheet for a dark theme', () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const ast = themeToCssAst(theme)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])
    expect(darkRule.declarations).toHaveLength(7)

    // Verify that .flowglad-dark class doesn't include any styles on its own
    const darkDeclarations = darkRule.declarations
    expect(
      darkDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      darkDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)

    // Check that each property is correctly mapped
    const declarations = darkRule.declarations
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-background'
      )?.value
    ).toBe('#121212')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-foreground'
      )?.value
    ).toBe('#ffffff')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-border'
      )?.value
    ).toBe('#333333')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-primary'
      )?.value
    ).toBe('#0d6efd')
    expect(
      declarations.find(
        (d: CssDeclaration) =>
          d.property === '--flowglad-primary-foreground'
      )?.value
    ).toBe('#ffffff')
    expect(
      declarations.find(
        (d: CssDeclaration) => d.property === '--flowglad-destructive'
      )?.value
    ).toBe('#dc3545')
    expect(
      declarations.find(
        (d: CssDeclaration) =>
          d.property === '--flowglad-destructive-foreground'
      )?.value
    ).toBe('#ffffff')
  })

  it('should create a valid CSS AST stylesheet for both light and dark themes', () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const ast = themeToCssAst(theme)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    // Check light theme rule
    const lightRule = ast.stylesheet?.rules[0]
    expect(lightRule.type).toBe('rule')
    expect(lightRule.selectors).toEqual(['.flowglad-root'])

    // Verify that .flowglad-root class doesn't include any styles on its own
    const rootDeclarations = lightRule.declarations
    expect(
      rootDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      rootDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)

    // Check dark theme rule
    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])

    // Verify that .flowglad-dark class doesn't include any styles on its own
    const darkDeclarations = darkRule.declarations
    expect(
      darkDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      darkDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)
  })

  it('should ensure .flowglad-root class only contains CSS custom properties', () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const ast = themeToCssAst(theme)
    const rootRule = ast.stylesheet?.rules[0]
    const rootDeclarations = rootRule.declarations

    // Verify all declarations are CSS custom properties
    expect(
      rootDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)

    // Verify no direct styling properties are present
    const directStylingProperties = [
      'background',
      'color',
      'border',
      'font',
      'margin',
      'padding',
      'display',
      'position',
    ]
    directStylingProperties.forEach((prop) => {
      expect(
        rootDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(false)
    })

    // Verify all properties follow the expected pattern
    const expectedProperties = [
      '--flowglad-background',
      '--flowglad-foreground',
      '--flowglad-border',
      '--flowglad-primary',
      '--flowglad-primary-foreground',
      '--flowglad-destructive',
      '--flowglad-destructive-foreground',
    ]
    expectedProperties.forEach((prop) => {
      expect(
        rootDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(true)
    })
  })

  it('should ensure .flowglad-dark class only contains CSS custom properties', () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const ast = themeToCssAst(theme)
    const darkRule = ast.stylesheet?.rules[1]
    const darkDeclarations = darkRule.declarations

    // Verify all declarations are CSS custom properties
    expect(
      darkDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)

    // Verify no direct styling properties are present
    const directStylingProperties = [
      'background',
      'color',
      'border',
      'font',
      'margin',
      'padding',
      'display',
      'position',
    ]
    directStylingProperties.forEach((prop) => {
      expect(
        darkDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(false)
    })

    // Verify all properties follow the expected pattern
    const expectedProperties = [
      '--flowglad-background',
      '--flowglad-foreground',
      '--flowglad-border',
      '--flowglad-primary',
      '--flowglad-primary-foreground',
      '--flowglad-destructive',
      '--flowglad-destructive-foreground',
    ]
    expectedProperties.forEach((prop) => {
      expect(
        darkDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(true)
    })
  })

  it('should not override defaults for properties not defined in partial theme configs', () => {
    // Create a partial theme config with only some properties defined
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        // foreground is not defined
        border: '#cccccc',
        // primary is not defined
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        // destructiveForeground is not defined
      },
      dark: {
        background: '#121212',
        // foreground is not defined
        border: '#333333',
        // primary is not defined
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        // destructiveForeground is not defined
      },
    }

    const ast = themeToCssAst(theme)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    // Check light theme rule
    const lightRule = ast.stylesheet?.rules[0]
    expect(lightRule.type).toBe('rule')
    expect(lightRule.selectors).toEqual(['.flowglad-root'])

    // Verify only the defined light properties are included
    const lightDeclarations = lightRule.declarations
    expect(lightDeclarations).toHaveLength(4) // 4 properties defined for light

    // Check that properties have the expected values
    const lightDeclarationsMap = new Map(
      lightDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(lightDeclarationsMap.get('--flowglad-background')).toBe(
      '#ffffff'
    )
    expect(lightDeclarationsMap.get('--flowglad-foreground')).toBe(
      undefined
    )
    expect(lightDeclarationsMap.get('--flowglad-border')).toBe(
      '#cccccc'
    )
    expect(lightDeclarationsMap.get('--flowglad-primary')).toBe(
      undefined
    )
    expect(
      lightDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe('#ffffff')
    expect(lightDeclarationsMap.get('--flowglad-destructive')).toBe(
      '#dc3545'
    )
    expect(
      lightDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe(undefined)

    // Check dark theme rule
    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])

    // Verify only the defined dark properties are included
    const darkDeclarations = darkRule.declarations
    expect(darkDeclarations).toHaveLength(4) // 4 properties defined for dark

    // Check that properties have the expected values
    const darkDeclarationsMap = new Map(
      darkDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(darkDeclarationsMap.get('--flowglad-background')).toBe(
      '#121212'
    )
    expect(darkDeclarationsMap.get('--flowglad-foreground')).toBe(
      undefined
    )
    expect(darkDeclarationsMap.get('--flowglad-border')).toBe(
      '#333333'
    )
    expect(darkDeclarationsMap.get('--flowglad-primary')).toBe(
      undefined
    )
    expect(
      darkDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe('#ffffff')
    expect(darkDeclarationsMap.get('--flowglad-destructive')).toBe(
      '#dc3545'
    )
    expect(
      darkDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe(undefined)
  })

  it('should handle theme configs with only light or only dark mode', () => {
    // Test with only light mode
    const lightOnlyTheme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const lightOnlyAst = themeToCssAst(lightOnlyTheme)
    expect(lightOnlyAst.type).toBe('stylesheet')
    expect(lightOnlyAst.stylesheet?.rules).toHaveLength(1)
    expect(lightOnlyAst.stylesheet?.rules[0].selectors).toEqual([
      '.flowglad-root',
    ])
    expect(
      lightOnlyAst.stylesheet?.rules[0].declarations
    ).toHaveLength(7)

    // Test with only dark mode
    const darkOnlyTheme: FlowgladThemeConfig = {
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const darkOnlyAst = themeToCssAst(darkOnlyTheme)
    expect(darkOnlyAst.type).toBe('stylesheet')
    expect(darkOnlyAst.stylesheet?.rules).toHaveLength(1)
    expect(darkOnlyAst.stylesheet?.rules[0].selectors).toEqual([
      '.flowglad-dark',
    ])
    expect(
      darkOnlyAst.stylesheet?.rules[0].declarations
    ).toHaveLength(7)
  })

  it('should handle heterogeneous shapes of light and dark configs', () => {
    // Create a theme config with different properties defined for light and dark
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        foreground: '#000000',
        // Other light properties are not defined
      },
      dark: {
        // Only some dark properties are defined
        border: '#333333',
        primary: '#0d6efd',
        destructive: '#dc3545',
      },
    }

    const ast = themeToCssAst(theme)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    // Check light theme rule
    const lightRule = ast.stylesheet?.rules[0]
    expect(lightRule.type).toBe('rule')
    expect(lightRule.selectors).toEqual(['.flowglad-root'])

    // Verify only the defined light properties are included
    const lightDeclarations = lightRule.declarations
    expect(lightDeclarations).toHaveLength(2) // 2 declarations set

    // Check that only the defined light properties are present
    const lightDeclarationsMap = new Map(
      lightDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(lightDeclarationsMap.get('--flowglad-background')).toBe(
      '#ffffff'
    )
    expect(lightDeclarationsMap.get('--flowglad-foreground')).toBe(
      '#000000'
    )
    expect(lightDeclarationsMap.get('--flowglad-border')).toBe(
      undefined
    )
    expect(lightDeclarationsMap.get('--flowglad-primary')).toBe(
      undefined
    )
    expect(
      lightDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe(undefined)
    expect(lightDeclarationsMap.get('--flowglad-destructive')).toBe(
      undefined
    )
    expect(
      lightDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe(undefined)

    // Check dark theme rule
    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])

    // Verify only the defined dark properties are included
    const darkDeclarations = darkRule.declarations
    expect(darkDeclarations).toHaveLength(3) // 3 declarations set

    // Check that only the defined dark properties are present
    const darkDeclarationsMap = new Map(
      darkDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(darkDeclarationsMap.get('--flowglad-background')).toBe(
      undefined
    )
    expect(darkDeclarationsMap.get('--flowglad-foreground')).toBe(
      undefined
    )
    expect(darkDeclarationsMap.get('--flowglad-border')).toBe(
      '#333333'
    )
    expect(darkDeclarationsMap.get('--flowglad-primary')).toBe(
      '#0d6efd'
    )
    expect(
      darkDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe(undefined)
    expect(darkDeclarationsMap.get('--flowglad-destructive')).toBe(
      '#dc3545'
    )
    expect(
      darkDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe(undefined)
  })
})

describe('themeEntryToCss', () => {
  it('should convert a theme entry to a CSS string', async () => {
    const themeEntry: [keyof FlowgladColors, string] = [
      'background',
      '#ffffff',
    ]
    const cssString = await themeEntryToCss(themeEntry)

    // Parse the CSS string to verify it's valid
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(1)

    const rule = ast.stylesheet?.rules[0]
    expect(rule.type).toBe('rule')
    expect(rule.selectors).toEqual(['.flowglad-root'])
    expect(rule.declarations).toHaveLength(1)

    const declaration = rule.declarations?.[0]
    expect(declaration.property).toBe('--flowglad-background')
    expect(declaration.value).toBe('#ffffff')
  })
})

describe('themeToCss', () => {
  it('should return a defaults css string when theme is undefined', async () => {
    const cssString = await themeToCss(undefined)
    const defaultCssString = await themeToCss(defaultTheme)
    expect(cssString).toBe(defaultCssString)
  })

  it('should convert a light theme to a CSS string', async () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const cssString = await themeToCss(theme)

    // Parse the CSS string to verify it's valid
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    const lightRule = ast.stylesheet?.rules[0]
    expect(lightRule.type).toBe('rule')
    expect(lightRule.selectors).toEqual(['.flowglad-root'])
    expect(lightRule.declarations).toHaveLength(17)

    // Verify that .flowglad-root class doesn't include any styles on its own
    const rootDeclarations = lightRule.declarations
    expect(
      rootDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      rootDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)
  })

  it('should convert a dark theme to a CSS string', async () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const cssString = await themeToCss(theme)

    // Parse the CSS string to verify it's valid
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])
    expect(darkRule.declarations).toHaveLength(17)

    // Verify that .flowglad-dark class doesn't include any styles on its own
    const darkDeclarations = darkRule.declarations
    expect(
      darkDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      darkDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)
  })

  it('should convert both light and dark themes to a CSS string', async () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const cssString = await themeToCss(theme)

    // Parse the CSS string to verify it's valid
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    const lightRule = ast.stylesheet?.rules[0]
    expect(lightRule.type).toBe('rule')
    expect(lightRule.selectors).toEqual(['.flowglad-root'])

    // Verify that .flowglad-root class doesn't include any styles on its own
    const rootDeclarations = lightRule.declarations
    expect(
      rootDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      rootDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)

    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])

    // Verify that .flowglad-dark class doesn't include any styles on its own
    const darkDeclarations = darkRule.declarations
    expect(
      darkDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)
    expect(
      darkDeclarations.some(
        (d: CssDeclaration) =>
          d.property === 'background' || d.property === 'color'
      )
    ).toBe(false)
  })

  it('should ensure .flowglad-root class in CSS string only contains CSS custom properties', async () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const cssString = await themeToCss(theme)
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    const rootRule = ast.stylesheet?.rules[0]
    const rootDeclarations = rootRule.declarations

    // Verify all declarations are CSS custom properties
    expect(
      rootDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)

    // Verify no direct styling properties are present
    const directStylingProperties = [
      'background',
      'color',
      'border',
      'font',
      'margin',
      'padding',
      'display',
      'position',
    ]
    directStylingProperties.forEach((prop) => {
      expect(
        rootDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(false)
    })

    // Verify all properties follow the expected pattern
    const expectedProperties = [
      '--flowglad-background',
      '--flowglad-foreground',
      '--flowglad-border',
      '--flowglad-primary',
      '--flowglad-primary-foreground',
      '--flowglad-destructive',
      '--flowglad-destructive-foreground',
    ]
    expectedProperties.forEach((prop) => {
      expect(
        rootDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(true)
    })
  })

  it('should ensure .flowglad-dark class in CSS string only contains CSS custom properties', async () => {
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const cssString = await themeToCss(theme)
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    const darkRule = ast.stylesheet?.rules[1]
    const darkDeclarations = darkRule.declarations

    // Verify all declarations are CSS custom properties
    expect(
      darkDeclarations.every((d: CssDeclaration) =>
        d.property.startsWith('--flowglad-')
      )
    ).toBe(true)

    // Verify no direct styling properties are present
    const directStylingProperties = [
      'background',
      'color',
      'border',
      'font',
      'margin',
      'padding',
      'display',
      'position',
    ]
    directStylingProperties.forEach((prop) => {
      expect(
        darkDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(false)
    })

    // Verify all properties follow the expected pattern
    const expectedProperties = [
      '--flowglad-background',
      '--flowglad-foreground',
      '--flowglad-border',
      '--flowglad-primary',
      '--flowglad-primary-foreground',
      '--flowglad-destructive',
      '--flowglad-destructive-foreground',
    ]
    expectedProperties.forEach((prop) => {
      expect(
        darkDeclarations.some(
          (d: CssDeclaration) => d.property === prop
        )
      ).toBe(true)
    })
  })

  it('should not override defaults for properties not defined in partial theme configs', async () => {
    // Create a partial theme config with only some properties defined
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        // foreground is not defined
        border: '#cccccc',
        // primary is not defined
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        // destructiveForeground is not defined
      },
      dark: {
        background: '#121212',
        // foreground is not defined
        border: '#333333',
        // primary is not defined
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        // destructiveForeground is not defined
      },
    }

    const cssString = await themeToCss(theme)

    // Parse the CSS string to verify it's valid
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    // Check light theme rule
    const lightRule = ast.stylesheet?.rules[0]
    expect(lightRule.type).toBe('rule')
    expect(lightRule.selectors).toEqual(['.flowglad-root'])

    // Verify only the defined properties are included
    const lightDeclarations = lightRule.declarations
    expect(lightDeclarations).toHaveLength(17) // All 17 properties defined for light, because of defaultTheme

    // Check that properties have the expected values
    const lightDeclarationsMap = new Map(
      lightDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(lightDeclarationsMap.get('--flowglad-background')).toBe(
      '#ffffff'
    )
    expect(lightDeclarationsMap.get('--flowglad-foreground')).toBe(
      'hsl(240 10% 3.9%)'
    )
    expect(lightDeclarationsMap.get('--flowglad-border')).toBe(
      '#cccccc'
    )
    expect(lightDeclarationsMap.get('--flowglad-primary')).toBe(
      'hsl(240 5.9% 10%)'
    )
    expect(
      lightDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe('#ffffff')
    expect(lightDeclarationsMap.get('--flowglad-destructive')).toBe(
      '#dc3545'
    )
    expect(
      lightDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe('hsl(0 0% 98%)')

    // Check dark theme rule
    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])

    // Verify only the defined dark properties are included
    const darkDeclarations = darkRule.declarations
    expect(darkDeclarations).toHaveLength(17) // All 17 properties defined for dark, because of defaultTheme

    // Check that properties have the expected values
    const darkDeclarationsMap = new Map(
      darkDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(darkDeclarationsMap.get('--flowglad-background')).toBe(
      '#121212'
    )
    expect(darkDeclarationsMap.get('--flowglad-foreground')).toBe(
      'hsl(0 0% 98%)'
    )
    expect(darkDeclarationsMap.get('--flowglad-border')).toBe(
      '#333333'
    )
    expect(darkDeclarationsMap.get('--flowglad-primary')).toBe(
      'hsl(0 0% 98%)'
    )
    expect(
      darkDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe('#ffffff')
    expect(darkDeclarationsMap.get('--flowglad-destructive')).toBe(
      '#dc3545'
    )
    expect(
      darkDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe('hsl(0 0% 98%)')
  })

  it('should handle theme configs with only light or only dark mode', async () => {
    // Test with only light mode
    const lightOnlyTheme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        border: '#cccccc',
        foreground: '#000000',
        primary: '#007bff',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const lightOnlyCssString = await themeToCss(lightOnlyTheme)
    const tools = await initCssTools()
    const lightOnlyAst = tools.parse(lightOnlyCssString)
    expect(lightOnlyAst.type).toBe('stylesheet')
    // 2 rules: .flowglad-root and .flowglad-dark
    expect(lightOnlyAst.stylesheet?.rules).toHaveLength(2)
    expect(lightOnlyAst.stylesheet?.rules[0].selectors).toEqual([
      '.flowglad-root',
    ])
    expect(
      lightOnlyAst.stylesheet?.rules[0].declarations
    ).toHaveLength(17)

    // Test with only dark mode
    const darkOnlyTheme: FlowgladThemeConfig = {
      dark: {
        background: '#121212',
        border: '#333333',
        foreground: '#ffffff',
        primary: '#0d6efd',
        primaryForeground: '#ffffff',
        destructive: '#dc3545',
        destructiveForeground: '#ffffff',
      },
    }

    const darkOnlyCssString = await themeToCss(darkOnlyTheme)
    const darkOnlyAst = tools.parse(darkOnlyCssString)
    expect(darkOnlyAst.type).toBe('stylesheet')
    expect(darkOnlyAst.stylesheet?.rules).toHaveLength(2)
    expect(darkOnlyAst.stylesheet?.rules[0].selectors).toEqual([
      '.flowglad-root',
    ])
    expect(darkOnlyAst.stylesheet?.rules[1].selectors).toEqual([
      '.flowglad-dark',
    ])
    expect(
      darkOnlyAst.stylesheet?.rules[0].declarations
    ).toHaveLength(17)
  })

  it('should handle heterogeneous shapes of light and dark configs', async () => {
    // Create a theme config with different properties defined for light and dark
    const theme: FlowgladThemeConfig = {
      light: {
        background: '#ffffff',
        foreground: '#000000',
        // Other light properties are not defined
      },
      dark: {
        // Only some dark properties are defined
        border: '#333333',
        primary: '#0d6efd',
        destructive: '#dc3545',
      },
    }

    const cssString = await themeToCss(theme)

    // Parse the CSS string to verify it's valid
    const tools = await initCssTools()
    const ast = tools.parse(cssString)
    expect(ast.type).toBe('stylesheet')
    expect(ast.stylesheet?.rules).toHaveLength(2)

    // Check light theme rule
    const lightRule = ast.stylesheet?.rules[0]
    expect(lightRule.type).toBe('rule')
    expect(lightRule.selectors).toEqual(['.flowglad-root'])

    // Verify only the defined light properties are included
    const lightDeclarations = lightRule.declarations
    // All 17 properties defined for light, because of defaultTheme
    expect(lightDeclarations).toHaveLength(17)

    // Check that only the defined light properties are present
    const lightDeclarationsMap = new Map(
      lightDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(lightDeclarationsMap.get('--flowglad-background')).toBe(
      '#ffffff'
    )
    expect(lightDeclarationsMap.get('--flowglad-foreground')).toBe(
      '#000000'
    )
    expect(lightDeclarationsMap.get('--flowglad-border')).toBe(
      'hsl(240 5.9% 90%)'
    )
    expect(lightDeclarationsMap.get('--flowglad-primary')).toBe(
      'hsl(240 5.9% 10%)'
    )
    expect(
      lightDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe('hsl(0 0% 98%)')
    expect(lightDeclarationsMap.get('--flowglad-destructive')).toBe(
      'hsl(0 84.2% 60.2%)'
    )
    expect(
      lightDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe('hsl(0 0% 98%)')

    // Check dark theme rule
    const darkRule = ast.stylesheet?.rules[1]
    expect(darkRule.type).toBe('rule')
    expect(darkRule.selectors).toEqual(['.flowglad-dark'])

    // Verify only the defined dark properties are included
    const darkDeclarations = darkRule.declarations
    expect(darkDeclarations).toHaveLength(17) // All 17 properties defined for dark, because of defaultTheme

    // Check that only the defined dark properties are present
    const darkDeclarationsMap = new Map(
      darkDeclarations.map((d: CssDeclaration) => [
        d.property,
        d.value,
      ])
    )
    expect(darkDeclarationsMap.get('--flowglad-background')).toBe(
      'hsl(240 10% 3.9%)'
    )
    expect(darkDeclarationsMap.get('--flowglad-foreground')).toBe(
      'hsl(0 0% 98%)'
    )
    expect(darkDeclarationsMap.get('--flowglad-border')).toBe(
      '#333333'
    )
    expect(darkDeclarationsMap.get('--flowglad-primary')).toBe(
      '#0d6efd'
    )
    expect(
      darkDeclarationsMap.get('--flowglad-primary-foreground')
    ).toBe('hsl(240 5.9% 10%)')
    expect(darkDeclarationsMap.get('--flowglad-destructive')).toBe(
      '#dc3545'
    )
    expect(
      darkDeclarationsMap.get('--flowglad-destructive-foreground')
    ).toBe('hsl(0 0% 98%)')
  })
})
