import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// App.tsx still imports the socket from its old folder on the other laptop,
// this points that path at the socket file in this repo
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '/voorbereiding defensie/vliegtuig-radar/backend/services/socket': fileURLToPath(
        new URL('./services/socket.ts', import.meta.url),
      ),
    },
  },
});
