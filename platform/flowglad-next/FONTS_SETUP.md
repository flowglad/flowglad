# Font Setup Guide

This guide explains how to set up the custom fonts for the Flowglad rebrand.

## Font Overview

The rebrand uses three custom font families:

1. **ABC Arizona Flare** - Display font for headings (h1-h6)
2. **SF Pro Variable** - Body font for regular text
3. **Berkeley Mono** - Monospace font for code and technical content

## Installation Steps

### Step 1: Obtain Font Files

You'll need to acquire the font files from the following sources:

#### ABC Arizona Flare
- **Source**: [ABC Dinamo](https://abcdinamo.com/typefaces/arizona)
- **License**: Commercial (purchase required)
- **Required files**:
  - `ABCArizonaFlare-Regular.woff2` (required)
  - `ABCArizonaFlare-Medium.woff2` (optional)
  - `ABCArizonaFlare-Bold.woff2` (optional)

#### SF Pro Variable
- **Source**: [Apple Developer Fonts](https://developer.apple.com/fonts/)
- **License**: Free for Apple platform developers
- **Required files**:
  - `SFPro-Variable.woff2` (variable font - recommended)
  
  OR if using static fonts:
  - `SFPro-Regular.woff2`
  - `SFPro-Medium.woff2`
  - `SFPro-Semibold.woff2`
  - `SFPro-Bold.woff2`

#### Berkeley Mono
- **Source**: [Berkeley Graphics](https://berkeleygraphics.com/typefaces/berkeley-mono/)
- **License**: Commercial (purchase required)
- **Required files**:
  - `BerkeleyMono-Regular.woff2` (required)
  - `BerkeleyMono-Italic.woff2` (optional)
  - `BerkeleyMono-Bold.woff2` (optional)

### Step 2: Add Font Files to Project

1. Place all font files in the `/public/fonts/` directory
2. Ensure the file names match exactly as listed above
3. The directory structure should look like:

```
/public/fonts/
  ├── ABCArizonaFlare-Regular.woff2
  ├── ABCArizonaFlare-Medium.woff2
  ├── ABCArizonaFlare-Bold.woff2
  ├── SFPro-Variable.woff2
  ├── BerkeleyMono-Regular.woff2
  ├── BerkeleyMono-Italic.woff2
  └── BerkeleyMono-Bold.woff2
```

### Step 3: Configure Font Loading

The font configuration is already set up in `/src/lib/fonts.ts`. This file:
- Uses Next.js's `next/font/local` for optimal font loading
- Defines CSS variables for each font family
- Enables font optimization and preloading

If you need to modify the font configuration:

1. Open `/src/lib/fonts.ts`
2. Adjust file paths if your naming differs
3. Add or remove font weights as needed

## Usage in Code

### Using Tailwind Classes

The fonts are available via Tailwind utility classes:

```tsx
// Body text (default)
<p className="font-sans">Regular text uses SF Pro</p>

// Headings (automatic via globals.css)
<h1>Headings use ABC Arizona Flare automatically</h1>

// Explicitly use heading font
<div className="font-heading">Custom heading text</div>

// Code/monospace
<code className="font-mono">Code uses Berkeley Mono</code>
```

### Using CSS Variables

You can also use the CSS variables directly:

```css
.custom-element {
  font-family: var(--font-sans); /* SF Pro */
}

.custom-heading {
  font-family: var(--font-heading); /* ABC Arizona Flare */
}

.custom-code {
  font-family: var(--font-mono); /* Berkeley Mono */
}
```

## Automatic Font Application

The following elements automatically receive the appropriate fonts via `globals.css`:

- **Body text**: Uses SF Pro Variable by default
- **Headings** (h1-h6): Use ABC Arizona Flare
- **Code elements** (code, pre, kbd, samp): Use Berkeley Mono

## Integration Points

### Main Application
- **File**: `/src/app/layout.tsx`
- Fonts are loaded and CSS variables are injected into the `<html>` element

### Preview UI
- **File**: `/src/app/(preview)/preview-ui/layout.tsx`
- Same font configuration for component previews

### Stripe Integration
- **File**: `/src/components/CheckoutForm.tsx`
- Stripe Elements use SF Pro to match the site design

### Google Places Autocomplete
- **File**: `/src/app/globals.css` (line 83)
- Uses CSS variable to match site fonts

## Troubleshooting

### Fonts not loading

1. **Check file paths**: Ensure font files are in `/public/fonts/` with correct names
2. **Check browser console**: Look for 404 errors for font files
3. **Verify file formats**: Only `.woff2` format is configured (best performance)
4. **Clear cache**: Try hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Font looks incorrect

1. **Verify font weights**: Ensure you have all required font weights
2. **Check CSS specificity**: Custom CSS may override font settings
3. **Inspect element**: Use browser DevTools to check computed font-family

### Variable font not working

If SF Pro Variable isn't working:

1. Open `/src/lib/fonts.ts`
2. Comment out the variable font configuration
3. Uncomment the static fonts configuration
4. Add all static font files to `/public/fonts/`

## Font Fallbacks

Each font has system fallbacks defined:

- **SF Pro** → system-ui → sans-serif
- **ABC Arizona Flare** → serif
- **Berkeley Mono** → monospace

These ensure text remains readable if custom fonts fail to load.

## Performance Considerations

The font setup includes several optimizations:

1. **`display: 'swap'`**: Shows fallback text immediately, swaps when font loads
2. **`preload: true`**: Preloads fonts for faster rendering
3. **`.woff2` format**: Modern, highly compressed format
4. **CSS variables**: Efficient font application without repeated definitions

## License Compliance

⚠️ **Important**: Ensure you have proper licenses for all fonts:

- **ABC Arizona Flare**: Requires commercial license from ABC Dinamo
- **SF Pro**: Free for Apple platform developers
- **Berkeley Mono**: Requires commercial license

Do not deploy without proper licensing.

## Migration from Inter

The previous font (Inter) has been replaced with SF Pro. Key changes:

1. Removed Google Fonts import
2. Updated to local font loading
3. Maintained similar x-height for consistent layout
4. Updated Stripe integration font reference

No layout adjustments should be necessary as SF Pro and Inter have similar metrics.

## Additional Resources

- [Next.js Font Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
- [next/font/local Documentation](https://nextjs.org/docs/app/api-reference/components/font#local-fonts)
- [Tailwind CSS Font Family](https://tailwindcss.com/docs/font-family)

