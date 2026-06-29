import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the server during dev so the frontend can use
    // same-origin /api paths without CORS friction.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
