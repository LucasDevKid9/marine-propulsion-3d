import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 产物：单文件 HTML（three / css / js 全部内联），可离线双击打开
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 8000,
    reportCompressedSize: false,
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
});
