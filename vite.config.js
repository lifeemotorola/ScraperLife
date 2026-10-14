import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  // The Cloudflare runtime's debugger defaults to port 9229, which is also the app preview port.
  // Move the debugger to 9230 so the preview can run on 9229.
  plugins: [cloudflare({ inspectorPort: 9230 })],
  // Radiance environment maps are loaded by RGBELoader at runtime, not imported as source code.
  // Include .hdr so Vite hashes/copies the generated asset into dist and the Worker bundle.
  assetsInclude: ['**/*.hdr'],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
