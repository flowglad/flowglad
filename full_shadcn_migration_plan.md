# Full Shadcn Migration - PR Breakdown & Parallelization Strategy

## Migration Context & Goals

### Current State Problems
We currently have a mixed component system using Ion components and custom color variables throughout Flowglad, which presents several challenges:
- **Component Inconsistency**: Mix of Ion components, custom components, and partial shadcn usage creates UI inconsistency
- **Maintenance Burden**: Ion components require custom maintenance and updates outside of standard shadcn ecosystem
- **Design System Fragmentation**: Multiple color systems (Ion's custom colors vs shadcn defaults) create design inconsistencies
- **Developer Experience**: Mixed APIs and patterns slow down development and increase learning curve
- **Bundle Size**: Redundant component libraries and color systems increase application bundle size

### Migration Strategy
We are migrating the entire application to use **default shadcn/ui components and configurations**. This approach offers:
- **Consistency**: Single, well-maintained design system with consistent APIs
- **Community Support**: Access to shadcn's extensive community and documentation
- **Performance**: Optimized components with better tree-shaking and smaller bundle sizes
- **Accessibility**: Built-in accessibility features following ARIA standards
- **Future-Proof**: Regular updates and improvements from the shadcn community

### End Goal
By the end of this migration, we will:
1. **Delete all Ion components** from `src/components/ion/` including all 25 components
2. **Replace all custom color variables** with shadcn's default color system
3. **Use pure shadcn composition patterns** with zero Ion API compatibility layers
4. **Achieve 100% shadcn component coverage** with zero Ion dependencies
5. **Implement shadcn's default configuration** (default style, zinc base color, CSS variables)
6. **Eliminate all composite/implicit component APIs** in favor of explicit shadcn composition

### Success Criteria
- Zero Ion component imports remaining in codebase
- All custom color variables replaced with shadcn defaults
- Pure shadcn composition patterns throughout application
- No custom component wrappers or Ion API compatibility layers
- Improved bundle size and performance metrics
- Enhanced accessibility compliance
- Streamlined developer experience with standard shadcn patterns

### Architectural Decisions

#### Configuration Standardization
We're standardizing on shadcn's **default configuration**:
- **Style**: `"default"` (instead of current `"new-york"`)
- **Base Color**: `"zinc"` (instead of current `"neutral"`)
- **CSS Variables**: `true` (maintained for theming flexibility)
- **Utility Function**: `cn` from `@/lib/utils` (replacing `clsx`/`twMerge`)

#### Component API Strategy: Pure Shadcn Ecosystem
We are **completely abandoning Ion's composite/implicit APIs** in favor of shadcn's explicit composition patterns:
- **No Ion API compatibility layers** - all Ion-specific props and patterns will be removed
- **Pure shadcn composition** - use explicit component composition instead of implicit bundling
- **Standard shadcn conventions** - follow shadcn's prop naming, variant systems, and patterns exactly
- **Long-term maintainability** - prioritize ecosystem alignment over short-term migration convenience

#### Component API Standardization
All components will follow shadcn's standard patterns:
- Explicit composition over implicit configuration
- Standard shadcn prop naming conventions
- Default shadcn variant and size systems
- Pure CSS variable approach for theming
- Standard accessibility implementations without custom extensions

---

## Overview
This document breaks down the Full Shadcn Migration into parallelizable PRs with clear dependencies and test requirements. Each section is designed to be fed to a coding agent as an independent work unit.

## Parallel Work Tracks

### Track A: Foundation & Configuration (2 Sequential PRs)
Critical foundation work that must be completed first.

### Track B: Core Component Replacements (4 Parallel PRs)
High-usage components that can be developed in parallel with mocks.

### Track C: Specialized Component Replacements (4 Parallel PRs)
Domain-specific components with complex logic.

### Track D: Color System & Styling Migration (3 Parallel PRs)
Color variable replacement and styling updates.

### Track E: Complex Components (3 Parallel PRs)
Complex components requiring research and careful implementation.

### Track F: Final Cleanup (2 Sequential PRs)
Final integration, testing, and cleanup work.

---

## Track A: Foundation & Configuration

### PR A1: Shadcn Configuration & Missing Components
**Dependencies:** None (Foundation work)

**Files to modify:**
```
platform/flowglad-next/components.json
platform/flowglad-next/src/lib/utils.ts
platform/flowglad-next/package.json
```

**Files to create:**
```
platform/flowglad-next/src/lib/
├── utils.ts (if not exists)
└── cn.ts (utility function)
```

**Configuration Updates:**
```json
// components.json changes
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",  // Change from "new-york"
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "zinc",  // Change from "neutral"
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",  // Standardize path
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Missing Components to Install:**
```bash
npx shadcn@latest add dialog table calendar hover-card navigation-menu pagination progress scroll-area slider toggle toggle-group collapsible context-menu dropdown-menu menubar alert alert-dialog aspect-ratio avatar breadcrumb carousel chart data-table resizable
```

**Utility Function Standardization:**
```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Verification Checklist:**
- [ ] All required shadcn components installed successfully
- [ ] cn utility function works correctly
- [ ] Component aliases resolve correctly
- [ ] Tailwind config uses correct base colors
- [ ] CSS variables are properly configured

---

### PR A2: Global CSS Variables Migration
**Dependencies:** A1

**Files to modify:**
```
platform/flowglad-next/src/app/globals.css
platform/flowglad-next/tailwind.config.ts
```

**CSS Variables Replacement:**
```css
/* Remove ALL custom ion variables and replace with shadcn zinc defaults */
@layer base {
  :root {
    --background: 0 0% 98%;
    --foreground: 240 6% 10%;
    --card: 0 0% 98%;
    --card-foreground: 240 6% 10%;
    --popover: 0 0% 98%;
    --popover-foreground: 240 6% 10%;
    --primary: 240 6% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 5% 96%;
    --secondary-foreground: 240 6% 10%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --accent: 240 5% 96%;
    --accent-foreground: 240 6% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 6% 90%;
    --input: 240 6% 90%;
    --ring: 240 6% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 4%;
    --foreground: 0 0% 98%;
    --card: 240 10% 4%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 4%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 6% 10%;
    --secondary: 240 4% 16%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 4% 16%;
    --muted-foreground: 240 5% 65%;
    --accent: 240 4% 16%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 4% 16%;
    --input: 240 4% 16%;
    --ring: 240 5% 84%;
  }
}
```

**Tailwind Config Cleanup:**
```typescript
// Remove ALL custom color definitions and use zinc-based shadcn defaults
const config: Config = {
  // Remove: blue-primary-*, red-primary-*, green-single-*, etc.
  // Remove: fbg-*, on-primary-*, custom semantic colors
  // Keep only: shadcn default color system with zinc base
  theme: {
    extend: {
      // Shadcn semantic colors using zinc palette via CSS variables
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

**Critical Fixes for Contrast & Theme Issues:**
```typescript
// Fix hardcoded dark mode in src/app/layout.tsx
// BEFORE:
<html lang="en" className="dark h-full" data-mode="dark">
  <body className={cn(inter.className, 'dark', 'h-full')}>

// AFTER:
<html lang="en" className="h-full">
  <body className={cn(inter.className, 'h-full')}>
```

```css
/* Remove conflicting CSS variables from globals.css */
/* REMOVE these old variables that conflict with zinc system: */
:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

body {
  color: rgb(var(--foreground-rgb));
  background: '#1b1b1b'; /* ← This hardcoded background breaks everything */
}
```

**Import Path Standardization:**
```typescript
// Fix utility imports in src/app/layout.tsx
// BEFORE:
import { cn } from '@/utils/core'

// AFTER:
import { cn } from '@/lib/utils'
```

**Proper Theme Provider Implementation:**
```typescript
// Install next-themes for proper theme management
pnpm add next-themes

// Create src/components/theme-provider.tsx
"use client"
import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

// Update src/app/Providers.tsx
import { ThemeProvider } from '@/components/theme-provider'

export default function Providers({ children, authContext }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system" 
      enableSystem
      disableTransitionOnChange
    >
      {/* other providers */}
    </ThemeProvider>
  )
}
```

**System Detection Best Practices Implemented:**
- ✅ **next-themes**: Industry standard for React/Next.js theme management
- ✅ **System preference detection**: `enableSystem` automatically detects OS theme
- ✅ **Class-based toggling**: `attribute="class"` works with Tailwind's `darkMode: 'class'`
- ✅ **Persistence**: Automatically saves user preference to localStorage
- ✅ **Hydration safe**: Prevents flash of incorrect theme on page load
- ✅ **Manual override**: Users can choose light/dark/system preferences
- ✅ **Smooth transitions**: Proper CSS transitions with `disableTransitionOnChange`

**Hydration Mismatch Fix:**
```typescript
// Fix SSR hydration mismatch in src/app/layout.tsx
<html lang="en" className="h-full" suppressHydrationWarning>
  <body className={cn(inter.className, 'h-full')}>

// Clear any build cache that might cause server/client mismatches
rm -rf .next && pnpm run dev
```

**Common Hydration Issues & Solutions:**
- **Server renders dark class**: `suppressHydrationWarning` on `<html>` prevents errors
- **Build cache conflicts**: Clear `.next` directory for fresh builds
- **Theme flashing**: `next-themes` prevents theme flash with proper SSR handling
- **localStorage mismatch**: Theme provider handles client/server storage differences

**Verification Checklist:**
- [ ] All ion custom variables removed from CSS
- [ ] All shadcn zinc-based variables present and correctly configured
- [ ] Dark mode zinc variables properly configured
- [ ] Tailwind config uses only shadcn zinc semantic colors
- [ ] No references to removed custom color variables
- [ ] Zinc color palette HSL values match TailwindCSS specifications
- [ ] **Fixed hardcoded dark mode classes in layout.tsx**
- [ ] **Removed conflicting CSS variables and hardcoded backgrounds**
- [ ] **Text contrast is readable in both light and dark themes**
- [ ] **Theme switching responds to system preferences**

**Zinc Color Mapping Reference:**
```css
/* TailwindCSS Zinc Palette → Shadcn Semantic Variables */

/* Light Theme Mapping */
:root {
  /* zinc-50 (0 0% 98%) → background, card, popover, primary-foreground, destructive-foreground */
  /* zinc-100 (240 5% 96%) → secondary, muted, accent */  
  /* zinc-200 (240 6% 90%) → border, input */
  /* zinc-500 (240 4% 46%) → muted-foreground */
  /* zinc-900 (240 6% 10%) → foreground, card-foreground, popover-foreground, primary, secondary-foreground, accent-foreground, ring */
}

/* Dark Theme Mapping */
.dark {
  /* zinc-50 (0 0% 98%) → foreground, card-foreground, popover-foreground, primary, secondary-foreground, accent-foreground, destructive-foreground */
  /* zinc-400 (240 5% 65%) → muted-foreground */
  /* zinc-800 (240 4% 16%) → secondary, muted, accent, border, input */
  /* zinc-900 (240 6% 10%) → primary-foreground */
  /* zinc-950 (240 10% 4%) → background, card, popover */
  /* zinc-300 (240 5% 84%) → ring */
}
```

This mapping ensures proper contrast ratios and accessibility while maintaining visual consistency with TailwindCSS's Zinc palette.

**Why Zinc Over Slate:**
- **Neutral Foundation**: Zinc provides a true neutral grayscale without color bias
- **Better Contrast**: Zinc offers improved contrast ratios for accessibility compliance
- **Standard Compliance**: Zinc aligns with TailwindCSS's recommended neutral palette
- **Design Flexibility**: Zinc works better with both warm and cool color accents
- **Community Adoption**: Zinc is increasingly the preferred choice in shadcn implementations

**Developer Notes:**
- Use semantic variables (`bg-background`, `text-foreground`) instead of direct zinc classes (`bg-zinc-50`)
- Standard TailwindCSS colors (green-600, blue-500, etc.) work alongside zinc semantic variables
- All zinc values are automatically responsive to light/dark mode via CSS variables
- Test color contrast in both themes to ensure accessibility compliance

---

## Track B: Core Component Replacements

### PR B1: Modal → Dialog Migration
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/Modal.tsx → DELETE
```

**Files to update (69 files with Modal imports):**
```
src/components/forms/FormModal.tsx
src/components/forms/DeleteProductModal.tsx
src/components/forms/EditProductModal.tsx
src/components/forms/ArchiveProductModal.tsx
src/components/forms/CreatePriceModal.tsx
... (all modal-using components)
```

**Migration Pattern:**
```typescript
// BEFORE (Ion Modal)
import Modal from '@/components/ion/Modal'

<Modal
  title="Delete Product"
  subtitle="This action cannot be undone"
  trigger={<Button>Delete</Button>}
  footer={
    <div className="flex gap-2">
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button variant="destructive" onClick={onConfirm}>Delete</Button>
    </div>
  }
>
  <p>Are you sure you want to delete this product?</p>
</Modal>

// AFTER (Shadcn Dialog)
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button>Delete</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Product</DialogTitle>
      <DialogDescription>This action cannot be undone</DialogDescription>
    </DialogHeader>
    <p>Are you sure you want to delete this product?</p>
    <DialogFooter>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button variant="destructive" onClick={onConfirm}>Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Automated Migration Script:**
```bash
# Create migration script: scripts/migrate-modal.sh
#!/bin/bash
find src -name "*.tsx" -type f -exec sed -i '' \
  -e 's|import Modal from '\''@/components/ion/Modal'\''|import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog"|g' \
  -e 's|import { Modal }|import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription }|g' \
  {} \;
```

**Verification Checklist:**
- [ ] All Modal imports replaced with Dialog imports
- [ ] Modal trigger prop converted to DialogTrigger composition
- [ ] Modal title prop converted to DialogTitle
- [ ] Modal subtitle prop converted to DialogDescription
- [ ] Modal footer prop converted to DialogFooter
- [ ] All modal usage patterns work correctly
- [ ] No remaining Modal component references

---

### PR B2: Badge Component Migration
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/Badge.tsx → DELETE
```

**Files to update (25+ badge usages):**
```
src/components/StatusBadge.tsx
src/components/DefaultBadge.tsx
src/app/finance/subscriptions/SubscriptionStatusBadge.tsx
... (all badge components)
```

**Migration Pattern:**
```typescript
// BEFORE (Ion Badge)
import Badge from '@/components/ion/Badge'

<Badge
  variant="soft"
  color="green"
  size="md"
  iconLeading={<CheckIcon />}
>
  Active
</Badge>

// AFTER (Shadcn Badge)
import { Badge } from "@/components/ui/badge"

<Badge variant="secondary" className="bg-green-100 text-green-800">
  <CheckIcon className="w-3 h-3 mr-1" />
  Active
</Badge>
```

**Pure Shadcn Badge Usage:**
```typescript
// Use ONLY default shadcn Badge variants - no custom extensions
import { Badge } from "@/components/ui/badge"

// Ion colors mapped to standard shadcn variants + className overrides
<Badge variant="secondary" className="bg-green-100 text-green-800">
  <CheckIcon className="w-3 h-3 mr-1" />
  Active
</Badge>

<Badge variant="destructive">
  <XIcon className="w-3 h-3 mr-1" />
  Inactive  
</Badge>

<Badge variant="outline">
  <InfoIcon className="w-3 h-3 mr-1" />
  Pending
</Badge>
```

**No Ion API Compatibility:**
```typescript
// ❌ DO NOT create Ion-compatible APIs
// ❌ DO NOT extend shadcn Badge with iconLeading/iconTrailing props
// ❌ DO NOT create custom success/warning/info variants

// ✅ Use explicit composition with standard shadcn patterns
// ✅ Use className overrides for custom colors when needed
// ✅ Follow shadcn conventions exactly
```

**Verification Checklist:**
- [ ] All Badge imports updated to shadcn
- [ ] Ion color usage converted to className overrides
- [ ] Icons composed explicitly within Badge children
- [ ] All badge variants use standard shadcn variants only
- [ ] No custom Badge extensions or Ion API compatibility
- [ ] No remaining ion Badge references

---

### PR B3: Form Components Migration (Label, Hint, Switch)
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/Label.tsx → DELETE
src/components/ion/Hint.tsx → DELETE
src/components/ion/Switch.tsx → DELETE
```

**Files to update (50+ form usages):**
```
src/components/forms/ProductFormFields.tsx
src/components/forms/PriceFormFields.tsx
src/components/forms/CustomerFormFields.tsx
... (all form components)
```

**Migration Patterns:**

**Label Migration:**
```typescript
// BEFORE (Ion Label)
import Label from '@/components/ion/Label'

<Label required error={!!errors.name}>
  Product Name
</Label>

// AFTER (Shadcn Label + Form)
import { Label } from "@/components/ui/label"
import { FormItem, FormLabel, FormMessage } from "@/components/ui/form"

<FormItem>
  <FormLabel className={errors.name ? "text-destructive" : ""}>
    Product Name {required && <span className="text-destructive">*</span>}
  </FormLabel>
  {errors.name && <FormMessage>{errors.name.message}</FormMessage>}
</FormItem>
```

**Hint Migration:**
```typescript
// BEFORE (Ion Hint)
import Hint from '@/components/ion/Hint'

<Hint error={!!errors.name}>
  {errors.name?.message || "Enter a descriptive product name"}
</Hint>

// AFTER (Shadcn Form)
import { FormDescription, FormMessage } from "@/components/ui/form"

{errors.name ? (
  <FormMessage>{errors.name.message}</FormMessage>
) : (
  <FormDescription>Enter a descriptive product name</FormDescription>
)}
```

**Switch Migration:**
```typescript
// BEFORE (Ion Switch)
import Switch from '@/components/ion/Switch'

<Switch
  checked={isActive}
  onCheckedChange={setIsActive}
  label="Active"
  description="Enable this product"
/>

// AFTER (Shadcn Switch)
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

<div className="flex items-center space-x-2">
  <Switch
    id="active"
    checked={isActive}
    onCheckedChange={setIsActive}
  />
  <div className="grid gap-1.5 leading-none">
    <Label htmlFor="active">Active</Label>
    <p className="text-sm text-muted-foreground">Enable this product</p>
  </div>
</div>
```

**Verification Checklist:**
- [ ] All Label components use shadcn Label
- [ ] Required indicators display correctly
- [ ] Error states show proper styling
- [ ] Hint components converted to FormDescription/FormMessage
- [ ] Switch components work with new API
- [ ] Form validation displays correctly
- [ ] No remaining ion form component references

---

### PR B4: Layout Components Migration (Tab, Popover, PageTitle)
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/Tab.tsx → DELETE
src/components/ion/Popover.tsx → DELETE
src/components/ion/PageTitle.tsx → DELETE
```

**Files to update (30+ layout usages):**
```
src/app/customers/Internal.tsx
src/app/store/products/Internal.tsx
src/app/settings/OrganizationSettingsTab.tsx
... (all tab and popover components)
```

**Migration Patterns:**

**Tab Migration:**
```typescript
// BEFORE (Ion Tab)
import Tab from '@/components/ion/Tab'

<Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
  <Tab.List>
    <Tab>Overview</Tab>
    <Tab>Details</Tab>
    <Tab>Settings</Tab>
  </Tab.List>
  <Tab.Panels>
    <Tab.Panel>Overview content</Tab.Panel>
    <Tab.Panel>Details content</Tab.Panel>
    <Tab.Panel>Settings content</Tab.Panel>
  </Tab.Panels>
</Tab.Group>

// AFTER (Shadcn Tabs)
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

<Tabs value={selectedTab} onValueChange={setSelectedTab}>
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="details">Details</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">Overview content</TabsContent>
  <TabsContent value="details">Details content</TabsContent>
  <TabsContent value="settings">Settings content</TabsContent>
</Tabs>
```

**Popover Migration:**
```typescript
// BEFORE (Ion Popover)
import Popover from '@/components/ion/Popover'

<Popover
  trigger={<Button>Options</Button>}
  placement="bottom-end"
>
  <div className="p-4">
    <p>Popover content</p>
  </div>
</Popover>

// AFTER (Shadcn Popover)
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

<Popover>
  <PopoverTrigger asChild>
    <Button>Options</Button>
  </PopoverTrigger>
  <PopoverContent align="end">
    <div className="p-4">
      <p>Popover content</p>
    </div>
  </PopoverContent>
</Popover>
```

**PageTitle Migration:**
```typescript
// BEFORE (Ion PageTitle)
import PageTitle from '@/components/ion/PageTitle'

<PageTitle
  title="Products"
  subtitle="Manage your products and pricing"
  action={<Button>Add Product</Button>}
/>

// AFTER (Custom PageHeader using shadcn)
// src/components/ui/page-header.tsx
interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}
```

**Verification Checklist:**
- [ ] Tab components work with new API
- [ ] Tab selection and content switching works
- [ ] Popover positioning and triggers work
- [ ] PageTitle replaced with semantic PageHeader
- [ ] Layout components are responsive
- [ ] No remaining ion layout component references

---

## Track C: Specialized Component Replacements

### PR C1: Calendar & Date Picker Migration
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/Calendar.tsx → DELETE
src/components/ion/Datepicker.tsx → DELETE
```

**Files to update (10+ date picker usages):**
```
src/components/forms/InvoiceFormFields.tsx
src/components/forms/SubscriptionFormFields.tsx
... (all date picker components)
```

**Pure Shadcn Date Picker Implementation:**
```typescript
// ❌ DO NOT create custom DatePicker wrapper component
// ✅ Use shadcn Calendar + Popover + Button explicitly in each form

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

// BEFORE (Ion Datepicker with bundled features)
<Datepicker
  value={selectedDate}
  onChange={setSelectedDate}
  placeholder="Select date"
  label="Start Date"
  error={!!errors.date}
  required={true}
  minDate={new Date()}
/>

// AFTER (Pure Shadcn with explicit composition)
<FormItem>
  <FormLabel>
    Start Date <span className="text-destructive">*</span>
  </FormLabel>
  <FormControl>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate ? format(selectedDate, "PPP") : "Select date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          disabled={(date) => date < new Date()}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  </FormControl>
  <FormMessage />
</FormItem>
```

**No Custom DatePicker Component:**
```typescript
// ❌ DO NOT create src/components/ui/date-picker.tsx
// ❌ DO NOT bundle label, error, validation into date picker
// ❌ DO NOT create Ion-compatible API wrappers

// ✅ Use explicit composition in each component that needs date picking
// ✅ Handle form integration explicitly with shadcn Form components
// ✅ Use shadcn Calendar + Popover + Button directly
```

**Verification Checklist:**
- [ ] Calendar uses shadcn Calendar + Popover + Button composition
- [ ] Date selection handled explicitly in each form
- [ ] Date formatting uses date-fns in components
- [ ] Form integration uses shadcn Form components
- [ ] No custom DatePicker wrapper components
- [ ] No remaining ion date component references

---

### PR C2: Skeleton & Loading States Migration
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/Skeleton.tsx → DELETE
```

**Files to update (15+ skeleton usages):**
```
src/components/LoadingStates.tsx
src/app/dashboard/LoadingDashboard.tsx
... (all loading components)
```

**Migration Pattern:**
```typescript
// BEFORE (Ion Skeleton)
import Skeleton from '@/components/ion/Skeleton'

<Skeleton className="h-4 w-[250px]" />
<Skeleton className="h-4 w-[200px]" />

// AFTER (Shadcn Skeleton)
import { Skeleton } from "@/components/ui/skeleton"

<Skeleton className="h-4 w-[250px]" />
<Skeleton className="h-4 w-[200px]" />
```

**Enhanced Loading Components:**
```typescript
// src/components/ui/loading-states.tsx
import { Skeleton } from "@/components/ui/skeleton"

export function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[150px]" />
          <Skeleton className="h-4 w-[100px]" />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-[250px]" />
      <Skeleton className="h-4 w-[200px]" />
      <Skeleton className="h-4 w-[150px]" />
    </div>
  )
}
```

**Verification Checklist:**
- [ ] Skeleton components render correctly
- [ ] Loading states display appropriately
- [ ] Skeleton animations work
- [ ] Responsive skeleton layouts
- [ ] No remaining ion Skeleton references

---

### PR C3: Checkout & Billing Components Migration
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/CheckoutDetails.tsx → DELETE
src/components/ion/BillingHeader.tsx → DELETE
src/components/ion/TotalBillingDetails.tsx → DELETE
src/components/ion/SellerInfo.tsx → DELETE
src/components/ion/PostPaymentSidebar.tsx → DELETE
```

**Files to update (10+ billing components):**
```
src/components/CheckoutPage.tsx
src/components/CheckoutModal.tsx
... (all checkout-related components)
```

**Migration Strategy:**
```typescript
// Create domain-specific components using shadcn primitives
// src/components/checkout/checkout-details.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface CheckoutDetailsProps {
  items: CheckoutItem[]
  total: number
  currency: string
}

export function CheckoutDetails({ items, total, currency }: CheckoutDetailsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between">
            <span>{item.name}</span>
            <span>{formatCurrency(item.price, currency)}</span>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Verification Checklist:**
- [ ] CheckoutDetails displays items correctly
- [ ] Price calculations are accurate
- [ ] Currency formatting works
- [ ] Billing components render properly
- [ ] No remaining ion checkout component references

---

### PR C4: Utility Components Migration (DisabledTooltip, PoweredBy)
**Dependencies:** A1, A2

**Files to replace:**
```
src/components/ion/DisabledTooltip.tsx → DELETE
src/components/ion/PoweredByFlowgladText.tsx → DELETE
src/components/ion/SignupSideBar.tsx → DELETE
```

**Migration Pattern:**
```typescript
// BEFORE (Ion DisabledTooltip)
import DisabledTooltip from '@/components/ion/DisabledTooltip'

<DisabledTooltip message="This feature is disabled">
  <Button disabled>Click me</Button>
</DisabledTooltip>

// AFTER (Shadcn Tooltip)
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button disabled>Click me</Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>This feature is disabled</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Verification Checklist:**
- [ ] Tooltips display on hover
- [ ] Disabled tooltips work correctly
- [ ] Branding components render properly
- [ ] No remaining ion utility component references

---

## Track D: Color System & Styling Migration

### PR D1: Component Color Class Updates
**Dependencies:** A2

**Files to update:** All files using custom color classes (457 files identified)

**Automated Migration Script:**
```bash
#!/bin/bash
# scripts/migrate-colors.sh

# Map ion colors to shadcn equivalents
declare -A color_map=(
  # Backgrounds
  ["bg-blue-primary-500"]="bg-primary"
  ["bg-red-primary-500"]="bg-destructive"
  ["bg-green-single-500"]="bg-green-600"
  ["bg-yellow-primary-500"]="bg-yellow-600"
  ["bg-fbg-primary-800"]="bg-card"
  ["bg-on-primary"]="bg-primary-foreground"
  ["bg-on-neutral"]="bg-secondary-foreground"
  ["bg-on-danger"]="bg-destructive-foreground"
  
  # Text colors
  ["text-blue-primary-500"]="text-primary"
  ["text-red-primary-500"]="text-destructive"
  ["text-on-primary"]="text-primary-foreground"
  ["text-on-neutral"]="text-secondary-foreground"
  ["text-on-danger"]="text-destructive-foreground"
  ["text-foreground"]="text-foreground"
  
  # Border colors
  ["border-blue-primary-500"]="border-primary"
  ["border-red-primary-500"]="border-destructive"
  ["border-stroke"]="border-border"
  ["border-stroke-subtle"]="border-border"
)

# Apply color mappings
for old_color in "${!color_map[@]}"; do
  new_color="${color_map[$old_color]}"
  find src -name "*.tsx" -type f -exec sed -i '' "s|$old_color|$new_color|g" {} \;
done
```

**Manual Review Required:**
```typescript
// Complex color combinations that need manual review
const manualReviewPatterns = [
  'bg-gradient-*',
  'hover:bg-*-primary-*',
  'focus:ring-*-primary-*',
  'data-[state=*]:bg-*',
]
```

**Verification Checklist:**
- [ ] All ion color classes replaced
- [ ] Shadcn color classes render correctly
- [ ] Dark mode colors work properly
- [ ] Hover and focus states use correct colors
- [ ] No remaining custom color references

---

### PR D2: Utility Function Migration (clsx/twMerge → cn)
**Dependencies:** A1

**Files to update:** 24 files using clsx/twMerge

**Automated Migration Script:**
```bash
#!/bin/bash
# scripts/migrate-utils.sh

# Replace clsx and twMerge imports with cn
find src -name "*.tsx" -type f -exec sed -i '' \
  -e 's|import clsx from '\''clsx'\''||g' \
  -e 's|import { twMerge } from '\''tailwind-merge'\''||g' \
  -e 's|import.*clsx.*from.*clsx.*||g' \
  -e 's|import.*twMerge.*from.*tailwind-merge.*||g' \
  -e 's|import { cn } from '\''@/utils/core'\''|import { cn } from "@/lib/utils"|g' \
  {} \;

# Add cn import where needed
find src -name "*.tsx" -type f -exec sed -i '' \
  -e '/clsx\|twMerge/i\
import { cn } from "@/lib/utils"' \
  {} \;

# Replace clsx and twMerge usage with cn
find src -name "*.tsx" -type f -exec sed -i '' \
  -e 's|clsx(|cn(|g' \
  -e 's|twMerge(clsx(|cn(|g' \
  -e 's|twMerge(|cn(|g' \
  {} \;
```

**Verification Checklist:**
- [ ] All clsx imports replaced with cn
- [ ] All twMerge imports replaced with cn
- [ ] cn function works correctly
- [ ] Class merging behavior is preserved
- [ ] No remaining clsx/twMerge references

---

### PR D3: Custom CSS Cleanup
**Dependencies:** A2, D1

**Files to modify:**
```
src/app/globals.css
src/components/**/*.module.css (if any)
```

**CSS Cleanup Tasks:**
```css
/* Remove all custom ion classes */
/* REMOVE: */
.primary-focus { /* ... */ }
.neutral-focus { /* ... */ }
.danger-focus { /* ... */ }

/* REMOVE: Custom component classes */
.ion-* { /* ... */ }

/* KEEP: Shadcn-compatible utilities */
.scrollbar-hidden { /* ... */ }
.no-scrollbar { /* ... */ }
.text-balance { /* ... */ }
```

**Verification Checklist:**
- [ ] All ion-specific CSS classes removed
- [ ] Shadcn styles work correctly
- [ ] No visual regressions
- [ ] Custom utilities still function

---

## Track E: Complex Components

### PR E1: Table Components Migration
**Dependencies:** A1, A2, B1, B2, B3, B4, C1, C2, C3, C4, D1, D2, D3

**Files to replace:**
```
src/components/ion/Table.tsx → DELETE
src/components/ion/ColumnHeaderCell.tsx → DELETE
src/components/ion/TableTitle.tsx → DELETE
```

**Files to update (15+ table components):**
```
src/app/store/products/ProductsTable.tsx
src/app/customers/CustomersTable.tsx
src/app/finance/payments/PaymentsTable.tsx
src/app/finance/invoices/InvoicesTable.tsx
... (all table components)
```

**Research Requirements:**
- Research shadcn community best practices for complex tables
- Study data-table implementations in shadcn ecosystem
- Analyze pagination patterns used by shadcn community
- Review accessibility standards for table components

**Pure Shadcn Table Implementation:**
```typescript
// ❌ DO NOT create custom DataTable wrapper
// ✅ Use shadcn Table components directly with explicit composition

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

// Each table implementation handles its own state and pagination
function ProductsTable({ products, pagination }: ProductsTableProps) {
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50">
              <TableCell>{product.name}</TableCell>
              <TableCell>{product.price}</TableCell>
              <TableCell>{product.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      {/* Explicit pagination using shadcn Button components */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {pagination.start} to {pagination.end} of {pagination.total}
        </p>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={pagination.onPrevious}
            disabled={!pagination.canPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={pagination.onNext}
            disabled={!pagination.canNext}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

### PR E2: Input Components Migration (NumberInput, CurrencyInput)
**Dependencies:** A1, A2, B1, B2, B3, B4, C1, C2, C3, C4, D1, D2, D3

**Files to replace:**
```
src/components/ion/NumberInput.tsx → DELETE
src/components/ion/CurrencyInput.tsx → DELETE
```

**Files to update (20+ input usages):**
```
src/components/forms/PriceFormFields.tsx
src/components/forms/DiscountFormFields.tsx
... (all numeric input components)
```

**Research Requirements:**
- Research shadcn community number input implementations
- Study currency input patterns in shadcn ecosystem
- Analyze form validation best practices with shadcn
- Review number formatting libraries compatible with shadcn
- Investigate react-number-format integration patterns

**Pure Shadcn Input Implementation:**
```typescript
// ❌ DO NOT create custom NumberInput/CurrencyInput wrappers
// ✅ Use standard HTML input with shadcn Input component + explicit handling

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"

// BEFORE (Ion NumberInput with complex API)
<NumberInput
  value={price}
  onValueChange={setPrice}
  min={0}
  step={0.01}
  placeholder="0.00"
  currency="USD"
  label="Price"
  error={!!errors.price}
/>

// AFTER (Pure Shadcn with explicit composition)
<FormItem>
  <FormLabel>Price</FormLabel>
  <FormControl>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        type="number"
        min={0}
        step={0.01}
        placeholder="0.00"
        value={price}
        onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
        className="pl-8 text-right"
      />
    </div>
  </FormControl>
  <FormMessage />
</FormItem>
```

**Number Formatting Research:**
```typescript
// Research community patterns for:
// 1. react-number-format integration with shadcn Input
// 2. Currency symbol positioning and internationalization
// 3. Number validation and formatting best practices
// 4. Decimal precision handling in forms
// 5. Accessibility considerations for number inputs

// Example research areas:
// - How does shadcn community handle currency inputs?
// - What are the standard patterns for number validation?
// - How to handle international number formats?
// - Best practices for form integration with complex inputs?
```

---

### PR E3: Advanced Input Components Research & Implementation
**Dependencies:** E2

**Research Focus:**
- Study advanced input patterns in shadcn community
- Research accessibility best practices for complex inputs
- Analyze performance implications of different input approaches
- Document recommended patterns for future input components

**Implementation:**
- Create documentation for number/currency input patterns
- Establish guidelines for future complex input implementations
- Provide examples and best practices for the team

---

## Track F: Final Cleanup

### PR F1: Component Cleanup & Deletion
**Dependencies:** All previous PRs

**Files to delete:**
```bash
# Delete entire ion directory
rm -rf src/components/ion/

# Delete migration components
rm src/components/ui/button-migration.tsx

# Clean up any remaining ion references
```

**Verification Script:**
```bash
#!/bin/bash
# scripts/verify-cleanup.sh

echo "Checking for remaining ion references..."
grep -r "ion/" src/ && echo "❌ Ion references found" || echo "✅ No ion references"

echo "Checking for remaining custom colors..."
grep -r "blue-primary\|red-primary\|fbg-" src/ && echo "❌ Custom colors found" || echo "✅ No custom colors"

echo "Checking for clsx/twMerge..."
grep -r "clsx\|twMerge" src/ && echo "❌ Old utilities found" || echo "✅ No old utilities"
```

---

### PR F2: Documentation & Type Updates
**Dependencies:** F1

**Files to create/update:**
```
docs/
├── migration-guide.md
├── component-usage.md
└── color-system.md

src/types/
├── components.ts (update)
└── ui.ts (new)
```

**Documentation Requirements:**
```markdown
# Migration Guide
- Before/after examples for each component
- Color mapping reference
- Common migration patterns
- Troubleshooting guide

# Component Usage
- All available shadcn components
- Usage examples and best practices
- Research findings for complex components

# Color System
- Shadcn color token reference
- Dark mode implementation
```

---

## Execution Strategy

### Week 1 - Foundation (Sequential)
**Monday-Tuesday:**
- **Team 1**: PR A1 (Shadcn Configuration & Missing Components)
- **Team 2**: PR A2 (Global CSS Variables Migration)

**Wednesday-Friday:**
- Merge foundation PRs
- Begin parallel component work

### Week 2-3 - Core Components (Parallel)
**Teams 1-4 work in parallel:**
- **Team 1**: PR B1 (Modal → Dialog Migration)
- **Team 2**: PR B2 (Badge Component Migration)
- **Team 3**: PR B3 (Form Components Migration)
- **Team 4**: PR B4 (Layout Components Migration)

### Week 4 - Specialized Components (Parallel)
**Teams 1-4 work in parallel:**
- **Team 1**: PR C1 (Calendar & Date Picker Migration)
- **Team 2**: PR C2 (Skeleton & Loading States Migration)
- **Team 3**: PR C3 (Checkout & Billing Components Migration)
- **Team 4**: PR C4 (Utility Components Migration)

### Week 5 - Color & Styling (Parallel)
**Teams 1-3 work in parallel:**
- **Team 1**: PR D1 (Component Color Class Updates)
- **Team 2**: PR D2 (Utility Function Migration)
- **Team 3**: PR D3 (Custom CSS Cleanup)

### Week 6 - Complex Components (Parallel)
**Teams 1-3 work in parallel:**
- **Team 1**: PR E1 (Table Components Migration)
- **Team 2**: PR E2 (Input Components Migration - NumberInput, CurrencyInput)
- **Team 3**: PR E3 (Advanced Input Components Research & Implementation)

### Week 7 - Final Integration & Cleanup (Sequential)
**Monday-Tuesday:**
- **Team 1**: PR F1 (Component Cleanup & Deletion)

**Wednesday-Thursday:**
- **Team 2**: PR F2 (Documentation & Type Updates)

**Friday:**
- Final testing and deployment preparation

---

## Dependency Graph

```mermaid
graph TD
    A1[Shadcn Config] --> A2[CSS Variables]
    A1 --> B1[Modal Migration]
    A1 --> B2[Badge Migration]
    A1 --> B3[Form Migration]
    A1 --> B4[Layout Migration]
    A1 --> C1[Calendar Migration]
    A1 --> C2[Skeleton Migration]
    A1 --> C3[Checkout Migration]
    A1 --> C4[Utility Migration]
    
    A2 --> D1[Color Updates]
    A2 --> D2[Utility Updates]
    A2 --> D3[CSS Cleanup]
    
    B1 --> E1[Table Migration]
    B2 --> E1
    B3 --> E1
    B4 --> E1
    C1 --> E1
    C2 --> E1
    C3 --> E1
    C4 --> E1
    D1 --> E1
    D2 --> E1
    D3 --> E1
    
    E1 --> E2[Input Migration]
    E1 --> E3[Input Research]
    E2 --> F1[Cleanup & Deletion]
    E3 --> F1
    F1 --> F2[Documentation]
```

---

## Success Metrics

### Component Migration Quality
- [ ] All 25 ion components successfully replaced
- [ ] All 1,262+ ion imports updated to shadcn
- [ ] Zero TypeScript compilation errors
- [ ] All component APIs follow shadcn conventions
- [ ] All components have proper accessibility features

### Color System Quality  
- [ ] All 600+ custom color variables replaced
- [ ] All 20+ custom color class usages updated
- [ ] Dark mode functions correctly with new colors
- [ ] No visual regressions in UI components
- [ ] Consistent color usage across application

### Code Quality
- [ ] All automated migration scripts successful
- [ ] No remaining clsx/twMerge references
- [ ] Consistent import paths throughout codebase
- [ ] Complete documentation for new component system
- [ ] Research documentation for complex components completed

### Integration Quality
- [ ] All user flows function correctly
- [ ] All form validations work properly
- [ ] All table functionality preserved
- [ ] All modal interactions work
- [ ] Mobile responsiveness maintained

---

## Risk Mitigation

### Technical Risks
1. **Breaking Changes in Component APIs**
   - Mitigation: Comprehensive test coverage, gradual rollout
   - Fallback: Maintain migration components temporarily

2. **Color System Visual Regressions**
   - Mitigation: Visual regression testing, designer review
   - Fallback: Quick color adjustment PRs

3. **Performance Degradation**
   - Mitigation: Performance benchmarking, bundle analysis
   - Fallback: Component-specific optimizations

4. **Accessibility Regressions**
   - Mitigation: Automated a11y testing, manual testing
   - Fallback: Accessibility-focused bug fix PRs

### Process Risks
1. **Parallel Development Conflicts**
   - Mitigation: Clear component boundaries, daily syncs
   - Fallback: Sequential execution of conflicting PRs

2. **Testing Bottlenecks**
   - Mitigation: Automated testing, parallel test execution
   - Fallback: Focused testing on critical paths

3. **Integration Complexity**
   - Mitigation: Mock-based development, early integration testing
   - Fallback: Phased integration approach

4. **Timeline Pressure**
   - Mitigation: Buffer time, clear priorities
   - Fallback: Reduced scope for non-critical components

---

## Notes for Coding Agents

Each PR section above is self-contained and can be assigned to a separate agent. Provide the agent with:

1. **The specific PR section** with all requirements and file lists
2. **Access to the current codebase** and existing component patterns  
3. **Component interface definitions** and migration patterns
4. **Automated migration scripts** where applicable
5. **Test requirements** and coverage expectations
6. **Dependencies** and integration points

### Agent Guidelines:
1. **Standardize imports before starting** - Each agent must standardize import paths in their assigned files before making any changes
2. **Follow existing code patterns** and project conventions
3. **Include comprehensive TypeScript types** for all new components
4. **Document all public APIs** and migration changes
5. **Follow shadcn conventions** for component structure and naming exactly
6. **Use automated migration scripts** where provided
7. **Validate no regressions** in existing functionality
8. **Ensure accessibility compliance** with WCAG standards
9. **Research community patterns** for complex components before implementation

### Import Standardization Requirement:
**Every agent must run this before starting their assigned PR:**
```bash
#!/bin/bash
# Standardize imports in assigned files
find [assigned-files] -name "*.tsx" -type f -exec sed -i '' \
  -e 's|from '\''@/components/ui/\*'\''|from "@/components/ui/*"|g' \
  -e 's|from '\''@/lib/\*'\''|from "@/lib/*"|g' \
  -e 's|from '\''@/utils/core'\''|from "@/lib/utils"|g' \
  {} \;
```

### Testing Strategy:
- **Manual testing** for all migrated components
- **Visual verification** for UI consistency
- **Functional testing** for component interactions
- **Accessibility verification** with screen readers
- **Cross-browser testing** for compatibility
- **UI testing strategy** to be determined in future planning sessions

This migration plan provides the detailed, specific approach needed to successfully transition Flowglad to a fully shadcn-based component system while maintaining quality, performance, and user experience standards.
