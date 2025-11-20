# Flowglad Documentation Fonts

This directory contains custom font files used in the Flowglad documentation.

## Font Stack

Our documentation uses three custom typefaces:

1. **ABC Arizona** - Serif font for headings
2. **SF Pro** - Sans-serif font for body text
3. **Berkeley Mono** - Monospace font for code

## Required Font Files

To complete the font setup, add the following WOFF2 font files to their respective directories:

### ABC Arizona (`abc-arizona/`)
- `ABCArizona-Regular.woff2` (400 weight)
- `ABCArizona-Medium.woff2` (500 weight) - **Used for all headings**
- `ABCArizona-Bold.woff2` (700 weight)

### SF Pro (`sf-pro/`)
- `SFPro-Regular.woff2` (400 weight)
- `SFPro-Medium.woff2` (500 weight)
- `SFPro-Bold.woff2` (700 weight)

### Berkeley Mono (`berkeley-mono/`)
- `BerkeleyMono-Regular.woff2` (400 weight)
- `BerkeleyMono-Medium.woff2` (450 weight) - **Used for eyebrow labels**
- `BerkeleyMono-Bold.woff2` (700 weight)

## File Format

- **Format**: WOFF2 (Web Open Font Format 2)
- **Why WOFF2?**: Best compression, broad browser support, and optimal performance

## Acquiring Font Files

### ABC Arizona
- Source: [Dinamo Typefaces](https://abcdinamo.com/typefaces/arizona)
- License: Commercial license required
- Convert TTF/OTF to WOFF2 if needed

### SF Pro
- Source: [Apple Developer](https://developer.apple.com/fonts/)
- License: Free for use in Apple ecosystem, check terms for web use
- Convert TTF/OTF to WOFF2 if needed

### Berkeley Mono
- Source: [Berkeley Mono](https://berkeleygraphics.com/typefaces/berkeley-mono/)
- License: Commercial license required
- Convert TTF/OTF to WOFF2 if needed

## Converting Fonts to WOFF2

If you have TTF or OTF files, convert them to WOFF2 using one of these tools:

### Online Converters (Easy)
- [CloudConvert](https://cloudconvert.com/ttf-to-woff2)
- [Font Squirrel Webfont Generator](https://www.fontsquirrel.com/tools/webfont-generator)
- [Transfonter](https://transfonter.org/)

### Command Line (Advanced)
Install woff2 tools:
```bash
# macOS
brew install woff2

# Ubuntu/Debian
apt-get install woff2
```

Convert fonts:
```bash
woff2_compress input.ttf
# Output: input.woff2
```

## File Naming Convention

Follow this pattern for consistency:
```
FontName-Weight.woff2
```

Examples:
- `ABCArizona-Regular.woff2`
- `SFPro-Medium.woff2`
- `BerkeleyMono-Bold.woff2`

## Integration

Once font files are added:

1. ✅ Files are referenced in `/platform/docs/docs.json`
2. ✅ `@font-face` declarations exist in `/platform/docs/style.css`
3. ✅ CSS rules apply fonts to appropriate elements
4. ⚠️ **Add actual font files** to the directories above

## Testing

After adding font files:

1. Clear browser cache
2. Hard refresh (Cmd/Ctrl + Shift + R)
3. Open browser DevTools
4. Inspect elements to verify computed font-family
5. Check both light and dark modes
6. Test on different browsers

## Directory Structure

```
fonts/
├── README.md (this file)
├── abc-arizona/
│   ├── ABCArizona-Regular.woff2
│   ├── ABCArizona-Medium.woff2
│   └── ABCArizona-Bold.woff2
├── sf-pro/
│   ├── SFPro-Regular.woff2
│   ├── SFPro-Medium.woff2
│   └── SFPro-Bold.woff2
└── berkeley-mono/
    ├── BerkeleyMono-Regular.woff2
    ├── BerkeleyMono-Medium.woff2
    └── BerkeleyMono-Bold.woff2
```

## License Compliance

**Important**: Ensure you have proper licenses for all fonts:

- ✅ ABC Arizona: Verify commercial license covers web use
- ✅ SF Pro: Check Apple's terms for web deployment
- ✅ Berkeley Mono: Verify commercial license covers web use

Do not commit font files to public repositories unless licenses permit redistribution.

## Fallback Fonts

The CSS includes fallback fonts for each category:

- **Headings**: Georgia, Times New Roman, Times, serif
- **Body**: System fonts (-apple-system, BlinkMacSystemFont, Segoe UI, etc.)
- **Code**: SF Mono, Monaco, Inconsolata, Fira Code, monospace

These ensure readable content even if custom fonts fail to load.

## Troubleshooting

### Fonts not loading
- Verify files exist in correct directories
- Check file names match exactly (case-sensitive)
- Ensure WOFF2 format is valid
- Clear browser cache

### Wrong font displaying
- Inspect element in DevTools
- Check computed font-family
- Verify CSS specificity and `!important` flags
- Check browser console for 404 errors

### Performance issues
- WOFF2 should be small (~100-200KB per file)
- Use `font-display: swap` (already configured)
- Consider subsetting fonts if files are large

## Additional Resources

- [Mintlify Fonts Documentation](https://mintlify.com/docs/settings/global#fonts)
- [Web Font Optimization Guide](https://web.dev/font-best-practices/)
- [Font Display Property](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display)
- [WOFF2 Format Specification](https://www.w3.org/TR/WOFF2/)

---

**Last Updated**: November 2024  
**Maintainer**: Flowglad Team

