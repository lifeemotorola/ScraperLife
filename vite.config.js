import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()],
  // Radiance environment maps are loaded by RGBELoader at runtime, not imported as source code.
  // Include .hdr so Vite hashes/copies the generated asset into dist and the Worker bundle.
  assetsInclude: ['**/*.hdr'],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
