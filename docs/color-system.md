# Shadcn Color System Documentation

## Overview
Flowglad uses shadcn's stone-based semantic color system with CSS variables for theming. This system provides automatic dark mode support, consistent color usage across components, and excellent accessibility through proper contrast ratios.

## Color Architecture

### CSS Variables
All colors are defined as HSL values in CSS variables, allowing for easy theming and dark mode support.

```css
/* Light Theme */
:root {
  --background: 60 9% 98%;          /* Main background color */
  --foreground: 24 10% 10%;         /* Main text color */
  --card: 60 9% 98%;                /* Card backgrounds */
  --card-foreground: 24 10% 10%;    /* Text on cards */
  --popover: 60 9% 98%;             /* Popover backgrounds */
  --popover-foreground: 24 10% 10%; /* Text in popovers */
  --primary: 24 10% 10%;            /* Primary brand color */
  --primary-foreground: 60 9% 98%;  /* Text on primary backgrounds */
  --secondary: 60 5% 96%;           /* Secondary actions */
  --secondary-foreground: 24 10% 10%; /* Text on secondary backgrounds */
  --muted: 60 5% 96%;               /* Muted backgrounds */
  --muted-foreground: 25 5% 45%;    /* Muted text */
  --accent: 60 5% 96%;              /* Accent color */
  --accent-foreground: 24 10% 10%;  /* Text on accent backgrounds */
  --destructive: 0 84.2% 60.2%;     /* Destructive actions */
  --destructive-foreground: 60 9% 98%; /* Text on destructive backgrounds */
  --border: 20 6% 90%;              /* Border color */
  --input: 20 6% 90%;               /* Input borders */
  --ring: 24 10% 10%;               /* Focus rings */
  --radius: 0.5rem;                 /* Border radius */
}

/* Dark Theme */
.dark {
  --background: 20 14% 4%;
  --foreground: 60 9% 98%;
  --card: 20 14% 4%;
  --card-foreground: 60 9% 98%;
  --popover: 20 14% 4%;
  --popover-foreground: 60 9% 98%;
  --primary: 60 9% 98%;
  --primary-foreground: 24 10% 10%;
  --secondary: 12 7% 15%;
  --secondary-foreground: 60 9% 98%;
  --muted: 12 7% 15%;
  --muted-foreground: 24 6% 64%;
  --accent: 12 7% 15%;
  --accent-foreground: 60 9% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 60 9% 98%;
  --border: 12 7% 15%;
  --input: 12 7% 15%;
  --ring: 24 6% 83%;
}
```

## Semantic Color Usage

### Background Colors
```tsx
// Primary background
<div className="bg-background">Main application background</div>

// Card backgrounds
<Card className="bg-card">Card content</Card>

// Muted sections
<div className="bg-muted">Less prominent content</div>

// Popover/dropdown backgrounds
<PopoverContent className="bg-popover">Popover content</PopoverContent>
```

### Text Colors
```tsx
// Primary text
<p className="text-foreground">Main text content</p>

// Muted text
<p className="text-muted-foreground">Secondary information</p>

// Text on colored backgrounds
<Button className="bg-primary text-primary-foreground">
  Primary Button
</Button>
```

### Interactive Elements
```tsx
// Primary actions
<Button variant="default" className="bg-primary text-primary-foreground">
  Primary Action
</Button>

// Secondary actions
<Button variant="secondary" className="bg-secondary text-secondary-foreground">
  Secondary Action
</Button>

// Destructive actions
<Button variant="destructive" className="bg-destructive text-destructive-foreground">
  Delete
</Button>

// Muted/ghost buttons
<Button variant="ghost" className="hover:bg-accent hover:text-accent-foreground">
  Ghost Button
</Button>
```

### Borders and Dividers
```tsx
// Standard borders
<div className="border border-border">Bordered content</div>

// Input borders
<Input className="border-input" />

// Separators
<Separator className="bg-border" />
```

### Focus States
```tsx
// Focus rings
<Button className="focus-visible:ring-2 focus-visible:ring-ring">
  Focusable Element
</Button>

// Input focus
<Input className="focus-visible:ring-2 focus-visible:ring-ring" />
```

## Stone Palette Reference

The stone palette provides a warm neutral grayscale that works well with any accent color:

| Shade | Light Mode HSL | Dark Mode HSL | Usage |
|-------|---------------|--------------|--------|
| stone-50 | 60 9% 98% | - | Light backgrounds, primary-foreground |
| stone-100 | 60 5% 96% | - | Secondary, muted, accent |
| stone-200 | 20 6% 90% | - | Borders, inputs |
| stone-300 | 24 6% 83% | 24 6% 83% | Dark mode ring |
| stone-400 | 24 6% 64% | 24 6% 64% | Dark mode muted-foreground |
| stone-500 | 25 5% 45% | - | Light mode muted-foreground |
| stone-600 | 33 5% 32% | - | Unused |
| stone-700 | 30 7% 23% | - | Unused |
| stone-800 | 12 7% 15% | 12 7% 15% | Dark mode secondary, muted, accent, borders |
| stone-900 | 24 10% 10% | - | Light mode foreground, primary |
| stone-950 | 20 14% 4% | 20 14% 4% | Dark mode background |

## Status Colors

While the core system uses semantic colors, you can use Tailwind's default colors for status indicators:

### Success States
```tsx
// Green for success
<Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
  Success
</Badge>

<div className="border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-950">
  <p className="text-green-800 dark:text-green-100">Success message</p>
</div>
```

### Warning States
```tsx
// Yellow/Amber for warnings
<Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
  Warning
</Badge>

<Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
  <AlertTitle className="text-yellow-800 dark:text-yellow-100">Warning</AlertTitle>
</Alert>
```

### Error States
```tsx
// Use destructive semantic color
<Badge variant="destructive">Error</Badge>

<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>An error occurred</AlertDescription>
</Alert>
```

### Info States
```tsx
// Blue for information
<Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
  Info
</Badge>

<Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
  <AlertTitle className="text-blue-800 dark:text-blue-100">Information</AlertTitle>
</Alert>
```

## Theme Implementation

### Theme Provider Setup
```tsx
import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### Theme Toggle Component
```tsx
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
```

## Tailwind Configuration

The color system is configured in `tailwind.config.ts`:

```typescript
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
    },
  },
}
```

## Best Practices

### 1. Use Semantic Colors
Always prefer semantic color classes over direct color values:
```tsx
// ✅ Good
<div className="bg-background text-foreground">
<Button className="bg-primary text-primary-foreground">

// ❌ Avoid
<div className="bg-stone-50 text-stone-900">
<Button className="bg-stone-900 text-stone-50">
```

### 2. Maintain Contrast Ratios
Ensure proper contrast for accessibility:
- Use `foreground` colors with `background` colors
- Use `*-foreground` variants with their corresponding backgrounds
- Test both light and dark modes

### 3. Dark Mode Considerations
Always test components in both themes:
```tsx
// Ensure colors work in both modes
<div className="bg-muted text-muted-foreground">
  Works in both light and dark modes
</div>

// For custom colors, provide dark mode variants
<div className="bg-green-100 dark:bg-green-900">
  Custom color with dark mode support
</div>
```

### 4. Consistent Status Colors
Use consistent colors for status indicators across the application:
- Green: Success, completed, active
- Yellow/Amber: Warning, pending
- Red/Destructive: Error, failed, destructive actions
- Blue: Information, neutral highlights

### 5. Focus Accessibility
Always include visible focus states:
```tsx
<Button className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
  Accessible Button
</Button>
```

## Color Usage Examples

### Card Component
```tsx
<Card className="bg-card text-card-foreground border-border">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription className="text-muted-foreground">
      Card description
    </CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content</p>
  </CardContent>
</Card>
```

### Form Component
```tsx
<form className="space-y-4">
  <div>
    <Label className="text-foreground">Email</Label>
    <Input 
      className="border-input bg-background text-foreground"
      placeholder="Enter email"
    />
    <p className="text-sm text-muted-foreground mt-1">
      We'll never share your email
    </p>
  </div>
  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
    Submit
  </Button>
</form>
```

### Alert Component
```tsx
// Default alert
<Alert className="border-border">
  <AlertTitle className="text-foreground">Alert Title</AlertTitle>
  <AlertDescription className="text-muted-foreground">
    Alert description text
  </AlertDescription>
</Alert>

// Destructive alert
<Alert variant="destructive" className="border-destructive/50 text-destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong</AlertDescription>
</Alert>
```

## Migration from Custom Colors

If migrating from custom colors, use this mapping:

| Old Custom Color | New Semantic Color | Fallback |
|-----------------|-------------------|----------|
| `blue-primary-*` | `primary` | `blue-600` |
| `red-primary-*` | `destructive` | `red-600` |
| `green-single-*` | - | `green-600` |
| `yellow-primary-*` | - | `yellow-600` |
| `fbg-primary-*` | `card` | - |
| `on-primary` | `primary-foreground` | - |
| `on-neutral` | `secondary-foreground` | - |
| `on-danger` | `destructive-foreground` | - |
| `stroke` | `border` | - |

## Debugging Colors

To debug color usage in development:

```tsx
// Add this component to visualize all color variables
export function ColorDebugger() {
  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <div className="space-y-2">
        <h3 className="font-bold">Light Mode</h3>
        <div className="bg-background p-2 border">background</div>
        <div className="bg-card p-2 border">card</div>
        <div className="bg-primary text-primary-foreground p-2">primary</div>
        <div className="bg-secondary text-secondary-foreground p-2">secondary</div>
        <div className="bg-muted text-muted-foreground p-2">muted</div>
        <div className="bg-accent text-accent-foreground p-2">accent</div>
        <div className="bg-destructive text-destructive-foreground p-2">destructive</div>
      </div>
      <div className="space-y-2 dark">
        <h3 className="font-bold text-white">Dark Mode</h3>
        <div className="bg-background p-2 border text-white">background</div>
        <div className="bg-card p-2 border text-white">card</div>
        <div className="bg-primary text-primary-foreground p-2">primary</div>
        <div className="bg-secondary text-secondary-foreground p-2">secondary</div>
        <div className="bg-muted text-muted-foreground p-2">muted</div>
        <div className="bg-accent text-accent-foreground p-2">accent</div>
        <div className="bg-destructive text-destructive-foreground p-2">destructive</div>
      </div>
    </div>
  )
}
```