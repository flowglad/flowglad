module.exports = {
  prefix: 'flowglad-',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Your custom theme extensions
    },
  },
  // Disable Tailwind's base styles if you want full isolation
  corePlugins: {
    preflight: false,
  },
}
