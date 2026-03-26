import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/arexamly/',
  build: {
    outDir: '../server/public',
    emptyOutDir: true
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5011',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
