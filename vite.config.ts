import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const fontAwesomeSwapDisplay = () => ({
  name: 'fontawesome-swap-display',
  generateBundle(_options: unknown, bundle: Record<string, any>) {
    for (const asset of Object.values(bundle)) {
      if (asset.type === 'asset' && asset.fileName.endsWith('.css') && typeof asset.source === 'string') {
        asset.source = asset.source.replace(/font-display:block/g, 'font-display:swap');
      }
    }
  },
});

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [fontAwesomeSwapDisplay(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
          },
        },
      },
    },
  };
});
