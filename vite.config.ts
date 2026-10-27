import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { devApi } from './dev/devApi';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Without Supabase configured, `npm run dev` serves the API from memory.
  const useDevApi = !env.VITE_SUPABASE_URL;
  return {
    plugins: [react(), tailwindcss(), ...(useDevApi ? [devApi()] : [])],
    server: { host: true, port: 5173 },
  };
});
