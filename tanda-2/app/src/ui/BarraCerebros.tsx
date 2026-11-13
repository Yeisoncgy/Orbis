import { motion } from 'framer-motion';
import { UserRound } from 'lucide-react';
import type { CerebroApi } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';

export function BarraCerebros({ cerebros }: { cerebros: CerebroApi[] }) {
  const actual = useApp((s) => s.cerebro);
  const elegir = useApp((s) => s.elegirCerebro);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2.5 pr-1">
        <img src="/marca.svg" alt="" className="size-8 drop-shadow-[0_4px_10px_rgb(12_25_41/0.25)]" />
        <span className="text-[15px] font-bold tracking-[-0.02em] text-navy">Orbis</span>
      </div>
      <nav className="vidrio flex items-center gap-0.5 rounded-full p-1" aria-label="Cerebros">
        {cerebros.map((c) => {
          const activo = c.nombre === actual;
          return (
            <button
              key={c.nombre}
              type="button"
              onClick={() => elegir(c.nombre)}
              title={c.descripcion}
              aria-current={activo}
              className={`relative flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors duration-200 ${activo ? 'text-white' : 'text-cuerpo hover:text-navy'}`}
            >
              {activo && (
                <motion.span
                  layoutId="cerebro-activo"
                  className="absolute inset-0 rounded-full bg-navy shadow-[0_6px_16px_-6px_rgb(12_25_41/0.55)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {c.personal && <UserRound className="size-3.5" strokeWidth={1.5} />}
                {c.nombre}
                {c.recientes > 0 && (
                  <span className={`rounded-full px-1.5 font-mono text-[10px] ${activo ? 'bg-white/15 text-white' : 'bg-[#FBEAEA] text-primario'}`}>{c.recientes}</span>
                )}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
