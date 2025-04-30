// Import css-tools dynamically
let cssTools: {
  parse: (css: string) => CssAstStylesheet
  stringify: (ast: CssAstStylesheet) => string
} | null = null

// Initialize css-tools
const initCssTools = async () => {
  if (!cssTools) {
    const module = await import('@adobe/css-tools')
    cssTools = {
      parse: module.parse as (css: string) => CssAstStylesheet,
      stringify: module.stringify as (
        ast: CssAstStylesheet
      ) => string,
    }
  }
  return cssTools
}

const propertyMap: Record<keyof FlowgladColors, string> = {
  background: 'background',
  card: 'card',
  cardForeground: 'card-foreground',
  border: 'border',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  foreground: 'foreground',
  secondary: 'secondary',
  secondaryForeground: 'secondary-foreground',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  accent: 'accent',
  accentForeground: 'accent-foreground',
  destructive: 'destructive',
  destructiveForeground: 'destructive-foreground',
  input: 'input',
  ring: 'ring',
}

interface CssAstDeclaration {
  type: 'declaration'
  property: string
  value: string
}

interface CssAstRule {
  type: 'rule'
  selectors: string[]
  declarations: CssAstDeclaration[]
}

/**
 * Takes a tuple of [key, value] and returns a CSS AST rule for the theme entry
 * @param themeEntry
 * @returns CSS AST rule
 */
export function themeEntryToCssAst(
  themeEntry: [keyof FlowgladColors, string]
): CssAstRule {
  const [key, value] = themeEntry

  return {
    type: 'rule',
    selectors: [`.flowglad-root`],
    declarations: [
      {
        type: 'declaration',
        property: `--flowglad-${propertyMap[key]}`,
        value,
      },
    ],
  }
}

interface CssAstStylesheet {
  type: 'stylesheet'
  stylesheet: {
    rules: CssAstRule[]
  }
}

/**
 * Converts a theme object to a CSS AST stylesheet.
 * This will only include the properties that are defined in the theme object.
 * It will not include the default values from the defaultTheme.
 * @param theme The theme object
 * @returns CSS AST stylesheet
 */
export function themeToCssAst(
  theme?: FlowgladThemeConfig
): CssAstStylesheet {
  if (!theme) {
    return {
      type: 'stylesheet',
      stylesheet: {
        rules: [],
      },
    }
  }

  const rules: CssAstRule[] = []

  if (theme.light) {
    const lightRule: CssAstRule = {
      type: 'rule',
      selectors: ['.flowglad-root'],
      declarations: Object.entries(theme.light).map(
        ([key, value]) => ({
          type: 'declaration',
          property: `--flowglad-${propertyMap[key as keyof FlowgladColors]}`,
          value,
        })
      ),
    }
    rules.push(lightRule)
  }

  if (theme.dark) {
    const darkRule: CssAstRule = {
      type: 'rule',
      selectors: ['.flowglad-dark'],
      declarations: Object.entries(theme.dark).map(
        ([key, value]) => ({
          type: 'declaration',
          property: `--flowglad-${propertyMap[key as keyof FlowgladColors]}`,
          value,
        })
      ),
    }
    rules.push(darkRule)
  }

  return {
    type: 'stylesheet',
    stylesheet: {
      rules,
    },
  }
}

/**
 * Converts a theme entry to a CSS string
 * @param themeEntry The theme entry
 * @returns CSS string
 */
export async function themeEntryToCss(
  themeEntry: [keyof FlowgladColors, string]
): Promise<string> {
  const rule = themeEntryToCssAst(themeEntry)
  const ast: CssAstStylesheet = {
    type: 'stylesheet',
    stylesheet: {
      rules: [rule],
    },
  }
  const { stringify } = await initCssTools()
  return stringify(ast)
}

/**
 * Converts a theme object to a CSS string
 * @param theme The theme object
 * @returns CSS string
 */
export async function themeToCss(
  theme?: FlowgladThemeConfig
): Promise<string> {
  const mergedTheme: FlowgladThemeConfig = {
    ...defaultTheme,
    light: {
      ...defaultTheme.light,
      ...theme?.light,
    },
    dark: {
      ...defaultTheme.dark,
      ...theme?.dark,
    },
    mode: theme?.mode ?? defaultTheme.mode,
  }
  const ast = themeToCssAst(mergedTheme)
  const { stringify } = await initCssTools()
  const css = stringify(ast)
  return css
}

export interface FlowgladColors {
  background: string
  card: string
  cardForeground: string
  // containerForeground: string
  border: string
  primary: string
  primaryForeground: string
  foreground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  destructiveForeground: string
  input: string
  ring: string
  // buttonBackground: string
  // buttonForeground: string
}

export interface FlowgladThemeConfig {
  light?: Partial<FlowgladColors>
  dark?: Partial<FlowgladColors>
  mode?: 'light' | 'dark' | 'system'
}

export const defaultTheme: FlowgladThemeConfig = {
  light: {
    background: 'hsl(0 0% 100%)',
    border: 'hsl(240 5.9% 90%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(240 10% 3.9%)',
    primary: 'hsl(240 5.9% 10%)',
    primaryForeground: 'hsl(0 0% 98%)',
    foreground: 'hsl(240 10% 3.9%)',
    secondary: 'hsl(240 4.8% 95.9%)',
    secondaryForeground: 'hsl(240 5.9% 10%)',
    muted: 'hsl(240 4.8% 95.9%)',
    mutedForeground: 'hsl(240 3.8% 46.1%)',
    accent: 'hsl(240 4.8% 95.9%)',
    accentForeground: 'hsl(240 5.9% 10%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    input: 'hsl(240 5.9% 90%)',
    ring: 'hsl(240 10% 3.9%)',
  },
  dark: {
    background: 'hsl(240 10% 3.9%)',
    border: 'hsl(240 3.7% 15.9%)',
    card: 'hsl(240 10% 3.9%)',
    cardForeground: 'hsl(0 0% 98%)',
    primary: 'hsl(0 0% 98%)',
    primaryForeground: 'hsl(240 5.9% 10%)',
    foreground: 'hsl(0 0% 98%)',
    secondary: 'hsl(240 3.7% 15.9%)',
    secondaryForeground: 'hsl(0 0% 98%)',
    muted: 'hsl(240 3.7% 15.9%)',
    mutedForeground: 'hsl(240 5% 64.9%)',
    accent: 'hsl(240 3.7% 15.9%)',
    accentForeground: 'hsl(0 0% 98%)',
    destructive: 'hsl(0 62.8% 30.6%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    input: 'hsl(240 3.7% 15.9%)',
    ring: 'hsl(240 4.9% 83.9%)',
  },
  mode: 'system',
} as const
