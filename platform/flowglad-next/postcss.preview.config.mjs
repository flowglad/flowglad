/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {
      config: './tailwind.preview.config.ts',
    },
    autoprefixer: {},
  },
};

export default config;