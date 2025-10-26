# React Controlled/Uncontrolled Input Issue

## Issue Summary

A React error was encountered in the Discount forms where an input element had both `value` and `defaultValue` props, violating React's controlled/uncontrolled component rules.

## Error Message

```
Error: Input contains an input of type number with both value and defaultValue props. 
Input elements must be either controlled or uncontrolled (specify either the value prop, 
or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled 
input element and remove one of these props.
More info: https://react.dev/link/controlled-components
```

## Stack Trace Location

The error originated from:
- `DiscountFormFields.tsx` - Line 274-291
- Triggered when: Opening the Edit Discount Modal
- Component: Number of Payments input field

## Root Cause Analysis

### The Problematic Code

Located in `/src/components/forms/DiscountFormFields.tsx` at lines 274-291:

```tsx
<Input
  type="number"
  min={1}
  max={10000000000}
  step={1}
  placeholder="10"
  defaultValue={1}  // ❌ PROBLEM: Makes input uncontrolled
  value={field.value?.toString() ?? ''}  // ❌ PROBLEM: Makes input controlled
  onChange={(e) => {
    const value = e.target.value
    const floatValue = parseFloat(value)
    if (!isNaN(floatValue)) {
      field.onChange(floatValue)
    } else {
      field.onChange(1)
    }
  }}
/>
```

### Why This Is Wrong

In React, input elements must be **either** controlled **or** uncontrolled:

1. **Controlled Component**: Value managed by React state
   - Uses `value` prop
   - Always reflects the component's state
   - Updates via `onChange` handler

2. **Uncontrolled Component**: Value managed by the DOM
   - Uses `defaultValue` prop (optional)
   - React doesn't control the value
   - Access value via refs

**You cannot mix both approaches on the same input.**

### Why This Happened

When using `react-hook-form` with `FormField` or `Controller`, the input is automatically a **controlled component** because:
- `field.value` comes from form state
- `field.onChange` updates form state
- The value prop binds the input to form state

Adding `defaultValue={1}` creates a conflict because it attempts to make the input uncontrolled while it's already controlled by react-hook-form.

## Proposed Solution

### Fix

Remove the `defaultValue={1}` prop from the Input component:

```tsx
<Input
  type="number"
  min={1}
  max={10000000000}
  step={1}
  placeholder="10"
  value={field.value?.toString() ?? ''}  // ✅ Controlled by react-hook-form
  onChange={(e) => {
    const value = e.target.value
    const floatValue = parseFloat(value)
    if (!isNaN(floatValue)) {
      field.onChange(floatValue)
    } else {
      field.onChange(1)
    }
  }}
/>
```

### Why This Works

The default value is already properly managed in the form's `defaultValues` configuration:

**CreateDiscountModal.tsx** (lines 40-50):
```tsx
defaultValues={{
  discount: {
    name: '',
    code: '',
    amountType: DiscountAmountType.Fixed,
    duration: DiscountDuration.Once,
    active: true,
    numberOfPayments: null,  // ✅ Default set here
  },
  __rawAmountString: '0',
}}
```

**EditDiscountModal.tsx** (lines 45-49):
```tsx
const defaultValues: EditDiscountFormSchema = {
  discount: discountForForm as any,  // ✅ Uses existing discount data
  id: discount.id,
  __rawAmountString,
}
```

When `discount.numberOfPayments` is `null` or `undefined`, the input displays an empty string (`field.value?.toString() ?? ''`), which is the correct behavior for a controlled input.

## Best Practices

### When Using react-hook-form

1. **Always use controlled inputs** with `FormField` or `Controller`
   - ✅ DO: Use `value={field.value}`
   - ❌ DON'T: Use `defaultValue` on the input element

2. **Set default values in form configuration**
   - ✅ DO: Set in `defaultValues` prop of `useForm()` or `FormModal`
   - ❌ DON'T: Set on individual input elements

3. **Handle nullable/undefined values properly**
   - ✅ DO: `value={field.value?.toString() ?? ''}`
   - ❌ DON'T: `value={field.value}` (can cause controlled/uncontrolled warnings)

### Example Pattern for Number Inputs with react-hook-form

```tsx
<FormField
  control={control}
  name="fieldName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Label</FormLabel>
      <FormControl>
        <Input
          type="number"
          placeholder="Enter number"
          value={field.value?.toString() ?? ''}  // ✅ Controlled
          onChange={(e) => {
            const value = e.target.value
            const numValue = parseFloat(value)
            if (!isNaN(numValue)) {
              field.onChange(numValue)
            } else {
              field.onChange(undefined) // or null, or 0
            }
          }}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

## Files Affected

- `/src/components/forms/DiscountFormFields.tsx` - Contains the bug
- `/src/components/forms/CreateDiscountModal.tsx` - Uses DiscountFormFields
- `/src/components/forms/EditDiscountModal.tsx` - Uses DiscountFormFields

## Testing Checklist

After applying the fix, verify:

- [ ] Create Discount modal opens without errors
- [ ] Edit Discount modal opens without errors
- [ ] Number of Payments field appears when "Recurring" duration is selected
- [ ] Number of Payments field accepts numeric input
- [ ] Number of Payments field validates correctly
- [ ] Form submission works for both create and edit operations
- [ ] Browser console shows no React warnings

## References

- [React: Controlled Components](https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable)
- [React Hook Form: Controller](https://react-hook-form.com/docs/usecontroller/controller)
- [React Hook Form: FormField Pattern](https://ui.shadcn.com/docs/components/form)

## Related Issues

This is a common mistake when:
- Migrating from uncontrolled to controlled forms
- Copy-pasting input patterns without understanding form state management
- Working with conditional fields that weren't properly tested

## Prevention

To prevent this issue in the future:

1. **Code Review**: Look for any `Input` components with both `value` and `defaultValue`
2. **Linting**: Consider adding ESLint rules for react-hook-form best practices
3. **Testing**: Ensure all form modals are opened during testing, especially conditional fields
4. **Documentation**: Share this document with the team

---

**Date**: October 3, 2025  
**Status**: Identified, Solution Proposed  
**Priority**: Medium (causes console errors but doesn't break functionality)

