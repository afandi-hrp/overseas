import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    watch: {ignored: ['**/*.pdf', '**/*.mp4', '**/*.mov', '**/*.psd', '**/4. MOTION LOGO/**', '**/3. FULL LOGO WARUNA GROUP/**']},
  },
});
