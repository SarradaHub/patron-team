import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuração do Vite para o projeto React
// A propriedade 'base' usa variável de ambiente para compatibilidade com GitHub Pages.
// No deploy via GH Pages, defina VITE_BASE_PATH='/nome-do-repo/' no workflow.
// Em desenvolvimento local, usa '/' por padrão.
export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
});

