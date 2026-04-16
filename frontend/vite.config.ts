import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget =
    env.VITE_BACKEND_URL ||
    env.VITE_API_BASE_URL ||
    'http://localhost:8012';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
      watch: {
        // Exclude heavy static assets from file watching to prevent ENOSPC errors
        ignored: [
          '**/public/tinymce/**',
          '**/public/js/tinymce/**',
          '**/node_modules/**',
        ],
      },
    },
  }
})
