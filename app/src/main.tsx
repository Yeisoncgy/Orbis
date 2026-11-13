import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './estilos.css';

const cliente = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } },
});

// Los rótulos del tejido se dibujan en el lienzo: la letra tiene que estar cargada antes
async function iniciar() {
  await Promise.race([
    Promise.all([document.fonts.load('500 13px "Figtree Variable"'), document.fonts.load('200 60px "Outfit Variable"')]),
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
