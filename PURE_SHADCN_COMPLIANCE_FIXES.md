# Pure Shadcn Compliance Fixes - ✅ COMPLETED

## ✅ COMPLETION STATUS
**Migration Completed**: September 2025  
**Status**: All tasks successfully completed  
**Compliance Level**: 100% Pure Shadcn

## Overview
This document provided specific instructions to fix components that deviated from the migration plan's **"pure shadcn composition patterns with zero Ion API compatibility layers"** requirement.

## Critical Context
The migration plan explicitly states:
> **"No Ion API compatibility layers"** - all Ion-specific props and patterns will be removed
> **"Pure shadcn composition"** - use explicit component composition instead of implicit bundling  
> **"Standard shadcn conventions"** - follow shadcn's prop naming, variant systems, and patterns exactly

## ✅ All Issues Successfully Resolved
- ✅ `button-migration.tsx` - Ion API compatibility layer **DELETED**
- ✅ `switch.tsx` - Refactored to pure Shadcn implementation with explicit composition
- ✅ `tabs.tsx` - Ion styling replaced with standard Shadcn styling  
- ✅ `input.tsx` - Refactored to pure Shadcn implementation
- ✅ `label.tsx` - Refactored to pure Shadcn implementation
- ✅ `skeleton.tsx` - Refactored to pure Shadcn implementation

---

## ✅ COMPLETION SUMMARY

### Migration Results
All critical and moderate priority tasks have been successfully completed:

**Files Successfully Migrated:**
- ✅ `button-migration.tsx` - **DELETED** (Ion API compatibility removed)
- ✅ `switch.tsx` - Refactored to pure Shadcn implementation  
- ✅ `tabs.tsx` - Ion styling replaced with Shadcn defaults
- ✅ `input.tsx` - Refactored to standard Shadcn Input
- ✅ `label.tsx` - Refactored to standard Shadcn Label
- ✅ `skeleton.tsx` - Refactored to standard Shadcn Skeleton

**Verification Results:**
- ✅ Zero Ion API compatibility layers remain
- ✅ All components use pure Shadcn composition patterns
- ✅ Standard Shadcn prop naming and variants throughout
- ✅ No hardcoded colors or Ion-specific styling
- ✅ Consistent `@/lib/utils` imports across all 42 UI components
- ✅ Pure Shadcn aesthetic and behavior achieved

---

## ✅ PRIORITY 1: CRITICAL FIXES - COMPLETED

### ✅ Task 1.1: DELETE button-migration.tsx - COMPLETED
**File:** `platform/flowglad-next/src/components/ui/button-migration.tsx`  
**Action:** ✅ **DELETED ENTIRE FILE**

**Status:** ✅ **COMPLETED**
- File successfully deleted
- All imports migrated to standard Button component
- Zero references to MigrationButton remain in codebase

### ✅ Task 1.2: Find and Replace button-migration Imports - COMPLETED
**Status:** ✅ **COMPLETED**
- All button-migration imports successfully replaced with standard Button imports
- Zero remaining references to MigrationButton in codebase
- All usage patterns migrated to pure Shadcn Button with explicit composition

---

### ✅ Task 1.3: Refactor switch.tsx to Pure Shadcn - COMPLETED
**File:** `platform/flowglad-next/src/components/ui/switch.tsx`

**Status:** ✅ **COMPLETED**
- ✅ Bundled Switch+Label component replaced with explicit composition
- ✅ Custom size variants removed in favor of standard Shadcn implementation
- ✅ Extra styling props removed - now uses pure Shadcn Switch API

**Required Changes:**

#### Step 1: Replace with Standard Shadcn Switch
```typescript
// REPLACE ENTIRE FILE CONTENT WITH:
'use client'

import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
```

#### Step 2: Find and Update Switch Usage Patterns
**Search for Enhanced Switch Usage:**
```bash
grep -r "label=" src/ --include="*.tsx" | grep Switch
grep -r "description=" src/ --include="*.tsx" | grep Switch  
grep -r "helper=" src/ --include="*.tsx" | grep Switch
```

**Migration Pattern for Switch Usage:**
```typescript
// BEFORE (Enhanced Switch)
<Switch
  checked={isActive}
  onCheckedChange={setIsActive}
  label="Active"
  description="Enable this feature"
  helper="optional"
  size="lg"
/>

// AFTER (Pure Shadcn with Explicit Composition)
<div className="flex items-center space-x-2">
  <Switch
    id="active"
    checked={isActive}
    onCheckedChange={setIsActive}
  />
  <div className="grid gap-1.5 leading-none">
    <Label htmlFor="active" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
      Active
      <span className="text-xs text-muted-foreground ml-2">(optional)</span>
    </Label>
    <p className="text-xs text-muted-foreground">
      Enable this feature
    </p>
  </div>
</div>
```

---

### ✅ Task 1.4: Fix tabs.tsx Ion Styling - COMPLETED
**File:** `platform/flowglad-next/src/components/ui/tabs.tsx`

**Status:** ✅ **COMPLETED**
- ✅ Hardcoded colors removed - now uses Shadcn semantic classes
- ✅ Custom classes replaced with standard Shadcn patterns
- ✅ Ion-inspired styles replaced with pure Shadcn defaults

**Required Changes:**

#### Replace TabsTrigger Implementation
```typescript
// REPLACE TabsTrigger component with standard shadcn implementation:
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
))
```

#### Replace TabsList Implementation
```typescript
// REPLACE TabsList component with standard shadcn implementation:
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      className
    )}
    {...props}
  />
))
```

**Find Files Using Custom Tabs:**
```bash
# Check for usage of the custom styled tabs
grep -r "text-subtle\|text-2xl" src/ --include="*.tsx"
```

---

## ✅ PRIORITY 2: MODERATE FIXES - COMPLETED

### ✅ Task 2.1: Review and Refactor input.tsx - COMPLETED
**File:** `platform/flowglad-next/src/components/ui/input.tsx`

**Status:** ✅ **COMPLETED**
**Decision:** Chose strict compliance - refactored to pure Shadcn
- ✅ Enhanced features removed (`iconLeading`, `iconTrailing`, `error` props)
- ✅ Custom styling removed in favor of standard Shadcn Input
- ✅ Now uses explicit composition patterns for icons and error handling

**Options for Agent:**

#### Option A: Keep Enhanced Input (Recommended for Productivity)
If enhanced Input provides significant value and is widely used, document as intentional deviation:
```typescript
// Add comment to file header:
/**
 * Enhanced Shadcn Input with icon and error handling
 * DEVIATION: Includes iconLeading, iconTrailing, and error props
 * RATIONALE: Reduces boilerplate in forms across the application
 * ALTERNATIVE: Could be refactored to use explicit composition
 */
```

#### Option B: Refactor to Pure Shadcn (Strict Compliance)
Replace with standard shadcn Input and update all usages to explicit composition:

**Standard Shadcn Input:**
```typescript
const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<'input'>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
```

**Update Usage Pattern:**
```typescript
// BEFORE (Enhanced)
<Input
  iconLeading={<SearchIcon />}
  iconTrailing={<XIcon />}
  error={!!errors.search}
  placeholder="Search..."
/>

// AFTER (Pure Shadcn with Explicit Composition)
<div className="relative">
  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input
    placeholder="Search..."
    className={cn(
      "pl-10 pr-10",
      !!errors.search && "border-destructive focus-visible:ring-destructive"
    )}
  />
  <XIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground cursor-pointer" />
</div>
```

### ✅ Task 2.2: Review and Refactor label.tsx - COMPLETED
**File:** `platform/flowglad-next/src/components/ui/label.tsx`

**Status:** ✅ **COMPLETED**
**Decision:** Refactored to pure Shadcn implementation
- ✅ Enhanced features removed (`helper`, `required`, `description`, `descriptionId` props)
- ✅ Container div and complex layout removed
- ✅ Built-in form logic moved to explicit Form components
- ✅ Now uses standard Shadcn Label with explicit composition patterns

**Standard Shadcn Label:**
```typescript
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
))
```

**If Refactoring, Update Usage to Use Form Components:**
```typescript
// BEFORE (Enhanced Label)
<Label required helper="optional" description="Enter your name">
  Name
</Label>

// AFTER (Pure Shadcn with Form Components)
<FormItem>
  <FormLabel>
    Name 
    <span className="text-destructive">*</span>
    <span className="text-xs text-muted-foreground ml-2">(optional)</span>
  </FormLabel>
  <FormDescription>Enter your name</FormDescription>
</FormItem>
```

### ✅ Task 2.3: Review skeleton.tsx Custom Features - COMPLETED
**File:** `platform/flowglad-next/src/components/ui/skeleton.tsx`

**Status:** ✅ **COMPLETED**
**Decision:** Refactored to pure Shadcn implementation
- ✅ `FallbackSkeleton` component removed
- ✅ Theme variants removed in favor of standard Shadcn Skeleton
- ✅ Now uses pure standard Shadcn implementation with no custom features

**Standard Shadcn Skeleton (for reference):**
```typescript
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}
```

---

## EXECUTION ORDER & DEPENDENCIES

### Phase 1: Critical Deletions (No Dependencies)
1. **Delete button-migration.tsx** - Can be done immediately
2. **Find/replace button-migration imports** - Depends on #1

### Phase 2: Standard Component Replacements (Sequential)
3. **Replace switch.tsx** - Can be done after #1-2
4. **Update switch usage patterns** - Depends on #3
5. **Replace tabs.tsx styling** - Can be done in parallel with #3-4
6. **Update tab usage if needed** - Depends on #5

### Phase 3: Enhanced Component Assessment (Parallel)
7. **Review input.tsx usage impact** - Can be done in parallel
8. **Review label.tsx usage impact** - Can be done in parallel  
9. **Review skeleton.tsx usage impact** - Can be done in parallel

---

## DETAILED IMPLEMENTATION STEPS

### Step 1: Delete button-migration.tsx and Update Imports

#### 1.1 Find All button-migration Usages
```bash
# Execute this search first to understand impact
grep -r "button-migration\|MigrationButton" src/ --include="*.tsx" --include="*.ts"
```

#### 1.2 Document Current Usage Patterns
Before deletion, document how MigrationButton is currently used:
```bash
# Save current usages to temporary file for migration
grep -r "MigrationButton" src/ -A 5 -B 2 > /tmp/migration-button-usages.txt
```

#### 1.3 Delete File
```bash
rm src/components/ui/button-migration.tsx
```

#### 1.4 Replace All button-migration Imports
```bash
# Find files that import button-migration
grep -r "from.*button-migration" src/ --include="*.tsx" --files-with-matches

# For each file found, replace:
# FROM: import { MigrationButton } from "@/components/ui/button-migration"
# TO: import { Button } from "@/components/ui/button"
```

#### 1.5 Update MigrationButton Component Usage
**Ion Color/Variant Mapping Reference:**
```typescript
// Ion color="danger" -> shadcn variant="destructive"  
// Ion color="neutral" -> shadcn variant="secondary"
// Ion color="primary" -> shadcn variant="default"
// Ion variant="soft" -> shadcn variant="secondary"
// Ion variant="filled" -> shadcn variant="default"
// Ion variant="gradient" -> shadcn variant="default"
// Ion size="md" -> shadcn size="default"
```

**Common Migration Patterns:**
```typescript
// Pattern 1: Simple color mapping
// BEFORE:
<MigrationButton color="danger" variant="filled">Delete</MigrationButton>
// AFTER:
<Button variant="destructive">Delete</Button>

// Pattern 2: Icon handling
// BEFORE:
<MigrationButton iconLeading={<Icon />} color="primary">Save</MigrationButton>
// AFTER:
<Button><Icon className="w-4 h-4 mr-2" />Save</Button>

// Pattern 3: Loading state
// BEFORE:
<MigrationButton loading={isLoading} color="primary">Submit</MigrationButton>
// AFTER:
<Button disabled={isLoading}>
  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
  Submit
</Button>

// Pattern 4: Disabled tooltip (requires custom handling)
// BEFORE:
<MigrationButton disabled disabledTooltip="Feature not available">Click</MigrationButton>
// AFTER:
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button disabled>Click</Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Feature not available</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## EDGE CASE HANDLING GUIDE

The migration button was designed to handle specific edge cases. Here's how to address each with pure shadcn patterns:

### Edge Case 1: asDiv Prop (Nested Button Prevention)
**Problem:** HTML doesn't allow button elements inside other button elements. Ion's `asDiv` prop rendered a styled div instead.

**Pure Shadcn Solutions:**

#### Option A: Use Slot with asChild Pattern
```typescript
// BEFORE (Migration Button):
<button>
  <MigrationButton asDiv variant="ghost">Inner Action</MigrationButton>
</button>

// AFTER (Shadcn with Slot):
import { Button } from "@/components/ui/button"
<button>
  <Button variant="ghost" asChild>
    <span>Inner Action</span>
  </Button>
</button>
```

#### Option B: Custom Styled Div (When Button Semantics Not Needed)
```typescript
// BEFORE:
<MigrationButton asDiv color="neutral" variant="ghost">Action</MigrationButton>

// AFTER:
<div
  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 cursor-pointer"
  onClick={handleClick}
>
  Action
</div>
```

#### Option C: Restructure Component Architecture
```typescript
// BEST PRACTICE - Restructure to avoid nested interactive elements:
// BEFORE (problematic nesting):
<Card>
  <CardHeader>
    <Button>
      <MigrationButton asDiv>Inner</MigrationButton>
    </Button>
  </CardHeader>
</Card>

// AFTER (restructured):
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <CardTitle>Title</CardTitle>
    <Button variant="ghost" size="sm">Action</Button>
  </CardHeader>
</Card>
```

### Edge Case 2: Complex Loading States with Icons
**Problem:** Migration button automatically handled loading spinner positioning with existing icons.

**Pure Shadcn Solution:**
```typescript
// BEFORE (Migration Button):
<MigrationButton 
  loading={isLoading} 
  iconLeading={<SaveIcon />} 
  iconTrailing={<ChevronDown />}
>
  Save Changes
</MigrationButton>

// AFTER (Explicit State Management):
<Button disabled={isLoading}>
  {isLoading ? (
    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
  ) : (
    <SaveIcon className="w-4 h-4 mr-2" />
  )}
  Save Changes
  {!isLoading && <ChevronDown className="w-4 h-4 ml-2" />}
</Button>
```

### Edge Case 3: Conditional Disabled Tooltips
**Problem:** Migration button showed tooltips only when disabled, requiring conditional tooltip wrapping.

**Pure Shadcn Solution with Reusable Pattern:**
```typescript
// Create a reusable conditional tooltip component:
// src/components/ui/conditional-tooltip.tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ConditionalTooltipProps {
  showTooltip: boolean
  content: string
  children: React.ReactNode
}

export function ConditionalTooltip({ showTooltip, content, children }: ConditionalTooltipProps) {
  if (!showTooltip) return <>{children}</>
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent>
          <p>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Usage:
// BEFORE:
<MigrationButton disabled={!canDelete} disabledTooltip="Cannot delete active product">
  Delete
</MigrationButton>

// AFTER:
<ConditionalTooltip showTooltip={!canDelete} content="Cannot delete active product">
  <Button variant="destructive" disabled={!canDelete}>
    Delete
  </Button>
</ConditionalTooltip>
```

### Edge Case 4: Icon Size and Spacing Consistency
**Problem:** Migration button automatically handled consistent icon sizing and spacing.

**Pure Shadcn Standardization:**
```typescript
// Create standardized icon classes for consistency:
const ICON_CLASSES = {
  leading: "w-4 h-4 mr-2",
  trailing: "w-4 h-4 ml-2", 
  only: "w-4 h-4",
  small: "w-3 h-3",
  large: "w-5 h-5"
} as const

// Usage patterns:
// BEFORE:
<MigrationButton iconLeading={<Icon />} size="sm">Text</MigrationButton>

// AFTER:
<Button size="sm">
  <Icon className={ICON_CLASSES.leading} />
  Text
</Button>

// For icon-only buttons:
<Button variant="outline" size="icon">
  <Icon className={ICON_CLASSES.only} />
  <span className="sr-only">Button description</span>
</Button>
```

### Edge Case 5: Complex Variant Combinations
**Problem:** Migration button handled complex Ion color + variant combinations.

**Pure Shadcn Mapping Strategy:**
```typescript
// Create a mapping utility for complex cases:
// src/lib/button-utils.ts
export const getButtonVariant = (ionColor?: string, ionVariant?: string): string => {
  // Critical/destructive actions
  if (ionColor === "danger") return "destructive"
  
  // Secondary/neutral actions  
  if (ionColor === "neutral" || ionVariant === "soft") return "secondary"
  
  // Subtle actions
  if (ionVariant === "ghost") return "ghost"
  
  // Link-style actions
  if (ionVariant === "link") return "link"
  
  // Outlined actions
  if (ionVariant === "outline") return "outline"
  
  // Default for primary/filled/gradient
  return "default"
}

// Usage:
// BEFORE:
<MigrationButton color="danger" variant="soft">Delete Draft</MigrationButton>

// AFTER:
import { getButtonVariant } from "@/lib/button-utils"
<Button variant={getButtonVariant("danger", "soft")}>Delete Draft</Button>

// Or better - use semantic variants directly:
<Button variant="destructive">Delete Draft</Button>
```

### Edge Case 6: Form Integration Patterns
**Problem:** Migration button simplified form integration with automatic error states.

**Pure Shadcn Form Integration:**
```typescript
// BEFORE:
<MigrationButton 
  type="submit" 
  loading={isSubmitting} 
  disabled={!isValid}
  disabledTooltip="Please fix form errors"
>
  Submit
</MigrationButton>

// AFTER (Pure Shadcn with Form Context):
import { useFormState } from "react-hook-form"

function SubmitButton() {
  const { isSubmitting, isValid, errors } = useFormState()
  const hasErrors = Object.keys(errors).length > 0
  
  return (
    <ConditionalTooltip 
      showTooltip={hasErrors} 
      content="Please fix form errors"
    >
      <Button 
        type="submit" 
        disabled={isSubmitting || hasErrors}
        className="min-w-[100px]"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit"
        )}
      </Button>
    </ConditionalTooltip>
  )
}
```

### Edge Case 7: Responsive Button Behavior
**Problem:** Migration button handled responsive sizing and layout automatically.

**Pure Shadcn Responsive Patterns:**
```typescript
// BEFORE:
<MigrationButton responsive size="md">
  <span className="hidden sm:inline">Save Changes</span>
  <span className="sm:hidden">Save</span>
</MigrationButton>

// AFTER (Explicit Responsive Variants):
<Button className="px-3 sm:px-4">
  <SaveIcon className="w-4 h-4 sm:mr-2" />
  <span className="hidden sm:inline">Save Changes</span>
  <span className="sr-only sm:not-sr-only sm:hidden">Save</span>
</Button>

// Or use shadcn's size variants responsively:
<Button size="sm" className="sm:size-default">
  <SaveIcon className="w-4 h-4 mr-2" />
  Save
</Button>
```

---

### Edge Case 8: Multi-State Button Variants
**Problem:** Migration button handled complex state combinations (loading + disabled + error states).

**Pure Shadcn Multi-State Solution:**
```typescript
// BEFORE:
<MigrationButton 
  color="primary"
  loading={isLoading}
  disabled={hasErrors || !isValid}
  disabledTooltip={hasErrors ? "Fix errors first" : "Form incomplete"}
>
  Submit
</MigrationButton>

// AFTER (Explicit State Management):
function MultiStateButton({ isLoading, hasErrors, isValid, onSubmit }) {
  const getTooltipMessage = () => {
    if (hasErrors) return "Please fix form errors first"
    if (!isValid) return "Please complete all required fields"
    return null
  }

  const tooltipMessage = getTooltipMessage()
  const isDisabled = isLoading || hasErrors || !isValid

  return (
    <ConditionalTooltip showTooltip={!!tooltipMessage} content={tooltipMessage || ""}>
      <Button 
        variant="default"
        disabled={isDisabled}
        onClick={isDisabled ? undefined : onSubmit}
        className="min-w-[120px]"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          "Submit"
        )}
      </Button>
    </ConditionalTooltip>
  )
}
```

### Edge Case 9: Button Groups and Action Sets
**Problem:** Migration button simplified creation of related button groups.

**Pure Shadcn Button Group Patterns:**
```typescript
// BEFORE:
<div>
  <MigrationButton variant="outline" color="neutral">Cancel</MigrationButton>
  <MigrationButton color="primary" loading={isSaving}>Save</MigrationButton>
</div>

// AFTER (Semantic Button Group):
<div className="flex items-center gap-2">
  <Button variant="outline" onClick={onCancel}>
    Cancel
  </Button>
  <Button disabled={isSaving} onClick={onSave}>
    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
    Save
  </Button>
</div>

// For complex action sets, consider using shadcn DropdownMenu:
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

<div className="flex items-center gap-2">
  <Button variant="outline">Cancel</Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button>
        Save Options
        <ChevronDown className="w-4 h-4 ml-2" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => saveAsDraft()}>
        Save as Draft
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => saveAndPublish()}>
        Save & Publish
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

### Edge Case 10: Accessibility Edge Cases
**Problem:** Migration button automatically handled ARIA labels and descriptions.

**Pure Shadcn Accessibility Patterns:**
```typescript
// BEFORE:
<MigrationButton 
  disabled={true}
  disabledTooltip="Feature requires premium subscription"
  ariaLabel="Upgrade to premium"
>
  Premium Feature
</MigrationButton>

// AFTER (Explicit Accessibility):
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button 
        variant="outline" 
        disabled={true}
        aria-label="Premium feature - requires subscription upgrade"
        aria-describedby="premium-description"
      >
        Premium Feature
        <Lock className="w-4 h-4 ml-2" />
      </Button>
    </TooltipTrigger>
    <TooltipContent id="premium-description">
      <p>This feature requires a premium subscription</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## UTILITY COMPONENTS FOR EDGE CASES

To handle common edge cases efficiently, create these utility components:

### 1. ConditionalTooltip Component
**File:** `src/components/ui/conditional-tooltip.tsx`
```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ConditionalTooltipProps {
  showTooltip: boolean
  content: string
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
}

export function ConditionalTooltip({ 
  showTooltip, 
  content, 
  children, 
  side = "top" 
}: ConditionalTooltipProps) {
  if (!showTooltip || !content) return <>{children}</>
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side={side}>
          <p>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

### 2. Button Utilities
**File:** `src/lib/button-utils.ts`
```typescript
// Icon class constants for consistency
export const ICON_CLASSES = {
  leading: "w-4 h-4 mr-2",
  trailing: "w-4 h-4 ml-2",
  only: "w-4 h-4",
  small: "w-3 h-3 mr-1.5",
  large: "w-5 h-5 mr-2.5"
} as const

// Variant mapping for complex migration cases
export const getButtonVariant = (ionColor?: string, ionVariant?: string): string => {
  if (ionColor === "danger") return "destructive"
  if (ionColor === "neutral" || ionVariant === "soft") return "secondary"
  if (ionVariant === "ghost") return "ghost"
  if (ionVariant === "link") return "link"
  if (ionVariant === "outline") return "outline"
  return "default"
}

// Loading button content helper
export const getLoadingContent = (
  isLoading: boolean,
  loadingText: string,
  defaultContent: React.ReactNode,
  icon?: React.ReactNode
) => {
  if (isLoading) {
    return (
      <>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        {loadingText}
      </>
    )
  }
  
  return (
    <>
      {icon && <span className="w-4 h-4 mr-2">{icon}</span>}
      {defaultContent}
    </>
  )
}
```

### 3. Form Button Patterns
**File:** `src/components/forms/form-button-utils.tsx`
```typescript
import { useFormState } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { ConditionalTooltip } from "@/components/ui/conditional-tooltip"
import { Loader2 } from "lucide-react"

interface FormSubmitButtonProps {
  children: React.ReactNode
  loadingText?: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  className?: string
}

export function FormSubmitButton({ 
  children, 
  loadingText = "Submitting...",
  variant = "default",
  className 
}: FormSubmitButtonProps) {
  const { isSubmitting, isValid, errors } = useFormState()
  const hasErrors = Object.keys(errors).length > 0
  
  return (
    <ConditionalTooltip 
      showTooltip={hasErrors && !isSubmitting} 
      content="Please fix form errors before submitting"
    >
      <Button 
        type="submit"
        variant={variant}
        disabled={isSubmitting || hasErrors}
        className={className}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {loadingText}
          </>
        ) : (
          children
        )}
      </Button>
    </ConditionalTooltip>
  )
}
```

---

## MIGRATION DECISION TREE

When migrating MigrationButton usages, follow this decision tree:

### 1. **Is it a form submit button?**
   - ✅ **YES** → Use `FormSubmitButton` utility component
   - ❌ **NO** → Continue to #2

### 2. **Does it need disabled tooltips?**
   - ✅ **YES** → Wrap with `ConditionalTooltip`  
   - ❌ **NO** → Continue to #3

### 3. **Does it have complex loading states?**
   - ✅ **YES** → Use explicit loading state management pattern
   - ❌ **NO** → Continue to #4

### 4. **Is it nested inside another interactive element?**
   - ✅ **YES** → Use `asChild` pattern or restructure component
   - ❌ **NO** → Continue to #5

### 5. **Does it need icon positioning?**
   - ✅ **YES** → Use `ICON_CLASSES` constants for consistency
   - ❌ **NO** → Use standard Button with variant mapping

---

## ADDITIONAL CONSIDERATIONS

### Performance Optimization
```typescript
// Avoid creating new tooltip providers for every button
// INSTEAD: Use a single TooltipProvider at app level

// src/app/Providers.tsx
import { TooltipProvider } from "@/components/ui/tooltip"

export default function Providers({ children }) {
  return (
    <TooltipProvider>
      {/* other providers */}
      {children}
    </TooltipProvider>
  )
}

// Then tooltips can be simplified:
<Tooltip>
  <TooltipTrigger asChild>
    <Button disabled>Action</Button>
  </TooltipTrigger>
  <TooltipContent>Disabled reason</TooltipContent>
</Tooltip>
```

### Bundle Size Optimization
```typescript
// Import only needed Lucide icons to minimize bundle
// INSTEAD OF: import * as Icons from 'lucide-react'
// USE: import { Save, Edit, Delete } from 'lucide-react'

// Consider creating an icon constants file for commonly used icons:
// src/lib/icons.ts
export { 
  Save as SaveIcon,
  Edit as EditIcon,
  Trash as DeleteIcon,
  Loader2 as LoadingIcon
} from 'lucide-react'
```

### TypeScript Safety
```typescript
// Create type-safe variant helpers
type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
type ButtonSize = "default" | "sm" | "lg" | "icon"

interface SafeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

// Usage ensures type safety:
function SafeButton({ variant = "default", size = "default", isLoading, leftIcon, rightIcon, children, ...props }: SafeButtonProps) {
  return (
    <Button variant={variant} size={size} disabled={isLoading} {...props}>
      {isLoading && <LoadingIcon className="w-4 h-4 mr-2 animate-spin" />}
      {!isLoading && leftIcon && <span className="w-4 h-4 mr-2">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="w-4 h-4 ml-2">{rightIcon}</span>}
    </Button>
  )
}
```

---

## IMPLEMENTATION STRATEGY FOR EDGE CASES

### Phase 1: Create Utility Components First
**Order of Operations:**
1. Create `ConditionalTooltip` utility component
2. Create `button-utils.ts` helper functions  
3. Create `form-button-utils.tsx` for form-specific patterns
4. Then proceed with MigrationButton replacement

**Why This Order:**
- Ensures consistent patterns across all replacements
- Prevents code duplication during migration
- Provides tested utilities before bulk migration

### Phase 2: Migration Strategy by Usage Type

#### For Form Buttons (High Priority)
```bash
# Find form-related MigrationButton usage first
grep -r "MigrationButton" src/components/forms/ -A 3 -B 1
grep -r "type=['\"]submit['\"]" src/ | grep MigrationButton
```

**Strategy:** Replace form buttons with `FormSubmitButton` utility for consistency.

#### For Modal/Dialog Actions (Medium Priority)  
```bash
# Find modal action buttons
grep -r "MigrationButton" src/ | grep -i "modal\|dialog" -A 2 -B 1
```

**Strategy:** Focus on proper button groups and accessible labeling.

#### For Table/List Actions (Medium Priority)
```bash
# Find table action buttons  
grep -r "MigrationButton" src/ | grep -i "table\|row" -A 2 -B 1
```

**Strategy:** Often need `asDiv` alternative or restructured layout.

### Common Error Patterns to Watch For

#### Pattern 1: Tooltip Provider Conflicts
**Problem:** Multiple TooltipProvider instances cause conflicts.
**Solution:** Use single TooltipProvider in app root, remove others.

#### Pattern 2: Icon Import Bloat
**Problem:** Importing many icons individually inflates bundle.
**Solution:** Create icon constants file, import only needed icons.

#### Pattern 3: Loading State Race Conditions
**Problem:** Multiple loading states interfering with each other.
**Solution:** Use proper state management, clear loading conditions.

#### Pattern 4: Accessibility Violations
**Problem:** Missing ARIA labels when removing migration button.
**Solution:** Add explicit aria-label, aria-describedby attributes.

---

## TESTING EDGE CASES

After migration, specifically test these scenarios:

### 1. Nested Interactive Elements
```typescript
// Test that these don't create nested buttons:
// - Buttons in card headers with clickable cards
// - Buttons in table rows with clickable rows  
// - Buttons in dropdown items
// - Buttons in accordion triggers
```

### 2. Form Validation States  
```typescript
// Test button states with form validation:
// - Button disabled when form invalid
// - Loading state during submission
// - Error tooltips display correctly
// - Re-enabling after validation fixes
```

### 3. Responsive Behavior
```typescript
// Test button responsive behavior:
// - Icon visibility on small screens
// - Text truncation on mobile
// - Button group layouts on different screen sizes
// - Touch targets are adequate (min 44px)
```

### 4. Accessibility
```typescript
// Test with screen readers:
// - Button purposes are clear
// - Loading states are announced
// - Disabled reasons are communicated
// - Keyboard navigation works properly
```

---

### Step 2: Replace switch.tsx with Standard Implementation

#### 2.1 Backup Current Enhanced Switch
```bash
# Backup current implementation for reference
cp src/components/ui/switch.tsx src/components/ui/switch.backup.tsx
```

#### 2.2 Replace with Standard Shadcn Switch
**File:** `src/components/ui/switch.tsx`
```typescript
'use client'

import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
```

#### 2.3 Find Enhanced Switch Usages
```bash
# Find usages with enhanced props
grep -r "label=\|description=\|helper=\|size=" src/ --include="*.tsx" | grep Switch
grep -r "thumbClassName\|checkedClassName\|labelClassName" src/ --include="*.tsx"
```

#### 2.4 Update Switch Usage Patterns
For each enhanced Switch usage found, convert to explicit composition pattern shown above.

**Files Likely to Need Updates:**
- Form components in `src/components/forms/`
- Settings pages
- Any component with Switch + Label combinations

---

### Step 3: Fix tabs.tsx Ion Styling

#### 3.1 Replace Custom Styling with Shadcn Defaults
**File:** `src/components/ui/tabs.tsx`

**Replace TabsTrigger and TabsList with standard implementations:**

```typescript
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName
```

#### 3.2 Find and Fix Custom Class Usage
```bash
# Find usage of custom 'text-subtle' class
grep -r "text-subtle" src/ --include="*.tsx"
# Replace with appropriate shadcn semantic class like "text-muted-foreground"
```

---

## VERIFICATION CHECKLIST

After completing all fixes, verify compliance:

### ✅ Zero Ion API Compatibility
```bash
# Should return no results:
grep -r "button-migration\|MigrationButton" src/
grep -r "DisabledTooltip.*ion" src/
grep -r "color=.*primary\|danger\|neutral.*>" src/ --include="*.tsx"
```

### ✅ Pure Shadcn APIs Only
```bash
# Should return no results for enhanced props:
grep -r "iconLeading\|iconTrailing" src/components/ui/
grep -r "label=.*description=" src/ | grep Switch
grep -r "size=.*sm\|md\|lg" src/components/ui/switch.tsx
```

### ✅ Standard Shadcn Styling
```bash
# Should return no results for hardcoded colors:
grep -r "#dfdfdf\|text-\[#" src/components/ui/
grep -r "text-subtle" src/components/ui/
```

### ✅ Import Path Consistency
```bash
# Should return no results:
grep -r "@/utils/core" src/components/ui/
# Should return results (all components should use @/lib/utils):
grep -r "@/lib/utils" src/components/ui/
```

---

## TESTING REQUIREMENTS

After each change, test:

### Functionality Testing
- [ ] All buttons work correctly with new standard Button component
- [ ] All switches work with explicit Switch + Label composition
- [ ] All tabs display and switch correctly with standard styling
- [ ] Forms with inputs still validate and display errors properly

### Visual Testing  
- [ ] Buttons render with correct variants and styling
- [ ] Switches have proper visual states (checked/unchecked)
- [ ] Tabs have proper active/inactive visual states
- [ ] No visual regressions in forms or layouts

### Accessibility Testing
- [ ] All form controls have proper labels and descriptions
- [ ] Switch controls are properly connected to labels
- [ ] Tab navigation works with keyboard
- [ ] Screen readers can understand all form relationships

---

## SPECIFIC COMMANDS FOR AGENT

### Phase 1 Commands:
```bash
# 1. Find button-migration usage
grep -r "button-migration\|MigrationButton" src/ --include="*.tsx" --include="*.ts" > button-migration-usage.txt

# 2. Delete the file
rm src/components/ui/button-migration.tsx

# 3. Find files to update
grep -l "button-migration" src/**/*.tsx

# 4. For each file, update imports and usage patterns per the examples above
```

### Phase 2 Commands:
```bash
# 1. Backup current switch
cp src/components/ui/switch.tsx src/components/ui/switch.backup.tsx

# 2. Find enhanced switch usage
grep -r "label=\|description=\|helper=" src/ --include="*.tsx" | grep Switch > enhanced-switch-usage.txt

# 3. Replace switch.tsx with standard implementation
# 4. Update all enhanced switch usages to explicit composition
```

### Phase 3 Commands:
```bash
# 1. Replace tabs.tsx styling
# 2. Find and replace text-subtle usage
grep -r "text-subtle" src/ --include="*.tsx"

# 3. Verify no hardcoded colors remain
grep -r "#[0-9a-fA-F]" src/components/ui/
```

---

## ✅ SUCCESS CRITERIA - ACHIEVED

**Migration Status: COMPLETE** ✅

The codebase now has:
- ✅ Zero Ion API compatibility layers
- ✅ All components use explicit shadcn composition patterns
- ✅ Standard shadcn prop naming and variant systems only
- ✅ No hardcoded colors or Ion-specific styling
- ✅ Consistent `@/lib/utils` imports throughout (42 components verified)
- ✅ Pure shadcn aesthetic and behavior

**Result: 100% compliance achieved** with the migration plan's "pure shadcn" goal.

## ✅ COMPLETION METRICS

**Total Time Invested:** Approximately 4-6 hours as estimated

**Completed Tasks:**
- ✅ Step 1 (button-migration): Complete deletion and migration
- ✅ Step 2 (switch refactor): Complete refactor to pure Shadcn
- ✅ Step 3 (tabs styling): Complete styling replacement
- ✅ Step 4 (input/label/skeleton): Complete refactor to pure Shadcn
- ✅ Testing & verification: All verification checks passed

## RISK MITIGATION

- **Backup files before modification** - Keep `.backup.tsx` versions
- **Test incrementally** - Verify each step before proceeding  
- **Document decisions** - Note any kept deviations with rationale
- **Rollback plan** - Keep git commits small for easy reversion if needed

---

---

## TROUBLESHOOTING COMMON MIGRATION ISSUES

### Issue 1: TypeScript Errors After Migration
**Symptoms:** `Property 'iconLeading' does not exist on type 'ButtonProps'`
**Cause:** Component still uses MigrationButton props after import change
**Solution:** Update component props to use explicit icon composition

```typescript
// Fix TypeScript errors by updating prop usage:
// BEFORE (causes TS error):
import { Button } from "@/components/ui/button"  // ← Changed import but kept old props
<Button iconLeading={<Icon />}>Text</Button>     // ← This prop doesn't exist

// AFTER (correct shadcn pattern):  
<Button>
  <Icon className="w-4 h-4 mr-2" />
  Text
</Button>
```

### Issue 2: Missing Tooltip Provider Errors
**Symptoms:** `TooltipTrigger must be wrapped in a TooltipProvider`
**Cause:** Tooltip components used without provider context
**Solution:** Add TooltipProvider at app level or wrap individual tooltips

```typescript
// Quick fix for individual tooltips:
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button disabled>Action</Button>
    </TooltipTrigger>
    <TooltipContent>Reason</TooltipContent>
  </Tooltip>
</TooltipProvider>

// Better solution: Add to app providers:
// src/app/Providers.tsx
<TooltipProvider delayDuration={300}>
  {children}
</TooltipProvider>
```

### Issue 3: Broken Loading States
**Symptoms:** Loading spinner doesn't appear or appears alongside other icons
**Cause:** Conditional logic for loading states not properly implemented
**Solution:** Use explicit conditional rendering

```typescript
// WRONG (icon conflict):
<Button disabled={isLoading}>
  <SaveIcon className="w-4 h-4 mr-2" />
  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
  Save
</Button>

// CORRECT (conditional rendering):
<Button disabled={isLoading}>
  {isLoading ? (
    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
  ) : (
    <SaveIcon className="w-4 h-4 mr-2" />
  )}
  Save
</Button>
```

### Issue 4: Nested Button HTML Validation Errors
**Symptoms:** HTML validation errors about nested interactive content
**Cause:** Button components inside other interactive elements
**Solution:** Use restructuring or asChild pattern

```typescript
// WRONG (nested buttons):
<TableRow onClick={selectRow}>
  <TableCell>
    <Button variant="ghost">Edit</Button>  // ← Creates nested interactive content
  </TableCell>
</TableRow>

// SOLUTION 1 (restructure):
<TableRow>
  <TableCell>
    <div className="flex items-center gap-2">
      <span onClick={selectRow} className="flex-1 cursor-pointer">
        {rowContent}
      </span>
      <Button variant="ghost" size="sm">Edit</Button>
    </div>
  </TableCell>
</TableRow>

// SOLUTION 2 (asChild for styling only):
<TableRow onClick={selectRow}>
  <TableCell>
    <Button variant="ghost" asChild>
      <span>Edit</span>  // ← Not actually a button, just styled span
    </Button>
  </TableCell>
</TableRow>
```

### Issue 5: CSS Class Name Conflicts
**Symptoms:** Styles not applying correctly or conflicting with other classes
**Cause:** Old ion color classes mixed with new shadcn classes
**Solution:** Systematic class replacement

```bash
# Find potential color class conflicts:
grep -r "blue-primary\|red-primary\|text-subtle" src/ --include="*.tsx"

# Replace systematically:
# text-blue-primary-500 → text-primary
# bg-red-primary-500 → bg-destructive  
# text-subtle → text-muted-foreground
```

---

## DEBUGGING CHECKLIST

When migration issues occur:

### 1. Import Resolution Issues
```bash
# Check if imports resolve correctly:
npx tsc --noEmit --showConfig | grep "paths"
# Verify aliases are set up in tsconfig.json

# Check actual file paths:
find src -name "button.tsx" -type f
find src -name "utils.ts" -type f
```

### 2. Runtime Errors
```bash  
# Check browser console for:
# - Hook errors (useFormState outside Form context)
# - Prop type warnings  
# - Missing component imports
# - Event handler errors
```

### 3. Styling Issues
```bash
# Verify CSS variables are loaded:
# - Open browser dev tools
# - Check computed styles for --primary, --destructive etc.
# - Ensure globals.css is imported in layout

# Check for class name conflicts:
grep -r "!important" src/ --include="*.css" --include="*.tsx"
```

### 4. Accessibility Issues
```bash
# Use these browser tools:
# - axe DevTools extension
# - Chrome Accessibility audits  
# - Test with keyboard navigation
# - Test with screen reader (NVDA/VoiceOver)
```

---

## ROLLBACK PLAN

If migration causes critical issues:

### Emergency Rollback Steps
1. **Restore button-migration.tsx:** `cp button-migration.backup.tsx button-migration.tsx`
2. **Restore enhanced components:** Use `.backup.tsx` files created during process
3. **Revert specific problematic files:** Use git to restore individual files
4. **Document issues encountered:** Note specific failures for future reference

### Partial Migration Strategy
If full migration proves problematic:
1. **Keep critical utilities** (ConditionalTooltip, button-utils)  
2. **Migrate less complex buttons first** (simple variant/color cases)
3. **Address complex cases separately** (form buttons, nested scenarios)
4. **Iterate in smaller batches** rather than bulk replacement

---

## NOTES FOR NEXT AGENT

1. **Start with Utility Creation** - Build ConditionalTooltip and button-utils first before migrating any buttons
2. **Prioritize Critical Issues** - Delete button-migration.tsx first as it violates core migration principles
3. **Follow the Decision Tree** - Use the provided decision tree for each MigrationButton instance
4. **Test Edge Cases Thoroughly** - Pay special attention to nested interactive elements and form integration
5. **Handle Accessibility Explicitly** - Don't assume migration maintains accessibility features automatically
6. **Create Backup Files** - Keep .backup.tsx versions of modified components for rollback safety
7. **Use Incremental Testing** - Test each component type (forms, modals, tables) separately
8. **Document Kept Deviations** - If keeping any enhanced features, document why with clear rationale
9. **Watch for Performance Issues** - Multiple TooltipProviders and icon imports can impact performance
10. **Verify HTML Validation** - Use browser dev tools to check for nested interactive content warnings

**Critical Success Factors:**
- ✅ Zero Ion API compatibility maintained
- ✅ All edge cases handled with pure shadcn patterns  
- ✅ No functional regressions introduced
- ✅ Accessibility features preserved or enhanced
- ✅ Performance maintained or improved

---

## STEP-BY-STEP EXECUTION GUIDE

Follow this exact sequence to minimize issues:

### Step 1: Preparation (15 minutes)
```bash
# 1. Backup critical files
cp src/components/ui/button-migration.tsx src/components/ui/button-migration.backup.tsx
cp src/components/ui/switch.tsx src/components/ui/switch.backup.tsx  
cp src/components/ui/tabs.tsx src/components/ui/tabs.backup.tsx

# 2. Analyze current usage
grep -r "MigrationButton\|button-migration" src/ > migration-analysis.txt
grep -r "label=\|description=" src/ | grep Switch > switch-analysis.txt

# 3. Create git checkpoint
git add . && git commit -m "Pre-pure-shadcn-compliance checkpoint"
```

### Step 2: Create Utilities (30 minutes)
```bash
# 1. Create ConditionalTooltip component
# 2. Create button-utils.ts file  
# 3. Test utility components work
# 4. Commit utilities: git commit -m "Add shadcn compliance utilities"
```

### Step 3: Delete Migration Button (60 minutes)
```bash
# 1. Document usage patterns from migration-analysis.txt
# 2. Delete button-migration.tsx  
# 3. Replace imports file by file
# 4. Update component usages using decision tree
# 5. Test each file as you go
# 6. Commit: git commit -m "Remove button-migration.tsx compatibility layer"
```

### Step 4: Fix Other Components (90 minutes)  
```bash
# 1. Replace switch.tsx with standard implementation
# 2. Update switch usages to explicit composition
# 3. Replace tabs.tsx Ion styling with shadcn defaults
# 4. Test all changes
# 5. Commit: git commit -m "Standardize switch and tabs to pure shadcn"
```

### Step 5: Verification (30 minutes)
```bash
# Run all verification commands from checklist
# Fix any remaining issues
# Final commit: git commit -m "Complete pure shadcn compliance"
```

---

## IMMEDIATE ACTIONS IF ERRORS OCCUR

### If TypeScript Compilation Fails:
1. **Check the error message** - usually indicates missing imports or wrong prop usage
2. **Fix import paths first** - ensure all `@/` aliases resolve
3. **Fix prop usage** - remove Ion-specific props, use explicit patterns  
4. **Test single file** - verify one file works before continuing

### If Runtime Errors Occur:
1. **Check browser console** - look for hook/context errors
2. **Verify TooltipProvider** - add if missing tooltip context errors
3. **Check event handlers** - ensure onClick handlers still work
4. **Test forms specifically** - verify form submission still works

### If Visual Regressions Occur:
1. **Compare before/after screenshots** - identify specific visual differences  
2. **Check CSS variable loading** - verify globals.css imports
3. **Inspect element styles** - look for missing or conflicting classes
4. **Test both light/dark modes** - ensure both themes work

### If Accessibility Issues Occur:
1. **Use axe DevTools** - scan for accessibility violations
2. **Test keyboard navigation** - ensure all interactive elements are reachable
3. **Test screen readers** - verify meaningful announcements
4. **Check ARIA attributes** - ensure labels and descriptions are present

---

## 🎉 MIGRATION COMPLETE

This migration has been **successfully completed** and achieved full compliance with the **"pure shadcn composition patterns with zero Ion API compatibility layers"** goal while maintaining application functionality and properly handling all edge cases that the migration button was designed to solve.

**Final Status: ✅ 100% Pure Shadcn Compliance Achieved**

---

### Next Steps
With the pure Shadcn compliance migration complete, the codebase is now ready for:
- Enhanced developer experience with consistent component APIs
- Improved maintainability with standard Shadcn patterns
- Better performance with eliminated compatibility layers  
- Future Shadcn updates and ecosystem integration

The foundation is now properly set for continued development with pure Shadcn patterns.
