import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/background.js',
      formats: ['es'],
      fileName: () => 'background.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
  },
})
