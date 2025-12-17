# Gameplan: Make Navbar Simple

## Current State Analysis

### Existing Implementation
The sidebar is in `src/components/navigation/SideNavigation.tsx` (~389 lines):

**Header** (lines 239-291):
- Organization logo + name + tagline
- `OrganizationSwitcher` component (separate popover)
- `PanelLeft` collapse button (separate from logo)

**Content** (lines 293-316):
- Set Up (conditional), Dashboard, Pricing, Customers, Finance (collapsible), Settings

**Footer** (lines 318-385):
- Discord, Documentation, Logout links
- Test Mode toggle

### Gap Analysis

| Aspect | Current | Target (Figma) |
|--------|---------|----------------|
| Header | Org logo + name + switcher + collapse button | Flowglad logo only, click to collapse |
| Nav items | Dashboard, Pricing, Customers, Finance, Settings | Dashboard, Pricing, Customers, Payments, More (expandable) |
| Footer | Discord, Docs, Logout as separate items | Consolidated in NavUser popover |
| NavUser | Not implemented | User avatar + name + org, dropdown with Settings, Change Org, etc. |
| Settings | In main nav | In NavUser popover |
| Org switcher | Header button | NavUser popover submenu |

### Supporting Files
- `src/components/navigation/OrganizationSwitcher.tsx` - Org switch logic (reusable)
- `src/components/ui/sidebar.tsx` - shadcn primitives
- `src/components/ui/avatar.tsx` - Avatar component
- `src/components/ui/dropdown-menu.tsx` - Dropdown primitives
- `src/contexts/authContext.tsx` - `useAuthContext()` provides `user` and `organization`
- `src/utils/authClient.ts` - `useSession()` provides `session.user.image`

---

## Required Changes

### 1. Create `NavUser.tsx`

**File**: `src/components/navigation/NavUser.tsx` (new)

```ts
type NavUserProps = {
  user: {
    name: string
    email: string
    image?: string | null
  }
  organization: {
    id: string
    name: string
    onboardingStatus: OnboardingStatus
  }
  onSignOut: () => void
  onTestModeToggle: (enabled: boolean) => void
  testModeEnabled: boolean
}

export const NavUser: React.FC<NavUserProps> = ({ 
  user, 
  organization, 
  onSignOut,
  onTestModeToggle,
  testModeEnabled 
}) => { ... }
```

**Behavior**:
- Trigger: Avatar (32px) + user name + org name + ChevronsUpDown icon
- When collapsed: Avatar only
- Dropdown contains: Settings, Change Org (submenu), Finish Setup (conditional), Documentation, Discord, Test mode, Log out

### 2. Refactor Header in `SideNavigation.tsx`

**Remove** (lines 247-291):
- `OrganizationSwitcher` component
- Organization name/tagline display
- Separate `PanelLeft` collapse button

**Add**:
```ts
const SidebarLogo: React.FC<{
  organizationLogoURL?: string | null
  onToggle: () => void
}> = ({ organizationLogoURL, onToggle }) => {
  // Default: Flowglad logo
  // If organizationLogoURL exists: show that instead
  // On hover: show collapse icon overlay
  // On click: call onToggle
}
```

### 3. Implement More/Less Navigation Toggle

**Add state** to `SideNavigation.tsx`:
```ts
const [showMore, setShowMore] = useState(false)
```

**Primary items** (always visible):
1. Dashboard (`/`), 2. Pricing (`/pricing`), 3. Customers (`/customers`), 4. Payments (`/finance`), 5. More (toggle)

**Secondary items** (visible when `showMore=true`):
6. Subscriptions (`/subscriptions`), 7. Products (`/products`), 8. Discounts (`/discounts`), 9. Purchases (`/purchases`)

**Visual**: When expanded, items 1-4 get `opacity-25`, "More" becomes "Less" with X icon.

### 4. Update Footer in `SideNavigation.tsx`

**Remove** (lines 326-384):
- `footerNavigationItems` array (Discord, Documentation, Logout)
- Settings from content section

**Add**:
- `NavUser` component
- Keep Test Mode toggle in footer (also available in NavUser popover)

---

## Acceptance Criteria

### Logo
- [ ] Flowglad logo displays by default
- [ ] Organization logo replaces it if `organization.logoURL` exists
- [ ] Hover shows collapse icon overlay
- [ ] Click toggles sidebar collapsed/expanded
- [ ] No org name/tagline in header

### Navigation Items
- [ ] Primary: Dashboard, Pricing, Customers, Payments, More
- [ ] "More" expands to show: Subscriptions, Products, Discounts, Purchases
- [ ] Expanded state dims primary items (opacity-25)
- [ ] "Less" collapses back
- [ ] Settings NOT in main nav

### Button States
- [ ] Default: transparent bg, muted-foreground text/icon
- [ ] Hover: sidebar-accent bg, foreground text/icon
- [ ] Active: transparent bg, 1px left border, foreground text/icon

### NavUser
- [ ] Shows avatar (Google image or initials fallback)
- [ ] Shows user name + org name when expanded
- [ ] Shows avatar only when collapsed
- [ ] Dropdown: Settings, Change Org (submenu), Finish Setup (conditional), Documentation (external), Discord (external), Test mode, Log out

### Mobile
- [ ] Bottom tab bar: Dashboard, Pricing, Customers, Payments, More
- [ ] "More" opens popup with additional items + NavUser popover items

---

## Open Questions

1. **Animation on logo hover**: Should collapse icon fade in over logo, or replace it entirely?

2. **Avatar fallback**: First letter of name, or first letters of first+last name (like org fallback)?

3. **"More" state persistence**: Should `showMore` state persist across navigation, or reset on route change?

4. **Mobile "More" popup**: Should it be a Sheet (slide up) or a Popover (anchored to More button)?

5. **Finance vs Payments rename**: The nav item is called "Payments" in Figma but routes to `/finance`. Should we rename the route or keep the label different?

---

## Explicit Opinions

1. **Reuse `OrganizationSwitcher` logic** rather than duplicating. Extract org list/selection into a shared hook that can be used in both standalone and NavUser submenu contexts.

2. **Access user image via `useSession()`** from better-auth. The Google profile image is in `session.user.image` - this is the authoritative source.

3. **Use DropdownMenu primitives** (not Popover) for NavUser. The Figma design shows menu-style items which aligns with DropdownMenu.

4. **Test mode in both places**: Keep toggle in footer for quick access AND in NavUser popover for mobile/consistency.

5. **"More/Less" is view-only**: It only affects which nav items are visible, doesn't affect routing or active state detection.

6. **Keep NavUser as separate component**: Better separation of concerns, easier to test, follows existing NavMain/NavStandalone pattern.

---

## PRs

### PR 0: Icon Infrastructure Setup ✅ COMPLETE

**Files to create:**
- `src/components/icons/PaymentsIcon.tsx` - Custom Payments icon ✅
- `src/components/icons/MoreIcon.tsx` - Custom More/expand icon ✅
- `src/components/icons/SettingsIcon.tsx` - Custom Settings icon ✅
- `src/components/icons/FinishSetupIcon.tsx` - Custom Finish Setup icon ✅
- `src/components/icons/navigation/PhosphorWrappers.tsx` - Phosphor icon wrappers ✅
- `src/components/icons/navigation/index.ts` - Centralized navigation icon exports ✅

**Files to modify:**
- `package.json` - Add `@phosphor-icons/react` dependency ✅

**Changes:**
1. Install Phosphor Icons: `bun add @phosphor-icons/react` ✅
2. Create 4 custom icons implementing `LucideIcon` interface ✅
3. Create Phosphor icon wrappers for `Users` → `CustomersIcon` and `ArrowsClockwise` → `SubscriptionsIcon` ✅
4. Create centralized export file for all navigation icons ✅

**Test file:** `src/components/icons/navigation/navigation-icons.test.tsx` ✅

**To run tests:**
```bash
bun run test:setup  # Requires Docker - starts test database
bun run test src/components/icons/navigation/navigation-icons.test.tsx
```

**Test cases implemented:**
- PaymentsIcon, MoreIcon, SettingsIcon, FinishSetupIcon: className prop, ref forwarding, currentColor usage
- CustomersIcon, SubscriptionsIcon: className prop, size prop, default size of 20

---

### PR 1: Create NavUser Component Foundation

**Files to create:**
- `src/components/navigation/NavUser.tsx`

**Files to modify:**
- None (component not integrated yet)

**Depends on:**
- PR 0 (Icon Infrastructure Setup)

**Changes:**
1. Create `NavUser` with props: user (name, email, image), organization (id, name, onboardingStatus)
2. Avatar with Google image or initials fallback
3. DropdownMenu trigger styled per Figma (border, rounded, avatar + text + chevron)
4. Collapsed/expanded awareness via `useSidebar()`
5. Menu items with icons from centralized exports:
   - Settings (`SettingsIcon` - custom)
   - Change Org (`Shuffle` - Lucide)
   - Finish Setup (`FinishSetupIcon` - custom, conditional)
   - Documentation (`BookOpen` - Lucide, external)
   - Discord (`RiDiscordFill` - Remixicon, external)
   - Test mode (`Flag` - Lucide, toggle)
   - Log out (`LogOut` - Lucide)

**Test cases:**
```ts
describe('NavUser', () => {
  describe('rendering', () => {
    it('should render avatar with image when user.image is provided', async () => {
      // setup: render NavUser with user.image = "https://example.com/avatar.jpg"
      // expect: AvatarImage has src matching the URL
    })

    it('should render fallback initials when no image provided', async () => {
      // setup: render NavUser with user.image = null, user.name = "John Doe"
      // expect: AvatarFallback shows "JD" or "J"
    })

    it('should show full user info when sidebar is expanded', async () => {
      // setup: render NavUser within SidebarProvider (expanded state)
      // expect: user name and organization name are visible
    })

    it('should show only avatar when sidebar is collapsed', async () => {
      // setup: render NavUser within SidebarProvider (collapsed state)
      // expect: user name and org name are hidden, avatar visible
    })
  })

  describe('dropdown menu', () => {
    it('should open dropdown when trigger is clicked', async () => {
      // setup: render NavUser, click trigger button
      // expect: dropdown content is visible
    })

    it('should render Settings item that navigates to /settings', async () => {
      // setup: render NavUser, open dropdown
      // expect: Settings item present with link to /settings
    })

    it('should render Documentation item with external link', async () => {
      // setup: render NavUser, open dropdown
      // expect: Documentation item has href to docs, target="_blank"
    })

    it('should render Discord item with external link', async () => {
      // setup: render NavUser, open dropdown
      // expect: Discord item has href to discord invite, target="_blank"
    })

    it('should call onSignOut when Log out is clicked', async () => {
      // setup: render NavUser with mock onSignOut, open dropdown, click Log out
      // expect: onSignOut was called
    })

    it('should show Finish Setup when onboardingStatus is not FullyOnboarded', async () => {
      // setup: render NavUser with organization.onboardingStatus = "PartiallyOnboarded"
      // expect: "Finish Setup" item visible
    })

    it('should hide Finish Setup when onboardingStatus is FullyOnboarded', async () => {
      // setup: render NavUser with organization.onboardingStatus = "FullyOnboarded"
      // expect: "Finish Setup" item not present
    })

    it('should toggle test mode when switch is clicked', async () => {
      // setup: render NavUser with mock onTestModeToggle, open dropdown, click test mode switch
      // expect: onTestModeToggle called with opposite of current state
    })
  })
})
```

---

### PR 2: Integrate Organization Switching into NavUser

**Files to modify:**
- `src/components/navigation/NavUser.tsx` - Add Change Org submenu
- `src/components/navigation/OrganizationSwitcher.tsx` - Extract shared hook

**Changes:**
1. Create `useOrganizationList()` hook extracting logic from OrganizationSwitcher
2. Add "Change Org" as `DropdownMenuSubTrigger` in NavUser
3. Submenu shows org list with checkmark on current org
4. Add "Create New Organization" option that opens CreateOrganizationModal

**Test cases:**
```ts
describe('NavUser - Organization Switching', () => {
  describe('Change Org submenu', () => {
    it('should render Change Org item with chevron icon', async () => {
      // setup: render NavUser, open dropdown
      // expect: "Change Org" item visible with ChevronRight icon
    })

    it('should open submenu on hover of Change Org', async () => {
      // setup: render NavUser, open dropdown, hover Change Org
      // expect: submenu with organization list visible
    })

    it('should list all user organizations', async () => {
      // setup: mock useOrganizationList to return 3 orgs, render NavUser
      // expect: submenu contains 3 organization items
    })

    it('should show checkmark on current organization', async () => {
      // setup: render NavUser with organization.id = "org-1", mock orgs include org-1
      // expect: org-1 item has Check icon
    })

    it('should call switchOrganization when different org is selected', async () => {
      // setup: render NavUser, open submenu, click different org
      // expect: updateFocusedMembership mutation called with new orgId
    })

    it('should render Create New Organization option', async () => {
      // setup: render NavUser, open submenu
      // expect: "Create New Organization" item with Plus icon visible at bottom
    })
  })
})
```

---

### PR 3: Implement Logo Hover Collapse Behavior

**Files to modify:**
- `src/components/navigation/SideNavigation.tsx` (lines 239-291)

**Changes:**
1. Replace org logo logic with Flowglad logo default (`/flowglad-logomark-black.svg`)
2. Show org logo if `organization.logoURL` exists
3. Add hover state showing PanelLeft/PanelRight icon overlay
4. On click: call `toggleSidebar()`
5. Remove OrganizationSwitcher from header
6. Remove separate PanelLeft button
7. Remove organization name and tagline

**Test cases:**
```ts
describe('SideNavigation - Logo Section', () => {
  describe('logo display', () => {
    it('should show Flowglad logo when organization has no logoURL', async () => {
      // setup: render SideNavigation with organization.logoURL = null
      // expect: image src is /flowglad-logomark-black.svg
    })

    it('should show organization logo when logoURL exists', async () => {
      // setup: render SideNavigation with organization.logoURL = "https://..."
      // expect: image src matches the logoURL
    })
  })

  describe('hover behavior', () => {
    it('should show collapse icon on hover when expanded', async () => {
      // setup: render SideNavigation (expanded), hover over logo
      // expect: PanelLeft icon visible (or opacity changes from 0 to 1)
    })

    it('should show expand icon on hover when collapsed', async () => {
      // setup: render SideNavigation (collapsed), hover over logo
      // expect: PanelRight icon visible
    })
  })

  describe('click behavior', () => {
    it('should collapse sidebar when expanded logo is clicked', async () => {
      // setup: render SideNavigation (expanded), click logo
      // expect: sidebar state changes to collapsed
    })

    it('should expand sidebar when collapsed logo is clicked', async () => {
      // setup: render SideNavigation (collapsed), click logo
      // expect: sidebar state changes to expanded
    })
  })
})
```

---

### PR 4: Implement More/Less Navigation Toggle

**Files to modify:**
- `src/components/navigation/SideNavigation.tsx`

**Depends on:**
- PR 0 (Icon Infrastructure Setup)

**Changes:**
1. Add `const [showMore, setShowMore] = useState(false)`
2. Split nav items into `primaryItems` and `secondaryItems` arrays
3. Render "More" button (or "Less" when expanded)
4. When expanded: show secondaryItems, dim primaryItems with `opacity-25`
5. Update icons using centralized exports:
   - Primary: `Gauge`, `DollarSign`, `CustomersIcon`, `PaymentsIcon`, `MoreIcon`
   - Secondary: `SubscriptionsIcon`, `Shapes`, `Tag`, `ShoppingCart`
   - Less toggle: `X`

**Test cases:**
```ts
describe('SideNavigation - More/Less Toggle', () => {
  describe('default state', () => {
    it('should show primary nav items and More button', async () => {
      // setup: render SideNavigation
      // expect: Dashboard, Pricing, Customers, Payments, More visible
      // expect: Subscriptions, Products, Discounts, Purchases NOT visible
    })
  })

  describe('expanded state', () => {
    it('should show secondary items when More is clicked', async () => {
      // setup: render SideNavigation, click More
      // expect: Subscriptions, Products, Discounts, Purchases visible
    })

    it('should change More to Less with X icon', async () => {
      // setup: render SideNavigation, click More
      // expect: "More" text becomes "Less", icon changes to X
    })

    it('should dim primary items when expanded', async () => {
      // setup: render SideNavigation, click More
      // expect: Dashboard, Pricing, Customers, Payments have opacity-25 class
    })

    it('should collapse back when Less is clicked', async () => {
      // setup: render SideNavigation, click More, then click Less
      // expect: secondary items hidden, primary items normal opacity
    })
  })

  describe('active state', () => {
    it('should auto-expand when active route is in secondary items', async () => {
      // setup: render SideNavigation with route = /subscriptions
      // expect: showMore is true, Subscriptions item is active
    })
  })
})
```

---

### PR 5: Integrate NavUser and Clean Up SideNavigation

**Files to modify:**
- `src/components/navigation/SideNavigation.tsx`

**Files to delete:**
- None (OrganizationSwitcher kept for potential standalone use)

**Changes:**
1. Remove `footerNavigationItems` (Discord, Documentation, Logout)
2. Remove `settingsItem` from content section
3. Import NavUser, render in footer above test mode toggle
4. Pass props: user from `useSession()`, organization from `useAuthContext()`
5. Wire up onSignOut to `signOut()` from authClient
6. Wire up test mode toggle

**Test cases:**
```ts
describe('SideNavigation - Integration', () => {
  describe('footer structure', () => {
    it('should render NavUser in footer', async () => {
      // setup: render SideNavigation with authenticated user
      // expect: NavUser component present in footer
    })

    it('should render test mode toggle in footer', async () => {
      // setup: render SideNavigation
      // expect: test mode toggle visible in footer
    })

    it('should NOT render Settings in content area', async () => {
      // setup: render SideNavigation
      // expect: no Settings nav item in SidebarContent
    })

    it('should NOT render Discord/Documentation/Logout as standalone items', async () => {
      // setup: render SideNavigation
      // expect: these items not visible as separate nav items
    })
  })

  describe('data flow', () => {
    it('should pass user image from session to NavUser', async () => {
      // setup: mock useSession with user.image = "https://..."
      // expect: NavUser receives and displays that image
    })

    it('should pass organization from authContext to NavUser', async () => {
      // setup: mock useAuthContext with organization.name = "Acme Corp"
      // expect: NavUser shows "Acme Corp"
    })
  })

  describe('mobile', () => {
    it('should render NavUser in mobile Sheet sidebar', async () => {
      // setup: render SideNavigation in mobile viewport
      // expect: NavUser visible and functional in Sheet
    })
  })
})
```

---

## Parallelization

```
PR 0 (Icon Infrastructure)
    │
    ├──> PR 1 (NavUser Foundation) ────┐
    │        │                         │
    │        ├──> PR 2 (Org Switching) │
    │        │                         │
    │        └──> PR 3 (Logo Collapse) ├──> PR 5 (Integration)
    │                                  │
    └──> PR 4 (More/Less Toggle) ──────┘
```

- **PR 0** must complete first (sets up icon infrastructure)
- **PR 1** and **PR 4** can run in parallel after PR 0
- **PR 2, 3** can run in parallel after PR 1
- **PR 5** requires PR 2, 3, and 4

---

## Appendix: Figma Design Reference

### Node IDs
| Component | Node ID |
|-----------|---------|
| Sidebar (all variants) | `25098:271998` |
| Expanded, More=False | `25098:271997` |
| Expanded, More=True | `25305:3692` |
| Collapsed, More=False | `25098:271999` |
| Collapsed, More=True | `25305:3884` |
| Mobile, More=False | `25098:272202` |
| Mobile, More=True | `25305:4301` |
| Nav-user popover | `25124:243960` |
| Button States | `26160:16695` |

### Button States

| State | Background | Text/Icon Color | Left Border |
|-------|------------|-----------------|-------------|
| Default | transparent | muted-foreground (#797063) | transparent |
| Hover | sidebar-accent (#f6f4eb) | sidebar-foreground (#141312) | transparent |
| Active | transparent | sidebar-foreground (#141312) | 1px solid #141312 |

### Key Measurements
- Sidebar width: 250px (expanded), 48px (collapsed)
- Nav item: h-10, px-4, py-2, gap-1.5
- Icon: 20x20px
- Avatar: 32px
- Footer padding: 8px

---

## Appendix: Icon Implementation Strategy

### Icon Sources

This implementation uses icons from multiple sources to match the Figma design precisely:

| Source | Package | Usage |
|--------|---------|-------|
| **Lucide** | `lucide-react` (already installed) | Primary icon library |
| **Phosphor** | `@phosphor-icons/react` (needs install) | Specific icons not in Lucide |
| **Remixicon** | `@remixicon/react` (already installed) | Discord brand icon |
| **Custom** | `src/components/icons/` | Custom designed icons |

### Icon Reference

| Item | Source | Import |
|------|--------|--------|
| Dashboard | Lucide | `import { Gauge } from '@/components/icons/navigation'` |
| Pricing | Lucide | `import { DollarSign } from '@/components/icons/navigation'` |
| Customers | Phosphor (wrapped) | `import { CustomersIcon } from '@/components/icons/navigation'` |
| Payments | **Custom** | `import { PaymentsIcon } from '@/components/icons/navigation'` |
| More | **Custom** | `import { MoreIcon } from '@/components/icons/navigation'` |
| Less | Lucide | `import { X } from '@/components/icons/navigation'` |
| Subscriptions | Phosphor (wrapped) | `import { SubscriptionsIcon } from '@/components/icons/navigation'` |
| Products | Lucide | `import { Shapes } from '@/components/icons/navigation'` |
| Discounts | Lucide | `import { Tag } from '@/components/icons/navigation'` |
| Purchases | Lucide | `import { ShoppingCart } from '@/components/icons/navigation'` |
| Settings | **Custom** | `import { SettingsIcon } from '@/components/icons/navigation'` |
| Change Org | Lucide | `import { Shuffle } from '@/components/icons/navigation'` |
| Finish Setup | **Custom** | `import { FinishSetupIcon } from '@/components/icons/navigation'` |
| Documentation | Lucide | `import { BookOpen } from '@/components/icons/navigation'` |
| Discord | Remixicon | `import { RiDiscordFill } from '@/components/icons/navigation'` |
| Test Mode | Lucide | `import { Flag } from '@/components/icons/navigation'` |
| Log out | Lucide | `import { LogOut } from '@/components/icons/navigation'` |

### Setup: Install Phosphor Icons

```bash
bun add @phosphor-icons/react
```

### Custom Icon Implementation

All custom icons must implement the `LucideIcon` interface for type compatibility with navigation components.

**File location**: `src/components/icons/`

**Template for custom icons**:

```tsx
// src/components/icons/PaymentsIcon.tsx
import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'

export const PaymentsIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, ...props }, ref) => (
  <svg
    ref={ref}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    {/* SVG path content here - use currentColor for stroke/fill */}
  </svg>
))

PaymentsIcon.displayName = 'PaymentsIcon'
```

**Custom icons to create**:

1. `PaymentsIcon.tsx` - Payments nav item
2. `MoreIcon.tsx` - More/expand nav toggle
3. `SettingsIcon.tsx` - Settings in NavUser popover
4. `FinishSetupIcon.tsx` - Finish Setup in NavUser popover

**Key requirements for custom icons**:
- Type as `LucideIcon` for prop compatibility
- Use `React.forwardRef` for ref forwarding
- Accept `LucideProps` (includes `className`, `size`, `strokeWidth`, etc.)
- Use `currentColor` for stroke/fill to inherit text color
- Set `displayName` for debugging
- Default size: 20x20px (matches nav icon size)

### Phosphor Icon Wrappers ✅

Phosphor icons are wrapped for type compatibility with Lucide-based navigation components:

```tsx
// src/components/icons/navigation/PhosphorWrappers.tsx
import { ArrowsClockwise, Users } from '@phosphor-icons/react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'

export const CustomersIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, size = 20, ...props }, ref) => (
  <Users
    ref={ref}
    className={className}
    size={size}
    weight="bold"
    {...props}
  />
))
CustomersIcon.displayName = 'CustomersIcon'

export const SubscriptionsIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, size = 20, ...props }, ref) => (
  <ArrowsClockwise
    ref={ref}
    className={className}
    size={size}
    weight="bold"
    {...props}
  />
))
SubscriptionsIcon.displayName = 'SubscriptionsIcon'
```

### Centralized Exports ✅

Index file for all navigation icons:

```tsx
// src/components/icons/navigation/index.ts

// Remixicon
export { RiDiscordFill } from '@remixicon/react'
// Lucide icons (re-export for convenience)
export {
  BookOpen,
  DollarSign,
  Flag,
  Gauge,
  LogOut,
  Shapes,
  ShoppingCart,
  Shuffle,
  Tag,
  X,
} from 'lucide-react'
// Custom icons
export { FinishSetupIcon } from '../FinishSetupIcon'
export { MoreIcon } from '../MoreIcon'
export { PaymentsIcon } from '../PaymentsIcon'
export { SettingsIcon } from '../SettingsIcon'
// Phosphor wrappers
export { CustomersIcon, SubscriptionsIcon } from './PhosphorWrappers'
```

### Usage in SideNavigation

```tsx
import {
  Gauge,
  DollarSign,
  CustomersIcon,
  PaymentsIcon,
  MoreIcon,
  // ... etc
} from '@/components/icons/navigation'

const primaryItems = [
  { title: 'Dashboard', url: '/', icon: Gauge },
  { title: 'Pricing', url: '/pricing', icon: DollarSign },
  { title: 'Customers', url: '/customers', icon: CustomersIcon },
  { title: 'Payments', url: '/finance', icon: PaymentsIcon },
]
```
