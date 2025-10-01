# MultiSelect Modal Clipping Issue - Comprehensive Diagnostic Guide

**Last Updated:** October 1, 2025  
**Status:** ⚠️ RESET - All changes reverted, starting fresh debug process  
**Priority:** Critical UX Issue

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Implementation Status](#current-implementation-status)
3. [Technical Architecture](#technical-architecture)
4. [Root Cause Analysis](#root-cause-analysis)
5. [Diagnostic Steps](#diagnostic-steps)
6. [Solution Approaches](#solution-approaches)
7. [Testing Verification](#testing-verification)
8. [References](#references)

---

## Problem Statement

### The Issue

The custom `MultiSelect` component (located at `src/components/forms/MultiSelect.tsx`) experiences visual clipping when used inside modal dialogs. The dropdown list is cut off by the modal's `overflow-hidden` CSS constraint, making most options invisible or inaccessible to users.

### Current Symptoms (Baseline - No Fixes Applied)

**Working:**
- ✅ Component renders inside modal
- ✅ Input field is functional
- ✅ Typing filters the options list
- ✅ Selected items display correctly as badges

**Not Working:**
- ❌ Dropdown is clipped by modal's `overflow-hidden` constraint
- ❌ Most dropdown options are invisible/inaccessible
- ❌ Cannot see or interact with options below the fold

### Affected Components

1. **Create Webhook Modal** - Event Types selection
2. **Edit Webhook Modal** - Event Types selection  
3. **Product Features Modal** - Feature selection
4. Any other modal using `MultiSelect` component

### User Impact

- Users cannot complete webhook creation forms in modals
- Forced to use keyboard-only navigation (accessibility issue)
- Poor user experience affecting form completion rates

---

## Current Implementation Status

### What's Been Implemented

**🔄 ALL CHANGES REVERTED - BASELINE STATE**

The `MultiSelect` component is in its **original state** with no portal-based fixes applied. The component currently suffers from visual clipping when used inside modal dialogs.

#### Current State

```tsx
// File: src/components/forms/MultiSelect.tsx

// Standard implementation with NO portal
// Dropdown renders directly inside the Command component
// Subject to parent modal's overflow constraints

<Command>
  <div>
    <CommandPrimitive.Input />
    {/* Badges */}
  </div>
  
  {/* Dropdown renders inline - gets clipped by modal */}
  <CommandList>
    <CommandEmpty />
    <CommandGroup>
      <CommandItem />
    </CommandGroup>
  </CommandList>
</Command>
```

#### Why We're Starting Fresh

Previous portal-based implementation resulted in:
- ✅ Visual rendering (dropdown escaped modal clipping)
- ❌ Mouse interactions completely broken (no hover, no click)
- ❌ Unknown root cause despite extensive debugging

**Decision:** Revert to baseline and approach systematically with proper diagnostics first, then implement fix based on findings.

---

## Technical Architecture

### Component Structure (Current Baseline)

```
MultiSelect Component
├── Command (cmdk - provides React Context to all children)
│   ├── div (input container)
│   │   ├── CommandPrimitive.Input (with ref={inputRef})
│   │   └── Badges (selected items with X buttons)
│   │
│   └── CommandList (renders inline - subject to parent overflow)
│       ├── CommandEmpty
│       ├── CommandGroup
│       └── CommandItem (multiple)
```

**Note:** This inline structure is why clipping occurs - the CommandList inherits overflow constraints from parent modal.

### Key Dependencies

- **cmdk** (`^1.0.0`): Command palette library providing Command, CommandList, CommandItem
- **React** (`^18`): Portal API for DOM rendering
- **shadcn/ui**: Dialog components with Radix UI primitives

### Modal Dialog Structure

```tsx
// File: src/components/ui/dialog.tsx
<DialogPortal>
  <DialogOverlay />  {/* z-index: 50 */}
  <DialogPrimitive.Content
    className="fixed ... z-50 ... overflow-y-auto"  // ← This overflow clips dropdown
  >
    {children}  {/* WebhookFormFields containing MultiSelect */}
  </DialogPrimitive.Content>
</DialogPortal>
```

**The Clipping Source:** The modal content has `overflow-y-auto` which creates a clipping boundary. Any child elements (like our dropdown) that extend beyond this boundary are hidden.

### Event Flow (Current Baseline)

1. **User focuses input** → `onFocus` sets `open = true`
2. **Dropdown renders inline** → CommandList appears below input
3. **Modal clips dropdown** → Only top portion visible, rest hidden
4. **User can't access options** → Cannot see or click most options

---

## Root Cause Analysis

### Primary Issue: Dropdown Clipping

**Confirmed Root Cause:**  
The modal's `overflow-y-auto` CSS property creates a clipping boundary. The CommandList renders as a child of the modal content, so it's subject to this overflow constraint. When the dropdown extends beyond the modal's visible area, it gets clipped.

### Previous Attempted Fix & Why It Failed

A React Portal solution was implemented but resulted in broken mouse interactions. Hypotheses for why:

#### Hypothesis 1: Z-Index Stacking Context

**The Problem:**  
Even though we set `zIndex: 100` on the dropdown wrapper, it may not be in the correct stacking context relative to the modal.

**Z-Index Hierarchy:**
```
document.body
├── DialogOverlay (z-index: 50, creates stacking context)
├── DialogContent (z-index: 50, creates stacking context)
└── Dropdown Portal (z-index: 100, but may be in different context)
```

**Why It Might Fail:**
- Dialog components may create an **isolated stacking context**
- Transform, opacity, filter, or will-change properties create new contexts
- The dropdown might be visually on top but still "behind" in event capture

**Verification:**
```javascript
// In browser console
document.elementsFromPoint(x, y)
// Should show CommandItem if hover works, but might show DialogOverlay
```

#### Hypothesis 2: Pointer Events Being Captured

**The Problem:**  
The modal overlay or content might be capturing pointer events before they reach the dropdown.

**Potential Culprits:**
1. **DialogOverlay** - Has pointer-events enabled, capturing clicks
2. **Modal event handlers** - React synthetic events might be stopping propagation
3. **Portal timing** - Dropdown might render after event listeners are attached

**CSS Properties to Check:**
```css
/* On modal overlay */
pointer-events: none;  /* Should allow clicks through */
pointer-events: auto;  /* Blocks clicks */

/* On dropdown */
pointer-events: auto;  /* Must be set */
```

#### Hypothesis 3: Click Outside Logic Interference

**The Problem:**  
The `handleClickOutside` function might be closing the dropdown before clicks register.

**Current Implementation:**
```tsx
const handleClickOutside = (event: MouseEvent | TouchEvent) => {
  if (
    dropdownRef.current &&
    !dropdownRef.current.contains(event.target as Node) &&
    inputRef.current &&
    !inputRef.current.contains(event.target as Node)
  ) {
    setOpen(false)
    inputRef.current.blur()
  }
}

// Attached on document
document.addEventListener('mousedown', handleClickOutside)
```

**Issue:**  
If `dropdownRef.current` is null or doesn't contain the CommandItem elements when the event fires, it will close the dropdown immediately.

#### Hypothesis 4: React Synthetic Event Timing

**The Problem:**  
The `onMouseDown` on CommandItem has `e.preventDefault()` and `e.stopPropagation()`, which might interfere with click handling.

**Current CommandItem Handler:**
```tsx
<CommandItem
  onMouseDown={(e) => {
    e.preventDefault()
    e.stopPropagation()
  }}
  onSelect={() => {
    // Selection logic
  }}
>
```

**Issue:**  
cmdk's `onSelect` might rely on click events that are being prevented.

#### Hypothesis 5: Portal Rendering Race Condition

**The Problem:**  
The portal might render slightly after the position is calculated, causing a mismatch.

**Flow:**
1. `open` becomes `true`
2. `useEffect` calculates position → `setDropdownPosition()`
3. Portal renders (next render cycle)
4. But refs might not be attached yet

**Evidence:**  
Check if `dropdownRef.current` is null when clicking.

---

## Diagnostic Steps

**⚠️ IMPORTANT:** Run these diagnostics BEFORE implementing any fix to understand the exact nature of the issue.

### Step 0: Verify Current Clipping Behavior (Baseline)

**Before any fixes, confirm the issue:**

1. **Open a modal with MultiSelect** (e.g., Create Webhook)
2. **Click on the MultiSelect input** to open dropdown
3. **Observe the clipping:**
   ```javascript
   // In browser console
   const dropdown = document.querySelector('[cmdk-list]')
   const modal = dropdown.closest('[role="dialog"]')
   
   console.log('Dropdown rect:', dropdown.getBoundingClientRect())
   console.log('Modal overflow:', window.getComputedStyle(modal).overflow)
   console.log('Is clipped:', dropdown.getBoundingClientRect().bottom > modal.getBoundingClientRect().bottom)
   ```

4. **Document the clipping:**
   - How many pixels are clipped?
   - What's the modal's overflow setting?
   - Does the dropdown have any positioning?

**Expected Findings:**
- Modal has `overflow-y: auto` or `overflow: hidden`
- Dropdown extends beyond modal boundaries
- Dropdown is clipped/hidden

---

### Step 1: Verify Z-Index and Stacking Context (For Portal Solutions)

**Open Chrome DevTools:**

1. **Inspect the dropdown element** when it's open:
   ```
   Right-click dropdown → Inspect
   ```

2. **Check computed z-index:**
   ```
   Computed tab → z-index: ???
   ```

3. **Verify stacking context:**
   ```javascript
   // In console, with dropdown open
   const dropdown = document.querySelector('[style*="position: fixed"]')
   console.log('Dropdown z-index:', window.getComputedStyle(dropdown).zIndex)
   console.log('Parent:', dropdown.parentElement)
   
   const overlay = document.querySelector('[data-radix-dialog-overlay]')
   console.log('Overlay z-index:', window.getComputedStyle(overlay).zIndex)
   ```

4. **Check elements at point:**
   ```javascript
   // Hover over a dropdown item, then in console:
   const rect = document.querySelector('[cmdk-item]').getBoundingClientRect()
   const centerX = rect.left + rect.width / 2
   const centerY = rect.top + rect.height / 2
   
   console.log('Elements at dropdown item:', 
     document.elementsFromPoint(centerX, centerY).map(el => ({
       tag: el.tagName,
       class: el.className,
       zIndex: window.getComputedStyle(el).zIndex
     }))
   )
   ```

**Expected Result:**  
The first element should be the CommandItem or its parent.

**If DialogOverlay appears first:**  
→ Z-index or stacking context issue confirmed.

---

### Step 2: Verify Pointer Events

**Check CSS pointer-events:**

```javascript
// In console, with dropdown open
const dropdown = document.querySelector('[style*="position: fixed"]')
console.log('Dropdown pointer-events:', window.getComputedStyle(dropdown).pointerEvents)

const list = dropdown.querySelector('[cmdk-list]')
console.log('CommandList pointer-events:', window.getComputedStyle(list).pointerEvents)

const item = dropdown.querySelector('[cmdk-item]')
console.log('CommandItem pointer-events:', window.getComputedStyle(item).pointerEvents)

const overlay = document.querySelector('[data-radix-dialog-overlay]')
console.log('Overlay pointer-events:', window.getComputedStyle(overlay).pointerEvents)
```

**Expected:**
- Dropdown, List, Item: `auto`
- Overlay: `auto` (but should be behind)

**If overlay is `auto` and appears before dropdown in elementsFromPoint:**  
→ Need to either increase dropdown z-index or disable overlay pointer-events

---

### Step 3: Verify Refs Are Attached

**Check if dropdownRef is set:**

```javascript
// Add temporary console.log in component
// In handleClickOutside:
console.log('Click outside check:', {
  dropdownRef: dropdownRef.current,
  inputRef: inputRef.current,
  target: event.target,
  containsTarget: dropdownRef.current?.contains(event.target)
})
```

**Also check in render:**

```tsx
// Before the portal
console.log('Rendering portal:', {
  open,
  dropdownPosition,
  hasWindow: typeof window !== 'undefined',
  dropdownRef: dropdownRef.current
})
```

**Expected:**  
`dropdownRef.current` should be a valid HTMLDivElement when dropdown is open.

**If null:**  
→ Ref timing issue, need to ensure ref is set before event listeners

---

### Step 4: Test Event Propagation

**Add event listeners to track flow:**

```javascript
// In console, with dropdown open
const dropdown = document.querySelector('[style*="position: fixed"]')
const item = dropdown.querySelector('[cmdk-item]')

// Track all events
['mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
  item.addEventListener(eventType, (e) => {
    console.log(`${eventType} on item:`, {
      target: e.target,
      currentTarget: e.currentTarget,
      defaultPrevented: e.defaultPrevented,
      propagationStopped: e.cancelBubble
    })
  }, true) // Capture phase
})
```

**Expected:**  
All events should fire on the item.

**If no events fire:**  
→ Element is not receiving events, likely z-index/pointer-events issue

**If mousedown fires but not click:**  
→ Event being prevented/stopped somewhere

---

### Step 5: Check cmdk Library Behavior

**Understand how cmdk handles selection:**

```javascript
// Find CommandItem component in React DevTools
// Check props:
// - onSelect (should be a function)
// - value (should match option.label)
// - disabled (should be false)

// In the cmdk source, onSelect is triggered by click events
// If click events don't reach the item, onSelect won't fire
```

**Verify cmdk is receiving events:**

Look for cmdk's internal event listeners on the CommandItem element.

---

## Solution Approaches

### Solution 1: Increase Z-Index to 9999 (Quick Test)

**Rationale:**  
Force the dropdown to be on top of everything.

**Implementation:**
```tsx
style={{
  position: 'fixed',
  // ... other styles
  zIndex: 9999,  // Changed from 100
}}
```

**Pros:**
- Simple one-line change
- Will immediately show if z-index is the issue

**Cons:**
- Not semantic (z-index arms race)
- Might conflict with other overlays (toasts, tooltips)

**Test Result:**  
If this works → z-index stacking was the issue → find proper z-index value

---

### Solution 2: Add pointer-events: none to Modal Overlay

**Rationale:**  
Allow clicks to pass through the modal overlay to reach the dropdown.

**Implementation:**

```tsx
// File: src/components/ui/dialog.tsx
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80',
      'pointer-events-none',  // ← Add this
      className
    )}
    {...props}
  />
))
```

**⚠️ WARNING:**  
This breaks click-outside-to-close functionality on the modal itself.

**Better Approach:**  
Only disable pointer-events when MultiSelect is open (requires complex state management).

---

### Solution 3: Remove preventDefault/stopPropagation from CommandItem

**Rationale:**  
These might be interfering with cmdk's internal click handling.

**Implementation:**

```tsx
<CommandItem
  key={option.value}
  value={option.label}
  disabled={option.disable}
  // Remove or comment out these lines:
  // onMouseDown={(e) => {
  //   e.preventDefault()
  //   e.stopPropagation()
  // }}
  onSelect={() => {
    // Selection logic unchanged
  }}
>
```

**Test:**  
If this fixes click handling → investigate why they were added originally

**Risk:**  
These handlers might be there to prevent unintended side effects. Check git history for reason.

---

### Solution 4: Use Custom Click Handler Instead of onSelect

**Rationale:**  
Bypass cmdk's selection mechanism and handle clicks directly.

**Implementation:**

```tsx
<CommandItem
  key={option.value}
  value={option.label}
  disabled={option.disable}
  onMouseDown={(e) => {
    e.preventDefault()
    e.stopPropagation()
  }}
  onClick={() => {  // ← Add explicit click handler
    if (selected.length >= maxSelected) {
      onMaxSelected?.(selected.length)
      return
    }
    setInputValue('')
    const newOptions = [
      ...selected,
      {
        label: option.label,
        value: option.value,
      },
    ]
    setSelected(newOptions)
    onChange?.(newOptions)
  }}
  onSelect={() => {
    // Keep for keyboard navigation
    if (selected.length >= maxSelected) {
      onMaxSelected?.(selected.length)
      return
    }
    setInputValue('')
    const newOptions = [
      ...selected,
      {
        label: option.label,
        value: option.value,
      },
    ]
    setSelected(newOptions)
    onChange?.(newOptions)
  }}
>
```

**Pros:**
- Explicit control over both mouse and keyboard
- Doesn't rely on cmdk's internal event handling

**Cons:**
- Code duplication
- Might conflict with cmdk's internal state

---

### Solution 5: Ensure dropdownRef is Set Before Click Handlers

**Rationale:**  
The ref might not be attached when click outside handler checks it.

**Implementation:**

```tsx
// Use a callback ref instead of useRef
const [dropdownElement, setDropdownElement] = React.useState<HTMLDivElement | null>(null)

// In the portal
<div
  ref={setDropdownElement}  // Callback ref triggers re-render
  style={{ /* ... */ }}
>
```

**Then update handleClickOutside:**

```tsx
const handleClickOutside = (event: MouseEvent | TouchEvent) => {
  if (
    dropdownElement &&
    !dropdownElement.contains(event.target as Node) &&
    inputRef.current &&
    !inputRef.current.contains(event.target as Node)
  ) {
    setOpen(false)
    inputRef.current.blur()
  }
}
```

**Update effect dependency:**

```tsx
useEffect(() => {
  if (open && dropdownElement) {  // Only attach when element exists
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchend', handleClickOutside)
  } else {
    document.removeEventListener('mousedown', handleClickOutside)
    document.removeEventListener('touchend', handleClickOutside)
  }

  return () => {
    document.removeEventListener('mousedown', handleClickOutside)
    document.removeEventListener('touchend', handleClickOutside)
  }
}, [open, dropdownElement])
```

---

### Solution 6: Use Floating UI Library

**Rationale:**  
Floating UI handles all the positioning, z-index, and interaction logic correctly.

**Implementation:**

```bash
pnpm add @floating-ui/react
```

```tsx
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react'

// In component
const { refs, floatingStyles } = useFloating({
  placement: 'bottom-start',
  middleware: [offset(4), flip(), shift()],
  whileElementsMounted: autoUpdate,
})

// Use refs
<div ref={refs.setReference}>
  {/* Input */}
</div>

{open && createPortal(
  <div ref={refs.setFloating} style={floatingStyles}>
    <CommandList>
      {/* Dropdown */}
    </CommandList>
  </div>,
  document.body
)}
```

**Pros:**
- Battle-tested library
- Handles all edge cases
- Proper z-index management

**Cons:**
- New dependency
- Need to refactor position calculation logic
- Learning curve

---

### Solution 7: Move Portal Outside Command Component

**Rationale:**  
The portal inside Command might be causing context issues.

**⚠️ WARNING:**  
This was already tried and FAILED. React context is lost when portal is outside Command.

**Do NOT attempt this approach again.**

---

### Solution 8: Create Custom Command Context Provider

**Rationale:**  
Manually pass Command context through the portal.

**Implementation:**

This requires deep understanding of cmdk internals and is very fragile. **Not recommended** unless all other options fail.

---

## Solution Recommendation Priority

**⚠️ UPDATED AFTER RESET**

**Try in this order:**

1. 🔍 **Run Step 0 Diagnostics** - Confirm clipping behavior and measurements
2. 🔧 **Solution 6** - Use Floating UI (most robust, battle-tested)
3. ✅ **Solution 1** - Portal with z-index 9999 (if Floating UI isn't viable)
4. ✅ **Solution 5** - Fix ref timing with callback ref (if portal mouse issues persist)
5. ✅ **Solution 3** - Remove preventDefault/stopPropagation (if clicks still broken)
6. ⚠️ **Solution 2** - Disable overlay pointer-events (breaks modal, avoid)

**Recommended Approach:** Start with Floating UI since it handles all the edge cases that caused issues with the manual portal implementation.

---

## Testing Verification

### Manual Testing Checklist

**Test in Create Webhook Modal:**

- [ ] Open modal at Settings → API → Create Webhook
- [ ] Click on "Event Types" MultiSelect input
- [ ] Dropdown appears below input (not clipped)
- [ ] Hover over items shows hover state (background changes)
- [ ] Click item selects it (badge appears in input)
- [ ] Dropdown stays open after selection
- [ ] Type to filter options (real-time filtering)
- [ ] Press arrow keys to navigate (keyboard works)
- [ ] Press Enter to select (keyboard selection)
- [ ] Click outside dropdown closes it
- [ ] Scroll modal and verify dropdown repositions
- [ ] Select multiple items (all show as badges)
- [ ] Remove badge with X button

**Test in Other Modals:**

- [ ] Edit Webhook modal (if exists)
- [ ] Product Features modal
- [ ] Any other modal with MultiSelect

**Test Outside Modal:**

- [ ] Find a page with MultiSelect outside modal
- [ ] Verify mouse interactions still work
- [ ] Ensure no regressions introduced

---

### Automated Testing (Future)

```tsx
// Example Playwright test
test('MultiSelect in modal allows mouse selection', async ({ page }) => {
  await page.goto('/settings')
  await page.click('[data-testid="create-webhook"]')
  
  await page.click('[data-testid="event-types-input"]')
  await expect(page.locator('[cmdk-list]')).toBeVisible()
  
  // Hover over item
  const item = page.locator('[cmdk-item]').first()
  await item.hover()
  await expect(item).toHaveCSS('background-color', /rgba.*/) // Hover state
  
  // Click item
  await item.click()
  await expect(page.locator('[data-testid="selected-badge"]')).toBeVisible()
})
```

---

## References

### Internal Files

- **MultiSelect Component:** `src/components/forms/MultiSelect.tsx`
- **Dialog Component:** `src/components/ui/dialog.tsx`
- **Webhook Form:** `src/components/forms/WebhookFormFields.tsx`
- **Create Webhook Modal:** `src/components/forms/CreateWebhookModal.tsx`
- **Product Features:** `src/components/forms/ProductFeatureMultiSelect.tsx`

### External Documentation

- **cmdk Library:** https://github.com/pacocoursey/cmdk
- **React Portals:** https://react.dev/reference/react-dom/createPortal
- **Radix UI Dialog:** https://www.radix-ui.com/primitives/docs/components/dialog
- **MDN Stacking Context:** https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context
- **Floating UI:** https://floating-ui.com/

### Related Issues

- cmdk issue on portals: https://github.com/pacocoursey/cmdk/issues/171
- Radix Dialog z-index: https://github.com/radix-ui/primitives/discussions/1159

---

## Appendix: Current Implementation (Baseline)

### MultiSelect.tsx (Relevant Sections)

```tsx
// Line 1-6: Imports (NO createPortal)
'use client'
import { Command as CommandPrimitive, useCommandState } from 'cmdk'
import { X } from 'lucide-react'
import * as React from 'react'
import { forwardRef, useEffect } from 'react'
// NO portal import

// State and refs (minimal, no position tracking)
const inputRef = React.useRef<HTMLInputElement>(null)
const [open, setOpen] = React.useState(false)
const [onScrollbar, setOnScrollbar] = React.useState(false)
const [isLoading, setIsLoading] = React.useState(false)
// NO containerRef
// NO dropdownPosition state
// NO position tracking effect

// Standard inline rendering
<Command>
  <div
    className={cn(/* ... */)}
    onClick={() => {
      if (disabled) return
      inputRef?.current?.focus()
    }}
  >
    <CommandPrimitive.Input ref={inputRef} /* ... */ />
    {/* Badges */}
  </div>

  {/* Dropdown renders inline - NO portal */}
  <CommandList
    className="w-full rounded-xl border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in"
  >
    <CommandEmpty />
    <CommandGroup>
      {selectables.map((option) => (
        <CommandItem
          key={option.value}
          value={option.label}
          onSelect={() => {
            // Selection logic
          }}
        >
          {option.label}
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</Command>
```

**Key Characteristics:**
- ✅ Simple, straightforward implementation
- ✅ All mouse interactions work correctly
- ❌ Dropdown gets clipped by parent modal
- ❌ No portal, no positioning logic

---

## Next Steps

**🔄 FRESH START CHECKLIST**

### Phase 1: Diagnostics (Do First)
1. ✅ **Revert complete** - Baseline state confirmed
2. ⬜ **Run Step 0** - Document current clipping behavior with measurements
3. ⬜ **Reproduce issue** - Test in Create Webhook modal
4. ⬜ **Measure modal constraints** - Record overflow settings, dimensions
5. ⬜ **Screenshot/video** - Visual documentation of the issue

### Phase 2: Solution Implementation
6. ⬜ **Choose approach** - Floating UI (recommended) or manual portal
7. ⬜ **Implement incrementally** - Small changes, test after each
8. ⬜ **Test mouse interactions** - Ensure hover/click work at each step
9. ⬜ **Test keyboard navigation** - Ensure arrow keys + Enter still work
10. ⬜ **Test positioning** - Verify dropdown appears correctly on scroll/resize

### Phase 3: Verification
11. ⬜ **Run full test checklist** - All scenarios from Testing Verification section
12. ⬜ **Test in all modals** - Webhook, Product Features, etc.
13. ⬜ **Test outside modals** - Ensure no regressions
14. ⬜ **Browser testing** - Chrome, Firefox, Safari

### Phase 4: Documentation
15. ⬜ **Update this document** - Record the working solution
16. ⬜ **Add inline comments** - Explain why the fix works
17. ⬜ **Create test cases** - Prevent future regressions

---

## Lessons Learned from Previous Attempt

**What Went Wrong:**
- Portal implementation fixed visual clipping but broke mouse interactions
- Root cause of mouse failure was never properly diagnosed
- Jumped to implementation without thorough diagnostics

**What to Do Differently:**
- ✅ Run comprehensive diagnostics FIRST
- ✅ Test incrementally after each change
- ✅ Consider battle-tested libraries (Floating UI) before custom solutions
- ✅ Document findings at each step

---

**Good luck! 🚀**

Remember: **Measure twice, cut once.** Run diagnostics before implementing any fix.

