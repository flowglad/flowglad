# Preview UI System

## Overview

The Preview UI system provides an isolated environment for previewing UI components with a completely separate CSS build pipeline. This allows components to be rendered with their own Tailwind configuration without inheriting any styles from the main application.

## Architecture

### Route Group Structure
```
/app/(preview)/preview-ui/
├── layout.tsx          # Custom root layout (no globals.css)
├── page.tsx           # Main preview page
├── styles/
│   └── preview.css    # Preview-specific Tailwind CSS
├── components/
│   ├── PreviewWrapper.tsx    # CSS injection wrapper
│   └── ComponentRenderer.tsx # Component renderer
├── utils/
│   └── css-loader.ts  # CSS loading utilities
└── registry-index.ts  # Component registry
```

### Key Features
- **Complete CSS Isolation**: Uses Next.js route groups to bypass the main layout
- **Dynamic CSS Loading**: CSS is compiled at build time and loaded dynamically
- **No Style Inheritance**: Components render without any global styles
- **Separate Tailwind Config**: Uses `tailwind.preview.config.ts` for preview-specific styles

## How It Works

### 1. Route Isolation
The `(preview)` route group creates a separate routing context that doesn't inherit from the main app layout. This prevents `globals.css` from being imported.

### 2. Build Process
```bash
bun run build:preview-css
```
This command:
- Reads `/app/(preview)/preview-ui/styles/preview.css`
- Processes it with PostCSS using `tailwind.preview.config.ts`
- Outputs to `/public/preview/preview.css`
- Creates a hashed version for production caching
- Generates a manifest with metadata

### 3. Dynamic CSS Loading
The `PreviewWrapper` component:
- Fetches the compiled CSS from `/public/preview/`
- Injects it into the page via a `<style>` tag
- Handles loading states and errors
- Caches the CSS for performance

## Usage

### Adding a New Component to Preview

1. **Import the component** in `registry-index.ts`:
```typescript
import { YourComponent } from '@/registry/new-york/your-component'
```

2. **Add to registryComponents array**:
```typescript
{
  name: 'your-component',
  displayName: 'YourComponent',
  description: 'Description of your component',
  component: YourComponent,
  defaultProps: {
    // Default props for the component
  },
  variants: [
    {
      name: 'Variant Name',
      props: {
        // Props for this variant
      }
    }
  ]
}
```

3. **Update the preview page** if needed to display your component.

### Building Preview CSS

The preview CSS is built automatically during the main build process:
```bash
bun run build
```

Or manually build just the preview CSS:
```bash
bun run build:preview-css
```

### Development Workflow

1. Make changes to components in `/src/registry/`
2. Run `bun run build:preview-css` to rebuild styles
3. View changes at `/preview-ui`

## Configuration

### Tailwind Preview Config
Edit `tailwind.preview.config.ts` to customize:
- Theme settings
- Plugin configurations
- Content paths for scanning

### PostCSS Preview Config
Edit `postcss.preview.config.mjs` to add PostCSS plugins.

## CSS Variables

The preview CSS includes the same CSS variables as the main app to ensure component compatibility:
- Color variables (--background, --foreground, etc.)
- Spacing variables
- Border radius variables
- Dark mode support

## Troubleshooting

### CSS Not Loading
1. Check if preview CSS is built: `ls public/preview/`
2. Verify manifest exists: `cat public/preview/manifest.json`
3. Check browser console for loading errors
4. Rebuild CSS: `bun run build:preview-css`

### Styles Not Applied
1. Ensure components use Tailwind classes
2. Check if classes are included in `tailwind.preview.config.ts` content paths
3. Verify CSS variables are defined in `preview.css`

### Build Errors
1. Check PostCSS config syntax
2. Verify Tailwind config is valid
3. Ensure all dependencies are installed
4. Check for syntax errors in preview.css

## Benefits

1. **Isolated Testing**: Test components without app-wide styles
2. **Custom Themes**: Use different Tailwind configs for preview
3. **Performance**: CSS is pre-built and cached
4. **Flexibility**: Easy to add new components and variants

## Future Enhancements

- [ ] Hot reload support for CSS changes
- [ ] Multiple theme support
- [ ] Component code export
- [ ] Responsive viewport controls
- [ ] Props playground UI
- [ ] Component search and filtering