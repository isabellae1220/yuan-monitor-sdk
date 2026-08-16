import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 生成独立 Map，但不在公开 JS 中写 sourceMappingURL 注释。
    sourcemap: 'hidden'
  },
  server: {
    host: 'localhost',
    port: 5180,
    strictPort: true
  }
})
