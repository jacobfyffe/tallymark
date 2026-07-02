import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on 127.0.0.1 explicitly so Spotify's redirect to
    // http://127.0.0.1:5173/callback/spotify lands here correctly.
    // (Spotify no longer allows 'localhost' as a redirect URI.)
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/connect': 'http://127.0.0.1:4000',
      '/callback': 'http://127.0.0.1:4000',
    },
  },
});
