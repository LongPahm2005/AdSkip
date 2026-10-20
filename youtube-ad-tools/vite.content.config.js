import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/content/index.js',
      formats: ['iife'],
      name: 'YouTubeAdTools',
      fileName: () => 'content.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
  },
})
