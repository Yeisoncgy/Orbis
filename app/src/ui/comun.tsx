import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { Marked } from 'marked';
import { useEffect, useState, type ReactNode } from 'react';
import type { NotaApi, VecinoApi } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import { COLOR_TIPO } from '../lib/tipos.ts';

export const miles = (n: number) => n.toLocaleString('es');
export const MUELLE = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 } as const;
export const SUAVE = { duration: 0.45, ease: [0.22, 1, 0.36, 1] } as const;

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Las notas las escriben agentes: el HTML crudo se muestra como texto, nunca se ejecuta
const markdown = new Marked({ gfm: true, breaks: false });
markdown.use({ renderer: { html: ({ text }) => escapar(text) } });

export function contenido(nota: NotaApi): string {
  const titulos = new Map<string, VecinoApi>([...nota.salientes, ...nota.entrantes].map((v) => [v.id, v]));
  // los [[enlaces]] se cambian por marcadores antes del Markdown: si no, el escape del HTML crudo los rompe
  const piezas: string[] = [];
  const marcado = nota.contenido.replace(/\[\[([^\]\n]+)\]\]/g, (_, crudo: string) => {
    piezas.push(crudo);
    return `ENLACECEREBRO${piezas.length - 1}FIN`;
  });
  return markdown.parse(marcado, { async: false }).replace(/ENLACECEREBRO(\d+)FIN/g, (_, i: string) => {
    const crudo = piezas[Number(i)];
    const destino = crudo.split('|')[0].split('#')[0].trim();
    const alias = crudo.includes('|') ? crudo.split('|')[1].trim() : undefined;
    const id = nota.enlaces[destino];
    const vecino = id ? titulos.get(id) : undefined;
    if (!id) return `<span class="enlace-roto" title="Esta nota no existe">${escapar(alias ?? destino)}</span>`;
    return `<a class="enlace-nota" data-nota="${escapar(id)}" style="--punto:${vecino ? COLOR_TIPO[vecino.tipo] : '#8FB3C7'}">${escapar(alias ?? vecino?.titulo ?? destino)}</a>`;
  });
}

/** Copia un texto y lo confirma con un aviso */
export function Copiar({ texto, aviso, clase = '', children }: { texto: string; aviso: string; clase?: string; children: ReactNode }) {
  const avisar = useApp((s) => s.avisar);
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      className={`boton ${clase}`}
      onClick={() =>
        void navigator.clipboard.writeText(texto).then(() => {
          setHecho(true);
          avisar(aviso);
          setTimeout(() => setHecho(false), 1600);
        })
      }
    >
      {hecho ? <Check size={15} /> : <Copy size={15} />}
      {children}
    </button>
  );
}

/** Un número que sube hasta su valor en vez de aparecer de golpe */
export function Conteo({ valor }: { valor: number }) {
  const mv = useMotionValue(0);
  const texto = useTransform(mv, (v) => miles(Math.round(v)));
  useEffect(() => {
    const control = animate(mv, valor, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => control.stop();
  }, [mv, valor]);
  return <motion.span>{texto}</motion.span>;
}

/** Medidor circular: una fracción, con su cifra dentro */
export function Anillo({ fraccion, color, children }: { fraccion: number; color: string; children: ReactNode }) {
  const f = Math.max(0, Math.min(1, fraccion));
  return (
    <div className="anillo">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="27" className="riel" />
        <motion.circle
          cx="32"
          cy="32"
          r="27"
          stroke={color}
          pathLength={1}
          strokeDasharray="1 1"
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 1 - f }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div>{children}</div>
    </div>
  );
}
