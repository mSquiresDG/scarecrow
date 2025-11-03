import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  // Enable TypeScript support
  esbuild: {
    target: 'es2021',
  },

  plugins: [
    mkcert(),
  ],

  // Configure module resolution
  resolve: {
    alias: {
      // Polyfill Node.js modules for browser
      'path': 'path-browserify',
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },

  // Configure the dev server
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: true,
    // Enable CORS for asset loading
    cors: true,
    // Serve source maps for debugging
    fs: {
      allow: ['..', '.']
    }
  },

  // Configure build options
  build: {
    target: 'es2021',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },

  // Enable source maps for debugging in development
  css: {
    devSourcemap: true,
  },
});

