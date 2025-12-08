# Customizing Mintlify Documentation

This guide covers how to customize the styling and behavior of Flowglad's Mintlify documentation. It includes best practices, current implementation details, and reference materials for maintaining and extending our documentation theme.

## Table of Contents

1. [Overview](#overview)
2. [Styling Methods](#styling-methods)
3. [Current Implementation](#current-implementation)
4. [Custom CSS Guide](#custom-css-guide)
5. [Custom JavaScript](#custom-javascript)
6. [Font Customization](#font-customization)
7. [Best Practices](#best-practices)
8. [Common Identifiers and Selectors](#common-identifiers-and-selectors)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Mintlify provides three primary methods for customizing your documentation:

1. **Tailwind CSS** - Inline styling within MDX files
2. **Custom CSS** - Global styles via `style.css`
3. **Custom JavaScript** - Global scripts via `.js` files

Our documentation uses a comprehensive custom CSS file (`style.css`) to maintain brand consistency and override Mintlify's default styling.

### Current Color Scheme

Our brand colors are defined in `docs.json`:

```json
"colors": {
  "primary": "#DD7D29",
  "light": "#FFC898",
  "dark": "#BA702E"
}
```

**Background Colors:**
- Light mode: `#FBFAF4`
- Dark mode: `#2D2A28`

---

## Styling Methods

### 1. Tailwind CSS (Inline)

Use Tailwind CSS v3 classes directly in your MDX files for component-level styling:

```mdx
<img className="w-full aspect-video rounded-xl" src="/path/image.jpg" />
```

**Common Tailwind Classes:**
- `w-full` - Full width
- `aspect-video` - 16:9 aspect ratio
- `rounded-xl` - Large rounded corners
- `block`, `hidden` - Display control
- `dark:hidden`, `dark:block` - Dark mode visibility

**Important:** Tailwind arbitrary values are NOT supported. Use inline styles instead:

```mdx
<img style={{ width: '350px', margin: '12px auto' }} src="/path/image.jpg" />
```

### 2. Custom CSS (Global)

Add a `style.css` file to your documentation root directory. All defined styles will be available globally across all MDX files.

**Location:** `platform/docs/style.css`

### 3. Custom JavaScript (Global)

Any `.js` file in your content directory will be included in every documentation page.

**Example:** Add Google Analytics via `ga.js`:

```javascript
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'TAG_ID');
```

⚠️ **Warning:** Use JavaScript with caution to avoid security vulnerabilities.

---

## Current Implementation

Our `style.css` file implements a comprehensive theming system using **CSS Custom Properties (Variables)** for maximum maintainability and flexibility.

### Architecture

**CSS Variables:** All colors, sizes, and commonly used values are defined as CSS variables at the root level. Dark mode overrides these variables, eliminating the need for repetitive dark mode selectors throughout the file.

**File Structure:**
1. CSS Variables (line ~20)
2. Text Colors (line ~120)
3. Primary Color Overrides (line ~240)
4. Card Colors (line ~310)
5. Code Block Colors (line ~360)
6. Code Syntax Highlighting (line ~440)
7. Border Colors (line ~560)
8. Tab Button Borders (line ~710)
9. Border Radius (line ~760)
10. Mermaid Diagrams (line ~1190)

### Key CSS Variables

**Text Colors (Theme-Aware):**
- `--text-primary`: `#141312` (light) / `#FBFAF4` (dark)
- `--text-secondary`: `#656359` (light) / `#CCC2A9` (dark)

**Background Colors (Theme-Aware):**
- `--bg-card`: `#FFFFFF` (light) / `#3F3935` (dark)
- `--bg-code-container`: `#F1F0E9` (light) / `#45403D` (dark)
- `--bg-code-content`: `#FFFFFF` (light) / `#3F3935` (dark)

**Border Colors (Theme-Aware):**
- `--border-color`: `#E6E2E1` (light) / `rgba(255, 255, 255, 0.1)` (dark)
- `--border-code`: `rgba(0, 0, 0, 0.1)` (light) / `rgba(255, 255, 255, 0.1)` (dark)

**Border Radius:**
- `--radius-sm`: `3px` (inline code)
- `--radius-md`: `4px` (most elements)
- `--radius-lg`: `6px` (modals)
- `--radius-xl`: `8px` (input fields)

### Component Customizations

1. **Cards**
   - Uses `var(--bg-card)` for automatic theme switching
   - Hover borders show primary color

2. **Code Blocks**
   - Container: `var(--bg-code-container)`
   - Content: `var(--bg-code-content)`
   - Borders: `var(--border-code)`

3. **Callouts**
   - Uses primary orange colors instead of default sky blue
   - Border color with transparency for subtle appearance

4. **Borders**
   - General: `var(--border-color)`
   - Code blocks: `var(--border-code)` (keeps Mintlify defaults)
   - Navbar inner border: dashed style

5. **Border Radius**
   - All elements use CSS variables for consistency
   - Easy to update globally by changing variable values

---

## Custom CSS Guide

### Working with CSS Variables

Our implementation uses CSS Custom Properties (variables) for all theming. This approach provides significant benefits:

**Key Advantages:**
- ✅ Single source of truth for all values
- ✅ Automatic dark mode switching
- ✅ Easy theme updates
- ✅ Reduced file size (~60% smaller)
- ✅ Better maintainability

**How It Works:**

1. **Define variables at root level:**
```css
:root {
  --text-primary: #141312;
  --bg-card: #FFFFFF;
  --border-color: #E6E2E1;
  --radius-md: 4px;
}
```

2. **Override for dark mode:**
```css
.dark, html.dark {
  --text-primary: #FBFAF4;
  --bg-card: #3F3935;
  --border-color: rgba(255, 255, 255, 0.1);
  /* --radius-md stays the same, no need to override */
}
```

3. **Use in your styles:**
```css
.card {
  color: var(--text-primary) !important;
  background: var(--bg-card) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius-md) !important;
}
/* This automatically adapts to light/dark mode! */
```

**Available CSS Variables:**

| Variable | Purpose | Light Value | Dark Value |
|----------|---------|-------------|------------|
| `--text-primary` | Headings, titles | `#141312` | `#FBFAF4` |
| `--text-secondary` | Body text | `#656359` | `#CCC2A9` |
| `--bg-card` | Card backgrounds | `#FFFFFF` | `#3F3935` |
| `--bg-code-container` | Code block outer | `#F1F0E9` | `#45403D` |
| `--bg-code-content` | Code block inner | `#FFFFFF` | `#3F3935` |
| `--border-color` | General borders | `#E6E2E1` | `rgba(255,255,255,0.1)` |
| `--border-code` | Code borders | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.1)` |
| `--radius-sm` | Small radius | `3px` | `3px` |
| `--radius-md` | Standard radius | `4px` | `4px` |
| `--radius-lg` | Large radius | `6px` | `6px` |
| `--radius-xl` | Extra large | `8px` | `8px` |

**Adding New Variables:**

When adding new customizations, follow this pattern:

```css
/* 1. Add to :root */
:root {
  --your-new-variable: value-for-light-mode;
}

/* 2. Add dark mode override if needed */
.dark, html.dark {
  --your-new-variable: value-for-dark-mode;
}

/* 3. Use in your styles */
.your-element {
  property: var(--your-new-variable) !important;
}
```

### Targeting Specific Elements

Mintlify uses consistent identifiers and selectors. Use browser DevTools to inspect elements and find their IDs/classes.

#### Example: Customizing the Navbar

```css
/* Navbar background */
#navbar {
  background: #fffff2;
  padding: 1rem;
}

/* Navbar border */
#navbar-transition {
  border-bottom-style: solid !important;
  border-bottom-color: #E6E2E1 !important;
}
```

#### Example: Customizing Sidebar Links

```css
/* Inactive sidebar links - Light mode */
#sidebar a.text-gray-700 {
  color: #656359 !important;
}

/* Active sidebar links */
#sidebar a:hover {
  color: #141312 !important;
}
```

### Specificity Best Practices

1. **Use ID selectors** for high specificity: `#content-area`, `#navbar`, `#sidebar`
2. **Exclude unwanted elements** with `:not()`: `.border:not(.code-block)`
3. **Handle dark mode** with `.dark` prefix: `.dark #sidebar`
4. **Include `html.dark` variant** for compatibility: `html.dark #sidebar`
5. **Use `!important` sparingly** but necessarily to override Mintlify's inline styles

### Color Override Pattern

**New Approach (Using CSS Variables):**

When overriding colors, use CSS variables for automatic theme switching:

```css
/* Simply use the variable - it adapts automatically! */
.element,
.element[class*="text-gray-900"] {
  color: var(--text-primary) !important;
}
```

**Old Approach (Deprecated - for reference only):**

```css
/* Before - required duplicating for light and dark mode */
.element {
  color: #141312 !important; /* Light mode */
}

.dark .element,
html.dark .element {
  color: #FBFAF4 !important; /* Dark mode */
}
```

The new approach eliminates repetition and makes the CSS ~60% smaller!

### Scoping Styles

Prevent unintended side effects by scoping your styles:

```css
/* GOOD - Scoped to content area only */
#content-area h1 {
  color: #141312 !important;
}

/* BAD - Affects all h1 elements including navigation */
h1 {
  color: #141312 !important;
}
```

---

## Custom JavaScript

### Adding Global Scripts

Create a `.js` file in your docs directory:

```javascript
// analytics.js
(function() {
  // Your custom JavaScript
  console.log('Custom script loaded');
})();
```

### Use Cases

- Analytics tracking (Google Analytics, PostHog, etc.)
- Custom event listeners
- Third-party integrations
- Enhanced interactivity

---

## Font Customization

Fonts are configured in `docs.json` via the `fonts` property and in `style.css` for additional control.

### Current Font Stack

Our documentation uses a custom font stack:

- **Headings**: ABC Arizona (serif)
- **Body Text**: SF Pro (sans-serif)
- **Code/Monospace**: Berkeley Mono

### Local Font Setup (Current Implementation)

We use local font files stored in the `fonts/` directory for optimal performance and control:

**Directory Structure:**
```
platform/docs/
├── fonts/
│   ├── abc-arizona/
│   │   ├── ABCArizona-Regular.woff2
│   │   ├── ABCArizona-Medium.woff2
│   │   └── ABCArizona-Bold.woff2
│   ├── sf-pro/
│   │   ├── SFPro-Regular.woff2
│   │   ├── SFPro-Medium.woff2
│   │   └── SFPro-Bold.woff2
│   └── berkeley-mono/
│       ├── BerkeleyMono-Regular.woff2
│       ├── BerkeleyMono-Medium.woff2
│       └── BerkeleyMono-Bold.woff2
└── ...
```

**1. Configure in `docs.json`:**

```json
"fonts": {
  "heading": {
    "family": "ABC Arizona",
    "source": "/fonts/abc-arizona/ABCArizona-Regular.woff2",
    "format": "woff2",
    "weight": 400
  },
  "body": {
    "family": "SF Pro",
    "source": "/fonts/sf-pro/SFPro-Regular.woff2",
    "format": "woff2",
    "weight": 400
  }
}
```

**2. Add `@font-face` declarations in `style.css`:**

The `@font-face` rules are defined at the top of `style.css` for:
- Multiple font weights (Regular, Medium, Bold)
- Code/monospace fonts (Berkeley Mono - not directly supported in `docs.json`)
- Fine-grained control over font loading

```css
@font-face {
  font-family: 'ABC Arizona';
  src: url('/fonts/abc-arizona/ABCArizona-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'Berkeley Mono';
  src: url('/fonts/berkeley-mono/BerkeleyMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
```

**3. Apply fonts to elements in `style.css`:**

```css
/* Body text */
body,
#content-area,
#content-area p {
  font-family: 'SF Pro', -apple-system, sans-serif !important;
}

/* Headings */
#content-area h1,
#content-area h2,
#page-title {
  font-family: 'ABC Arizona', Georgia, serif !important;
}

/* Code */
#content-area code,
.code-block code {
  font-family: 'Berkeley Mono', 'SF Mono', monospace !important;
}
```

### Code Font Configuration

Since Mintlify doesn't have a direct `monospace` font configuration in `docs.json`, we apply Berkeley Mono via CSS:

```css
@font-face {
  font-family: 'Berkeley Mono';
  src: url('/fonts/berkeley-mono/BerkeleyMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

#content-area code,
#content-area pre,
.code-block code {
  font-family: 'Berkeley Mono', 'SF Mono', monospace !important;
}
```

### Font Loading Best Practices

1. **Use `font-display: swap`** - Shows fallback text immediately, swaps to custom font when loaded
2. **Provide fallback fonts** - Ensures readability if custom fonts fail to load
3. **Optimize file sizes** - Use WOFF2 format (best compression and browser support)
4. **Load only needed weights** - Don't include unused font variants
5. **Organize by family** - Keep each font family in its own subdirectory

### Font File Naming Convention

Follow this naming pattern for consistency:
- `FontName-Regular.woff2`
- `FontName-Medium.woff2`
- `FontName-Bold.woff2`
- `FontName-Italic.woff2` (if needed)

### Google Fonts (Alternative)

For non-custom fonts, Mintlify automatically loads Google Fonts:

```json
"fonts": {
  "family": "Inter"
}
```

Or separate heading and body fonts:

```json
"fonts": {
  "heading": {
    "family": "Playfair Display"
  },
  "body": {
    "family": "Inter"
  }
}
```

### Local Fonts

1. Add font files to your project (e.g., `fonts/` directory)
2. Reference in `docs.json`:

```json
{
  "fonts": {
    "family": "InterDisplay",
    "source": "/fonts/InterDisplay-Regular.woff2",
    "format": "woff2",
    "weight": 400
  }
}
```

### Externally Hosted Fonts (Alternative)

You can also reference externally hosted fonts:

```json
{
  "fonts": {
    "family": "Hubot Sans",
    "source": "https://mintlify-assets.b-cdn.net/fonts/Hubot-Sans.woff2",
    "format": "woff2",
    "weight": 400
  }
}
```

### Troubleshooting Font Issues

**Issue: Fonts not loading**
- Verify file paths in `docs.json` start with `/fonts/`
- Check that files exist in the `fonts/` directory
- Ensure WOFF2 format is correct
- Clear browser cache and hard refresh

**Issue: Code blocks using wrong font**
- Check CSS selectors target `#content-area code` and `.code-block`
- Verify `!important` flag is used to override Mintlify defaults
- Inspect element in DevTools to see computed font-family

**Issue: Font weights not working**
- Ensure all weight variants are declared in `@font-face`
- Check that font files include the requested weights
- Verify `font-weight` values match file names (400, 500, 700)

---

## Best Practices

### 1. Use Browser DevTools

Always inspect elements before writing custom CSS:

1. Right-click → Inspect Element
2. Find the element's ID, class, or data attributes
3. Write specific selectors targeting those attributes

### 2. Maintain Specificity Hierarchy

```css
/* Level 1: ID selectors (highest) */
#navbar { }

/* Level 2: Class + ID selectors */
#content-area .heading { }

/* Level 3: Multiple classes */
.card.border { }

/* Level 4: Element selectors (lowest) */
button { }
```

### 3. Document Your Changes

Add comments to your CSS explaining *why* a style is needed:

```css
/* Override Mintlify's default gray with brand secondary color.
   Excludes sidebar and TOC to preserve original contrast. */
#content-area p {
  color: #656359 !important;
}
```

### 4. Test Both Themes

Always test your customizations in both light and dark modes:

```css
/* Light mode */
.element {
  background: white;
}

/* Dark mode - both variants for compatibility */
.dark .element,
html.dark .element {
  background: #2D2A28;
}
```

### 5. Avoid Breaking Mintlify Defaults

Some elements should maintain Mintlify's original styling:

- **Code block borders** - Keep original contrast ratios
- **Interactive elements** - Maintain accessibility standards
- **Table of contents** - Preserve navigation clarity

Use exclusion selectors:

```css
.border:not(.code-block):not(.toc-item) {
  border-color: #E6E2E1 !important;
}
```

### 6. Version Control Your Customizations

- Commit `style.css` changes with descriptive messages
- Document breaking changes in the commit message
- Test after Mintlify updates to ensure compatibility

### 7. Performance Considerations

Our current implementation follows these best practices:

✅ **CSS Variables** - All colors and sizes use CSS variables for:
- Single source of truth
- Automatic theme switching
- Reduced file size
- Better browser caching

✅ **Simplified Selectors** - Avoid overly complex chains:
```css
/* GOOD - Reasonable complexity */
.card,
.button,
.input {
  border-color: var(--border-color);
}
```

✅ **Theme-Aware Variables** - Dark mode handled at variable level:
```css
/* Define once at root */
:root {
  --border-color: #E6E2E1;
}

/* Override for dark mode */
.dark, html.dark {
  --border-color: rgba(255, 255, 255, 0.1);
}

/* Use everywhere - automatically adapts */
.card {
  border-color: var(--border-color) !important;
}
```

✅ **Grouped Rules** - Similar properties combined for efficiency

---

## Common Identifiers and Selectors

Mintlify provides standardized identifiers for major UI components. Use these to target specific elements.

### Identifiers (IDs)

| ID | Description |
|----|-------------|
| `#navbar` | Main navigation bar |
| `#navbar-transition` | Navbar transition wrapper |
| `#sidebar` | Left sidebar navigation |
| `#sidebar-content` | Sidebar content container |
| `#content-area` | Main content area |
| `#content-container` | Content wrapper |
| `#table-of-contents` | Right sidebar TOC |
| `#footer` | Page footer |
| `#page-title` | Page heading |
| `#search-bar-entry` | Search input |
| `#banner` | Top banner element |

### Selectors (Classes)

| Selector | Description |
|----------|-------------|
| `.card` | Card component |
| `.card-group` | Card group container |
| `.callout` | Callout/alert boxes |
| `.code-block` | Code block wrapper |
| `.code-group` | Code group tabs |
| `.nav-anchor` | Navigation anchor link |
| `.nav-logo` | Logo in navigation |
| `.navbar-link` | Navbar link |
| `.sidebar-group` | Sidebar group container |
| `.sidebar-title` | Sidebar section title |
| `.toc` | Table of contents |
| `.toc-item` | TOC link item |
| `.tabs` | Tab component |
| `.tab` | Individual tab |
| `.accordion` | Accordion component |
| `.accordion-group` | Accordion container |
| `.method-pill` | API method badge |
| `.pagination` | Page navigation |
| `.feedback-toolbar` | Feedback buttons |

### Component Data Attributes

Mintlify also uses data attributes for component parts:

```css
[data-component-part="card-title"] { }
[data-component-part="card-content"] { }
[data-component-part="tab-button"] { }
[data-active="true"] { }
[data-callout-type] { }
```

---

## Troubleshooting

### Issue: Styles Not Applying

**Solution:**

1. Check if the `style.css` file is in the root docs directory
2. Increase specificity with ID selectors or `!important`
3. Ensure you're targeting the correct element (use DevTools)
4. Check for typos in class names or IDs
5. Clear browser cache and hard refresh (Cmd/Ctrl + Shift + R)

### Issue: Dark Mode Not Working

**Solution:**

1. Use both `.dark` and `html.dark` selectors for compatibility
2. Ensure you're using `!important` to override inline styles
3. Check that your dark mode styles come after light mode in the CSS

```css
/* Light mode */
.element { color: black; }

/* Dark mode - must come after */
.dark .element,
html.dark .element {
  color: white !important;
}
```

### Issue: Breaking Mintlify Updates

**Solution:**

1. Avoid relying on internal Mintlify class names (they may change)
2. Use IDs and data attributes when possible (more stable)
3. Test your docs after Mintlify updates
4. Keep a changelog of your customizations
5. Use exclusion selectors to avoid side effects

### Issue: Code Block Syntax Highlighting Broken

**Solution:**

Our custom styles override shiki syntax highlighting colors. If broken:

1. Check that you're using color values, not removing them
2. Ensure you're targeting inline styles with attribute selectors
3. Test with a simple code block first

```css
/* Override shiki inline styles */
pre code span[style*="color: rgb(207, 34, 46)"] {
  color: #1F2328 !important;
}
```

### Issue: Button Radius Not Applying

**Solution:**

Mintlify uses utility classes that override border-radius. Use high specificity:

```css
button,
button[type="button"],
.btn,
[role="button"] {
  border-radius: 4px !important;
}
```

---

## Advanced Techniques

### 1. Conditional Styling with :not()

Exclude multiple element types:

```css
.border:not(.code-block):not([role="menu"]):not(#navbar *) {
  border-color: #E6E2E1 !important;
}
```

### 2. Combining Multiple Selectors

Target variations of the same element:

```css
.card,
a.card,
[class*="card"]:not([class*="card-group"]) {
  background-color: #FFFFFF !important;
}
```

### 3. Using :has() for Modern Browsers

Target parent elements based on children:

```css
/* Wrapper divs containing pre elements */
div:has(> pre),
div:has(> pre code) {
  border-radius: 4px !important;
}
```

### 4. Opacity for Hover States

Maintain background color while changing opacity:

```css
.button {
  background-color: #DD7D29;
}

.button:hover {
  opacity: 0.9 !important;
}
```

---

## Resources

- [Mintlify Custom Scripts Documentation](https://www.mintlify.com/docs/customize/custom-scripts)
- [Mintlify Fonts Documentation](https://www.mintlify.com/docs/customize/fonts)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Flowglad Docs Repository](https://github.com/flowglad)

---

## Maintenance Checklist

When updating or maintaining documentation styles:

- [ ] Test in both light and dark modes
- [ ] Verify on different screen sizes (mobile, tablet, desktop)
- [ ] Check all page types (docs, API reference, SDK pages)
- [ ] Validate accessibility (contrast ratios, focus states)
- [ ] Test code blocks with various languages
- [ ] Verify callouts and alerts render correctly
- [ ] Check navigation and sidebar functionality
- [ ] Test interactive elements (tabs, accordions, dropdowns)
- [ ] Document any new customizations
- [ ] Commit changes with descriptive message

---

## Contributing

When contributing style changes:

1. Follow the existing pattern in `style.css`
2. Add comments explaining your changes
3. Test thoroughly in both themes
4. Update this guide if introducing new patterns
5. Keep changes scoped and specific
6. Avoid breaking existing functionality

---

*Last updated: November 2025*

