## Characteristics of Current Auto‑Slug System
- **Derivation**: Uses `snakeCase` from source field value.
- **Triggers**:
  - Product slug updates on every `product.name` change.
  - Price slug updates via `useEffect` watching `product.name`.
- **Edit guard**: Disabled in edit mode.
- **Dirty override**: Manual focus/change on slug sets a ref so auto-sync stops.
- **Empty handling**: Clears slug when source becomes empty.
- **Form integration**: Built on `react-hook-form` + shadcn form components.
- **Uniqueness**: Enforced server-side; no inline uniqueness check.

## Reusable AutoSlug (snake_case only) — Plan

### Deliverables
- `components/fields/AutoSlugInput.tsx` — minimal input that handles auto-generation and dirty logic; no implicit label/description.
- `hooks/useAutoSlug.ts` — headless hook with the same logic (for custom UIs).

### AutoSlugInput API (react-hook-form)
- `name: string` — path to slug field (e.g., `product.slug`, `price.slug`).
- `sourceName: string` — path to source field to watch (e.g., `product.name`).
- `disabledAuto?: boolean` — disables auto-generation (use in edit mode).
- `placeholder?: string`
- `debounceMs?: number` — default 0; optional debounce for source sync.
- `onDirtyChange?: (isDirty: boolean) => void` — optional callback.
- Pass-through `Input` props supported.

Note: Label and description are intentionally excluded to align with shadcn composition. Use `FormLabel` and `FormDescription` in the caller.

### Behavior
- Watches `sourceName`; when it changes:
  - If `disabledAuto` is false and slug hasn't been manually edited, set slug to `snake_case(source)`.
  - If source is empty, clear the slug.
- Marks slug "dirty" on focus or manual change and stops auto-sync.
- Works with nested form paths.

### Headless Hook: useAutoSlug
- Options: `{ name, sourceName, disabledAuto, debounceMs }`.
- Returns:
  - `value`, `setValue`
  - `isDirty`, `setDirty`
  - `bindSlugInput` → `{ value, onFocus, onChange }` to spread on an input.

### Usage Examples (shadcn-composed)

```tsx
// ProductFormFields.tsx (replace existing slug field)
<FormField
  control={form.control}
  name="product.slug"
  render={() => (
    <FormItem>
      <FormLabel>Product Slug</FormLabel>
      <FormControl>
        <AutoSlugInput
          name="product.slug"
          sourceName="product.name"
          placeholder="product_slug"
          disabledAuto={editProduct}
        />
      </FormControl>
      <FormDescription>
        Used to identify the product in its pricing model. Must be unique.
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

```tsx
// PriceFormFields.tsx (replace price slug logic)
<FormField
  control={control}
  name="price.slug"
  render={() => (
    <FormItem>
      <FormLabel>Price Slug</FormLabel>
      <FormControl>
        <AutoSlugInput
          name="price.slug"
          sourceName="product.name"
          placeholder="price_slug"
          disabledAuto={edit}
        />
      </FormControl>
      <FormDescription>
        The slug is used to identify the price in the API. Must be unique.
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

### File Layout
- `platform/flowglad-next/src/components/fields/AutoSlugInput.tsx`
- `platform/flowglad-next/src/hooks/useAutoSlug.ts`

### Rollout
- Implement `useAutoSlug` and `AutoSlugInput` with snake_case only.
- Replace slug logic in `ProductFormFields` and `PriceFormFields`.
- Keep uniqueness server-side.