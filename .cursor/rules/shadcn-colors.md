# Shadcn Color System Guidelines

This rule provides guidance on using and extending the Shadcn-based color system in this codebase.

## File Locations

- **CSS Variables**: `platform/flowglad-next/src/app/globals.css`
- **Tailwind Mappings**: `platform/flowglad-next/tailwind.config.ts`

## Naming Conventions

### CSS Variable Pattern: `--[component]-[variant]`

Follow the Shadcn naming convention where the component comes first, followed by variants:

```css
/* Correct pattern */
--card: ...;
--card-foreground: ...;
--card-muted: ...;

--sidebar: ...;
--sidebar-foreground: ...;
--sidebar-primary: ...;
--sidebar-accent: ...;

--input: ...;           /* border color */
--input-bg: ...;        /* background color */

/* Incorrect pattern - don't do this */
--muted-card: ...;      /* Wrong: variant before component */
--foreground-card: ...; /* Wrong: variant before component */
```

### Tailwind Config Pattern: Nested Objects

Map CSS variables to Tailwind using nested objects that create hyphenated class names:

```ts
// tailwind.config.ts
colors: {
  card: {
    DEFAULT: 'hsl(var(--card))',           // → bg-card
    foreground: 'hsl(var(--card-foreground))', // → text-card-foreground
    muted: 'hsl(var(--card-muted))',       // → bg-card-muted
  },
  input: {
    DEFAULT: 'hsl(var(--input))',          // → border-input
    bg: 'hsl(var(--input-bg))',            // → bg-input-bg
  },
}
```

## Core Color Variables

### Surface Colors (backgrounds)

| CSS Variable | Tailwind Class | Usage |
|--------------|----------------|-------|
| `--background` | `bg-background` | Page/app background |
| `--card` | `bg-card` | Card surfaces |
| `--card-muted` | `bg-card-muted` | Muted/subtle card surfaces |
| `--popover` | `bg-popover` | Popover/dropdown surfaces |
| `--input-bg` | `bg-input-bg` | Input field backgrounds |
| `--muted` | `bg-muted` | Muted/disabled backgrounds |
| `--accent` | `bg-accent` | Hover/focus highlights |

### Text Colors (foregrounds)

| CSS Variable | Tailwind Class | Usage |
|--------------|----------------|-------|
| `--foreground` | `text-foreground` | Primary text |
| `--card-foreground` | `text-card-foreground` | Text on cards |
| `--popover-foreground` | `text-popover-foreground` | Text in popovers |
| `--muted-foreground` | `text-muted-foreground` | Secondary/muted text |
| `--accent-foreground` | `text-accent-foreground` | Text on accent backgrounds |

### Border Colors

| CSS Variable | Tailwind Class | Usage |
|--------------|----------------|-------|
| `--border` | `border-border` | Default borders |
| `--input` | `border-input` | Input field borders |

## Adding New Color Variables

### Step 1: Define CSS Variables in `globals.css`

Add both light and dark mode values:

```css
:root {
  /* Light mode */
  --component-variant: H S% L%;
}

.dark {
  /* Dark mode */
  --component-variant: H S% L%;
}
```

### Step 2: Map in `tailwind.config.ts`

Add to the appropriate nested object or create a new one:

```ts
colors: {
  component: {
    DEFAULT: 'hsl(var(--component))',
    variant: 'hsl(var(--component-variant))',
  },
}
```

### Step 3: Use in Components

```tsx
<div className="bg-component-variant text-component-foreground">
```

## Common Patterns

### Input-like Components

All input fields should use consistent styling:

```tsx
// Use bg-input-bg for input backgrounds
className="border border-input bg-input-bg ..."
```

Components using this pattern:
- `Input` (`input.tsx`)
- `Textarea` (`textarea.tsx`)
- `Select` / `SelectTrigger` (`select.tsx`)
- `CurrencyInput` (`currency-input.tsx`)
- `MultiSelect` (`MultiSelect.tsx`)
- Custom comboboxes (Command + Popover pattern)

### Card-like Containers

For elevated surfaces that aren't inputs:

```tsx
// Standard card
className="bg-card ..."

// Muted/subtle card (e.g., selectable options)
className="bg-card-muted ..."
```

### Interactive Elements

For hover and selection states:

```tsx
className={cn(
  'bg-card-muted',                    // default
  'hover:border-primary',             // hover
  selected && 'border-primary bg-primary/5'  // selected
)}
```

## HSL Format

All color values use HSL format without the `hsl()` wrapper:

```css
/* Correct */
--card: 0 0% 100%;

/* Incorrect */
--card: hsl(0, 0%, 100%);
--card: #ffffff;
```

The `hsl()` wrapper is applied in `tailwind.config.ts`:

```ts
card: 'hsl(var(--card))'
```

## Dark Mode

Always define both light (`:root`) and dark (`.dark`) variants for any new color variable. The values should provide appropriate contrast while maintaining the design aesthetic.
