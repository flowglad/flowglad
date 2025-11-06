# Font Migration Summary

## Changes Made

### ✅ Files Created

1. **`/src/lib/fonts.ts`** - Font configuration using `next/font/local`
   - Configures ABC Arizona Flare for headings
   - Configures SF Pro Variable for body text
   - Configures Berkeley Mono for monospace/code
   - Defines CSS variables: `--font-heading`, `--font-sans`, `--font-mono`

2. **`FONTS_SETUP.md`** - Complete setup guide
   - Font acquisition instructions
   - Installation steps
   - Usage examples
   - Troubleshooting guide

3. **`FONT_MIGRATION_SUMMARY.md`** - This file

### ✅ Files Modified

1. **`/src/app/layout.tsx`**
   - Removed: `import { Inter } from 'next/font/google'`
   - Added: Font imports from `/src/lib/fonts.ts`
   - Updated `<html>` to include font CSS variables
   - Changed body className to use SF Pro

2. **`/src/app/(preview)/preview-ui/layout.tsx`**
   - Removed: Inter font import
   - Added: Custom font imports
   - Updated to use new font configuration

3. **`/tailwind.config.ts`**
   - Added `fontFamily` configuration:
     - `font-sans`: SF Pro Variable
     - `font-heading`: ABC Arizona Flare
     - `font-mono`: Berkeley Mono

4. **`/src/app/globals.css`**
   - Added default font-family for body
   - Added heading font rules (h1-h6)
   - Added monospace font rules (code, pre, kbd, samp)
   - Updated Google Places autocomplete font

5. **`/src/components/CheckoutForm.tsx`**
   - Updated Stripe integration font from "Inter" to "SF Pro"

## Next Steps - Action Required

### 1. Acquire Font Files

You need to obtain the font files from these sources:

**ABC Arizona Flare** (Commercial)
- 🔗 https://abcdinamo.com/typefaces/arizona
- 📦 Required: `ABCArizonaFlare-Regular.woff2`
- 📦 Optional: `ABCArizonaFlare-Medium.woff2`, `ABCArizonaFlare-Bold.woff2`

**SF Pro Variable** (Free for developers)
- 🔗 https://developer.apple.com/fonts/
- 📦 Required: `SFPro-Variable.woff2` (recommended)
- OR static fonts: Regular, Medium, Semibold, Bold

**Berkeley Mono** (Commercial)
- 🔗 https://berkeleygraphics.com/typefaces/berkeley-mono/
- 📦 Required: `BerkeleyMono-Regular.woff2`
- 📦 Optional: `BerkeleyMono-Italic.woff2`, `BerkeleyMono-Bold.woff2`

### 2. Install Font Files

Place all `.woff2` font files in:
```
/public/fonts/
```

Ensure file names match exactly as specified in `/src/lib/fonts.ts`

### 3. Test the Implementation

After adding font files:

```bash
# Start development server
npm run dev
# or
bun dev
```

Then verify:
- [ ] Body text uses SF Pro
- [ ] Headings (h1-h6) use ABC Arizona Flare
- [ ] Code blocks use Berkeley Mono
- [ ] Stripe checkout uses SF Pro
- [ ] No console errors for missing fonts

### 4. Adjust Font Configuration (if needed)

If your font file names differ, edit `/src/lib/fonts.ts` to match your actual file names.

If using static SF Pro fonts instead of variable:
1. Open `/src/lib/fonts.ts`
2. Comment out the variable font configuration
3. Uncomment the static fonts section
4. Add all static font files

## Font Usage Quick Reference

### Tailwind Classes

```tsx
// Body text (default)
<p>Uses SF Pro automatically</p>

// Explicit sans font
<p className="font-sans">SF Pro text</p>

// Heading font
<h1>Uses Arizona Flare automatically</h1>
<div className="font-heading">Custom heading</div>

// Monospace
<code className="font-mono">Berkeley Mono code</code>
```

### CSS Variables

```css
.element {
  font-family: var(--font-sans);     /* SF Pro */
  font-family: var(--font-heading);  /* ABC Arizona Flare */
  font-family: var(--font-mono);     /* Berkeley Mono */
}
```

## Rollback Instructions

If you need to revert to Inter:

```bash
git checkout HEAD -- src/app/layout.tsx
git checkout HEAD -- src/app/(preview)/preview-ui/layout.tsx
git checkout HEAD -- tailwind.config.ts
git checkout HEAD -- src/app/globals.css
git checkout HEAD -- src/components/CheckoutForm.tsx
rm src/lib/fonts.ts
```

## Performance Notes

The implementation includes these optimizations:
- ✅ `display: 'swap'` - Prevents layout shift
- ✅ `preload: true` - Faster font loading
- ✅ `.woff2` format - Best compression
- ✅ CSS variables - Efficient application
- ✅ System fallbacks - Graceful degradation

## License Compliance Reminder

⚠️ **Before deploying to production**, ensure you have valid licenses for:
- ABC Arizona Flare (commercial license required)
- Berkeley Mono (commercial license required)
- SF Pro (free for Apple platform developers)

## Questions or Issues?

Refer to `FONTS_SETUP.md` for detailed troubleshooting and setup instructions.

