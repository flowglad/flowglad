# Flowglad UI Component Migration Plan: Ion → shadcn/ui

## Overview

This document outlines the step-by-step migration from the current custom Ion components to shadcn/ui components, ordered from simplest to most complex.

## Migration Strategy

### Goals
- Maintain exact styling, layout, and functionality
- Improve accessibility and consistency
- Reduce maintenance burden

### Approach
- **Phase 1**: Simple utility components (no dependencies)
- **Phase 2**: Basic form components (minimal dependencies)
- **Phase 3**: Complex form components (multiple dependencies)
- **Phase 4**: Advanced components (business logic)
- **Phase 5**: Custom business components (keep as-is)

## Phase 1: Simple Utility Components

### 1.1 PageTitle → shadcn/ui Typography
**Current**: `src/components/ion/PageTitle.tsx`
**Action**: Create `src/components/ui/typography.tsx` with PageTitle component
**Changes**: Update imports from `@/components/ion/PageTitle` to `@/components/ui/typography`
**Risk**: Low - simple text component

### 1.2 Divider → shadcn/ui Separator
**Current**: `src/components/ion/Divider.tsx`
**Action**: `npx shadcn@latest add separator` then customize to match Ion API
**Changes**: Update imports and maintain same props (color, children)
**Risk**: Low - already uses Radix UI

### 1.3 Skeleton → shadcn/ui Skeleton
**Current**: `src/components/ion/Skeleton.tsx`
**Action**: `npx shadcn@latest add skeleton` then customize to match Ion API
**Changes**: Update imports, keep FallbackSkeleton component unchanged
**Risk**: Low - simple styling component

## Phase 2: Basic Form Components

### 2.1 Badge → shadcn/ui Badge
**Current**: `src/components/ion/Badge.tsx`
**Action**: `npx shadcn@latest add badge` then customize to match Ion API
**Changes**: Update imports, maintain iconLeading/iconTrailing props
**Risk**: Medium - complex variants and colors

### 2.2 Button → shadcn/ui Button
**Current**: `src/components/ion/Button.tsx`
**Action**: `npx shadcn@latest add button` then customize to match Ion API
**Changes**: Update imports, maintain color/variant/size props
**Risk**: Medium - many variants and states

### 2.3 Input → shadcn/ui Input
**Current**: `src/components/ion/Input.tsx`
**Action**: `npx shadcn@latest add input` then customize to match Ion API
**Changes**: Update imports, maintain label/hint/error props
**Risk**: Medium - form validation integration

## Phase 3: Complex Form Components

### 3.1 Select → shadcn/ui Select
**Current**: `src/components/ion/Select.tsx`
**Action**: `npx shadcn@latest add select` then customize to match Ion API
**Changes**: Update imports, maintain options/label/hint props
**Risk**: High - complex options API

### 3.2 Checkbox → shadcn/ui Checkbox
**Current**: `src/components/ion/Checkbox.tsx`
**Action**: `npx shadcn@latest add checkbox`
**Changes**: Update imports, maintain same API
**Risk**: Low - simple component

### 3.3 Radio → shadcn/ui Radio Group
**Current**: `src/components/ion/Radio.tsx`
**Action**: `npx shadcn@latest add radio-group`
**Changes**: Update imports, maintain same API
**Risk**: Low - simple component

## Phase 4: Advanced Components

### 4.1 Table → shadcn/ui Table + TanStack Table
**Current**: `src/components/ion/Table.tsx`
**Action**: `npx shadcn@latest add table` then create DataTable wrapper
**Changes**: Update imports, maintain pagination and advanced features
**Risk**: High - complex table logic and pagination

### 4.2 Modal → shadcn/ui Dialog
**Current**: `src/components/ion/Modal.tsx`
**Action**: `npx shadcn@latest add dialog`
**Changes**: Update imports, maintain same API
**Risk**: Medium - modal state management

## Phase 5: Components to Keep As-Is

### Business-Specific Components (Do Not Migrate)
- `TotalBillingDetails.tsx` - Complex billing calculations
- `BillingHeader.tsx` - Flowglad-specific billing display
- `BillingLineItem.tsx` - Custom billing line item rendering
- `CheckoutDetails.tsx` - Flowglad checkout flow specific
- `CheckoutMarkdownView.tsx` - Custom markdown rendering
- `PoweredByFlowgladText.tsx` - Brand-specific component
- `SellerInfo.tsx` - Flowglad-specific seller information
- `PostPaymentSidebar.tsx` - Custom post-payment flow
- `SignupSideBar.tsx` - Custom signup flow

### Complex Custom Components (Do Not Migrate)
- `NumberInput.tsx` - Complex number input with controls
- `Datepicker.tsx` - Custom date picker with range support
- `CurrencyInput.tsx` - Currency-specific input handling
- `Navigation.tsx` - Custom navigation with business logic
- `Tag.tsx` - Custom tag component with specific styling
- `Textarea.tsx` - Custom textarea with validation
- `Switch.tsx` - Custom switch component
- `Progress.tsx` - Custom progress component
- `Popover.tsx` - Custom popover implementation
- `Calendar.tsx` - Custom calendar component
- `Avatar.tsx` - Custom avatar with business logic
- `Accordion.tsx` - Custom accordion implementation
- `Tab.tsx` - Custom tab component
- `TableTitle.tsx` - Custom table title component
- `ColumnHeaderCell.tsx` - Custom table header cell
- `FilledIcon.tsx` - Custom icon component
- `Hint.tsx` - Custom hint component
- `Label.tsx` - Custom label component
- `DisabledTooltip.tsx` - Custom tooltip for disabled states

## Migration Checklist

### Pre-Migration Setup
- [ ] Install shadcn/ui CLI: `npm install -g shadcn@latest`
- [ ] Verify `components.json` configuration
- [ ] Create backup of current components
- [ ] Set up testing environment

### Phase 1: Simple Components
- [ ] Migrate PageTitle
- [ ] Migrate Divider
- [ ] Migrate Skeleton
- [ ] Test all changes
- [ ] Update documentation

### Phase 2: Basic Form Components
- [ ] Migrate Badge
- [ ] Migrate Button
- [ ] Migrate Input
- [ ] Test all changes
- [ ] Update documentation

### Phase 3: Complex Form Components
- [ ] Migrate Select
- [ ] Migrate Checkbox
- [ ] Migrate Radio
- [ ] Test all changes
- [ ] Update documentation

### Phase 4: Advanced Components
- [ ] Migrate Table
- [ ] Migrate Modal
- [ ] Test all changes
- [ ] Update documentation

### Post-Migration
- [ ] Remove unused Ion components
- [ ] Update import paths throughout codebase
- [ ] Run full test suite
- [ ] Update component documentation
- [ ] Train team on new components

## Testing Strategy

### Visual Regression Testing
- Screenshot comparison before/after each migration
- Test all component variants and states
- Verify responsive behavior

### Functional Testing
- Test all component interactions
- Verify accessibility features
- Test form validation and submission

### Integration Testing
- Test component integration with existing pages
- Verify no breaking changes in business logic
- Test performance impact

## Rollback Plan

If issues arise during migration:
1. Keep original Ion components in separate directory
2. Use feature flags to switch between old/new components
3. Maintain ability to revert individual components
4. Document any breaking changes for team awareness

## Success Criteria

- [ ] All migrated components maintain exact styling
- [ ] No breaking changes in functionality
- [ ] Improved accessibility scores
- [ ] Reduced bundle size
- [ ] Consistent component API
- [ ] Team adoption of new components
- [ ] No performance regressions 