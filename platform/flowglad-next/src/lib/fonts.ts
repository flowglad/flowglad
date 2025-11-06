import localFont from 'next/font/local'

/**
 * ABC Arizona Flare - Display font for headings
 *
 * Place your ABC Arizona Flare font files in /public/fonts/ with these names:
 * - ABCArizonaFlare-Regular.woff2 (required)
 * - ABCArizonaFlare-Medium.woff2 (optional)
 * - ABCArizonaFlare-Bold.woff2 (optional)
 *
 * Purchase from: https://abcdinamo.com/typefaces/arizona
 */
export const arizonaFlare = localFont({
  src: [
    {
      path: '../../public/fonts/ABCArizonaFlare-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ABCArizonaFlare-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ABCArizonaFlare-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-heading',
  display: 'swap',
  preload: true,
})

/**
 * SF Pro Variable - Main body font
 *
 * Currently using: SF-Pro.ttf
 * Download from: https://developer.apple.com/fonts/
 */
export const sfPro = localFont({
  src: [
    {
      path: '../../public/fonts/SF-Pro.ttf',
      weight: '100 900',
      style: 'normal',
    },
  ],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
})

/**
 * Berkeley Mono - Monospace font for code
 *
 * Currently using: Berkeley Mono Variable.otf
 * Purchase from: https://berkeleygraphics.com/typefaces/berkeley-mono/
 */
export const berkeleyMono = localFont({
  src: [
    {
      path: '../../public/fonts/Berkeley Mono Variable.otf',
      weight: '100 900',
      style: 'normal',
    },
  ],
  variable: '--font-mono',
  display: 'swap',
  preload: true,
})
