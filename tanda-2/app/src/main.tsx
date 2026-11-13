import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './estilos.css';

const cliente = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } },
});

// Las etiquetas del grafo se dibujan en canvas: la fuente tiene que estar cargada antes
async function iniciar() {
  await Promise.race([
    Promise.all([
      document.fonts.load('650 32px "Plus Jakarta Sans Variable"'),
      document.fonts.load('600 32px "JetBrains Mono Variable"'),
    ]),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={cliente}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void iniciar();
