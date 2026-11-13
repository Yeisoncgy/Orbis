import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { EventoApi } from './api.ts';
import { pulsos, useApp } from './estado.ts';

export type Conexion = 'conectando' | 'en-vivo' | 'sin-conexion';

// Escucha lo que hacen los agentes en todos los cerebros y lo refleja al instante
export function useActividadEnVivo(): Conexion {
  const cliente = useQueryClient();
  const [conexion, setConexion] = useState<Conexion>('conectando');

  useEffect(() => {
    const fuente = new EventSource('/api/eventos');
    fuente.onopen = () => setConexion('en-vivo');
    fuente.onerror = () => setConexion('sin-conexion');
    fuente.onmessage = (m) => {
      const evento = JSON.parse(m.data as string) as EventoApi;
      const actual = useApp.getState().cerebro;
      if (evento.accion === 'escribir' || evento.accion === 'estado') {
        void cliente.invalidateQueries({ queryKey: ['cerebros'] });
      }
      if (evento.cerebro !== actual) return;
      cliente.setQueryData<EventoApi[]>(['actividad', actual], (previos = []) => [evento, ...previos].slice(0, 600));
      if (evento.accion === 'escribir' || evento.accion === 'estado') {
        void cliente.invalidateQueries({ queryKey: ['grafo', actual] });
        void cliente.invalidateQueries({ queryKey: ['revisar', actual] });
        for (const id of evento.notas) void cliente.invalidateQueries({ queryKey: ['nota', actual, id] });
        // el pulso espera a que la neurona nueva exista en el tejido
        setTimeout(() => pulsos.emitir(evento.notas, evento.accion), 700);
      } else {
        pulsos.emitir(evento.notas, evento.accion);
        // refuerzo: la neurona leída crece, después de que termine su pulso
        if (evento.accion === 'leer') setTimeout(() => void cliente.invalidateQueries({ queryKey: ['grafo', actual] }), 2300);
      }
    };
    return () => fuente.close();
  }, [cliente]);

  return conexion;
}
