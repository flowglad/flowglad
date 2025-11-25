# ProductCard Component

A flexible, accessible product card component for displaying product information including name, status, and pricing. Built following the Flowglad Design System and Shadcn component patterns.

## Design System Alignment

### Figma References
- **Default Variant - Default State**: [Figma Link](https://www.figma.com/design/cX3wo0Td27AGorHuoP1dX2/Flowglad-Design-System?node-id=25752-1966&m=dev)
- **Default Variant - Hover State**: [Figma Link](https://www.figma.com/design/cX3wo0Td27AGorHuoP1dX2/Flowglad-Design-System?node-id=25755-1980&m=dev)

### Design Specifications

#### Layout
- **Width**: Full width (100% of parent container)
- **Padding**: 12px horizontal (px-3), 10px vertical (py-2.5)
- **Border Radius**: 6px (rounded-md)
- **Gap between sections**: 16px (gap-4)

#### Typography
- **Product Name**: 
  - Font: SF Pro Medium
  - Size: 16px (text-base)
  - Line Height: 24px (leading-6)
  - Color: card-foreground

- **Product Status**:
  - Font: SF Pro Regular
  - Size: 14px (text-sm)
  - Line Height: 1 (leading-none)
  - Color: muted-foreground

- **Price**:
  - Font: ABC Arizona Flare Medium
  - Size: 24px (text-2xl)
  - Line Height: 1 (leading-none)
  - Color: card-foreground

- **Period/Separator**:
  - Font: SF Pro Medium
  - Size: 16px (text-base)
  - Line Height: 24px (leading-6)
  - Color: muted-foreground

#### Color Tokens

**Default State**:
- Background: `hsl(var(--background))` (#fbfaf4)
- Border: `hsl(var(--border))` (#e6e2e1)
- Foreground: `hsl(var(--card-foreground))` (#141312)
- Muted: `hsl(var(--muted-foreground))` (#797063)

**Hover State**:
- Background: `hsl(var(--accent))` (#f1f0e9)
- Border: `hsl(var(--muted-foreground))` (#797063)
- Other colors remain the same

## Usage

### Basic Example

```tsx
import { ProductCard } from '@/components/ProductCard'

export function MyComponent() {
  return (
    <ProductCard
      productName="Pro Plan"
      productStatus="Active"
      price={99}
      period="month"
      variant="default"
    />
  )
}
```

### With Link to Product

```tsx
<ProductCard
  productName="Pro Plan"
  productStatus="Active"
  price={99}
  period="month"
  href="/store/products/prod_123"
/>
```

### With Custom Currency

```tsx
<ProductCard
  productName="European Plan"
  productStatus="Active"
  price={79}
  period="month"
  currencySymbol="€"
  href="/store/products/prod_456"
/>
```

### With Click Handler

```tsx
<ProductCard
  productName="Custom Plan"
  productStatus="Active"
  price={49}
  period="month"
  onClick={() => console.log('Card clicked!')}
/>
```

### Grid Layout

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  <ProductCard
    productName="Starter"
    productStatus="Active"
    price={29}
    period="month"
  />
  <ProductCard
    productName="Pro"
    productStatus="Active"
    price={99}
    period="month"
  />
  <ProductCard
    productName="Enterprise"
    productStatus="Contact us"
    price={299}
    period="month"
  />
</div>
```

## Props

### ProductCard

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `productName` | `string` | Required | The name of the product |
| `productStatus` | `string` | Required | The status of the product (e.g., "Active", "Paused") |
| `price` | `string \| number` | Required | The price amount |
| `period` | `string` | Required | The billing period (e.g., "month", "year") |
| `variant` | `'default' \| 'see-all' \| 'subscription'` | `'default'` | The card variant |
| `currencySymbol` | `string` | `'$'` | Currency symbol to display before price |
| `href` | `string` | - | Optional URL to link to (makes card a Next.js Link) |
| `onClick` | `() => void` | - | Optional click handler (when not using href) |
| `className` | `string` | - | Additional CSS classes |
| `state` | `'default' \| 'hover'` | `'default'` | Manual state override (hover is automatic) |

## Component Composition

The ProductCard is built using composable sub-components:

```tsx
<ProductCard>
  <ProductCardHeader>
    <ProductCardTitle>Product name</ProductCardTitle>
    <ProductCardStatus>product status</ProductCardStatus>
  </ProductCardHeader>
  <ProductCardPrice 
    price={0} 
    period="month" 
    currencySymbol="$" 
  />
</ProductCard>
```

### Sub-components

- **ProductCardHeader**: Container for title and status
- **ProductCardTitle**: Displays the product name
- **ProductCardStatus**: Displays the product status
- **ProductCardPrice**: Displays price with period

## Variants

### Implemented Variants

#### 1. Default Variant ✅
The standard product card with default styling as per Figma specifications.

```tsx
<ProductCard variant="default" {...props} />
```

### Planned Variants

#### 2. See All Variant 🔜
Placeholder for "See all products" card. Requires Figma design specifications.

```tsx
<ProductCard variant="see-all" {...props} />
```

#### 3. Subscription Variant 🔜
Placeholder for active subscription cards. Requires Figma design specifications.

```tsx
<ProductCard variant="subscription" {...props} />
```

## Extending Variants

To implement the "see-all" or "subscription" variants when Figma designs are available:

1. **Analyze the Figma design** using MCP tools
2. **Update `productCardVariants`** in `ProductCard.tsx`:

```tsx
const productCardVariants = cva(
  'relative box-border rounded-md border transition-colors duration-200',
  {
    variants: {
      variant: {
        default: 'w-[278px]',
        'see-all': 'w-[278px] bg-primary text-primary-foreground', // Add styles
        subscription: 'w-[278px] border-2 border-primary', // Add styles
      },
      // ... rest of variants
    },
  }
)
```

3. **Add conditional rendering** if the structure differs:

```tsx
const ProductCard = React.forwardRef<HTMLDivElement, ProductCardProps>(
  ({ variant, ...props }, ref) => {
    if (variant === 'see-all') {
      return <SeeAllVariant {...props} />
    }
    // ... default implementation
  }
)
```

## States

### Default State
The resting state of the card with subtle background and border.

### Hover State
Automatically triggered on mouse hover with:
- Darker background (accent color)
- Darker border (muted-foreground)
- Smooth transition (200ms)

The hover state is managed internally and doesn't require manual control.

## Linking and Interactivity

The ProductCard supports three modes:

### 1. Static Card (Default)
No `href` or `onClick` provided - card is non-interactive.

```tsx
<ProductCard productName="Basic Plan" productStatus="Active" price={0} period="month" />
```

### 2. Linked Card (Recommended)
Provide `href` to make the entire card a clickable link using Next.js Link.

```tsx
<ProductCard
  productName="Pro Plan"
  productStatus="Active"
  price={99}
  period="month"
  href="/store/products/prod_123"
/>
```

### 3. Clickable Card
Provide `onClick` for custom click handling (when navigation is handled differently).

```tsx
<ProductCard
  productName="Enterprise"
  productStatus="Active"
  price={299}
  period="month"
  onClick={() => openModal()}
/>
```

## Accessibility

- **Semantic HTML**: Uses appropriate elements (Link for navigation, div with role="button" for clicks)
- **Keyboard navigation**: Full support for Tab, Enter, and Space keys when interactive
- **Focus states**: Automatically styled when card is keyboard-focused
- **Screen reader friendly**: Proper text hierarchy and semantic structure
- **ARIA attributes**: Can be added via props spreading for custom needs
- **Hover indicators**: Visual feedback on all interactive cards

## Design Tokens Used

The component uses CSS variables defined in your Tailwind config:

- `--background`: Card background (default state)
- `--accent`: Card background (hover state)
- `--border`: Border color (default state)
- `--card-foreground`: Primary text color
- `--muted-foreground`: Secondary text and borders
- `--font-sans`: SF Pro font family
- `--font-heading`: ABC Arizona Flare font family

## Examples

See `ProductCard.example.tsx` for comprehensive usage examples including:
- Different variants
- Custom pricing
- Grid layouts
- Currency variations
- Interactive hover demonstrations

## Notes

- The component uses `class-variance-authority` for variant management
- Follows Shadcn component patterns with forwardRef and composable sub-components
- Uses data-slot attributes for internal styling hooks
- Hover state is managed with React state for smooth transitions
- **Width is full (100%) of parent container** - use grid or flex layouts to control card size
- When `href` is provided, the card becomes a Next.js Link component
- When `onClick` is provided (without href), the card becomes keyboard accessible with Enter/Space support
- Cards are fully accessible with proper focus states and keyboard navigation

