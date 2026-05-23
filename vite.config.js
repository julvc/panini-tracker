import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/panini-tracker/' // ¡IMPORTANTE! Reemplaza 'panini-tracker' con el nombre exacto de tu repositorio en GitHub.
})