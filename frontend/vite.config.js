import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // must stay 5173 so it matches CORS_ORIGIN in .env
    proxy: {
      // Any request starting with /api is forwarded to the backend.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});