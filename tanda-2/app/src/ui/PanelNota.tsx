import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Check, Copy, CornerDownRight, X } from 'lucide-react';
import { Marked } from 'marked';
import { useMemo, useState } from 'react';
import { api, type NotaApi, type VecinoApi } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import { fechaCorta, haceCuanto } from '../lib/tiempo.ts';
import { COLOR_TIPO, SINGULAR_TIPO } from '../lib/tipos.ts';

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Las notas las escriben agentes: el HTML crudo se muestra como texto, nunca se ejecuta
const markdown = new Marked({ gfm: true, breaks: false });
markdown.use({ renderer: { html: ({ text }) => escapar(text) } });

function renderizar(nota: NotaApi, titulos: Map<string, VecinoApi>): string {
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
    const color = vecino ? COLOR_TIPO[vecino.tipo] : '#64748B';
    return `<a class="enlace-nota" data-nota="${escapar(id)}" style="--punto:${color}">${escapar(alias ?? vecino?.titulo ?? destino)}</a>`;
  });
}

function Estado({ nota }: { nota: NotaApi }) {
  if (nota.estado === 'reciente')
    return <span className="rounded-md bg-[#FBEAEA] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-primario">Reciente</span>;
  if (nota.estado === 'obsoleta')
    return <span className="rounded-md bg-hundido px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-secundario">Obsoleta</span>;
  return <span className="rounded-md bg-[#E8F3EF] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#0E7C66]">Consolidada</span>;
}

function Vecinos({ titulo, icono: Icono, vecinos }: { titulo: string; icono: typeof ArrowUpRight; vecinos: VecinoApi[] }) {
  const seleccionar = useApp((s) => s.seleccionar);
  const setHover = useApp((s) => s.setHover);
  if (!vecinos.length) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-secundario">
        <Icono className="size-3.5" strokeWidth={1.5} />
        {titulo}
        <span className="font-mono font-normal tracking-normal">{vecinos.length}</span>
      </div>
      <ul className="space-y-px" onMouseLeave={() => setHover(undefined)}>
        {vecinos.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => seleccionar(v.id)}
              onMouseEnter={() => setHover(v.id)}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-hundido"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR_TIPO[v.tipo] }} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-cuerpo group-hover:text-navy">{v.titulo}</span>
              <span className="shrink-0 text-[10.5px] text-secundario">{SINGULAR_TIPO[v.tipo]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopiarId({ cerebro, id }: { cerebro: string; id: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(`[[${id}]]`).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        });
      }}
      title={`Copiar enlace [[${id}]] de ${cerebro}`}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[11px] text-secundario transition-colors hover:bg-hundido hover:text-navy"
    >
      {copiado ? <Check className="size-3.5 text-[#0E7C66]" strokeWidth={1.5} /> : <Copy className="size-3.5" strokeWidth={1.5} />}
      {id}
    </button>
  );
}

export function PanelNota({ cerebro, id }: { cerebro: string; id: string }) {
  const seleccionar = useApp((s) => s.seleccionar);
  const { data: nota, error } = useQuery({ queryKey: ['nota', cerebro, id], queryFn: () => api.nota(cerebro, id), placeholderData: (p) => p });

  const html = useMemo(() => {
    if (!nota) return '';
    const titulos = new Map([...nota.salientes, ...nota.entrantes].map((v) => [v.id, v]));
    return renderizar(nota, titulos);
  }, [nota]);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className="vidrio flex max-h-full min-h-0 w-full flex-col rounded-[24px] !bg-white/95"
      aria-label="Nota"
    >
      {error && !nota ? (
        <div className="p-6 text-[13px] text-secundario">{error.message}</div>
      ) : !nota ? (
        <div className="space-y-3 p-6">
          <div className="h-3 w-24 animate-pulse rounded bg-hundido" />
          <div className="h-6 w-3/4 animate-pulse rounded bg-hundido" />
          <div className="h-3 w-full animate-pulse rounded bg-hundido" />
        </div>
      ) : (
        <>
          <header className="border-b border-borde-suave px-6 pb-4 pt-5">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-cuerpo">
                <span className="size-2.5 rounded-full" style={{ background: COLOR_TIPO[nota.tipo] }} />
                {SINGULAR_TIPO[nota.tipo]}
              </span>
              <Estado nota={nota} />
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => seleccionar(undefined)}
                className="-mr-2 rounded-lg p-1.5 text-secundario transition-colors hover:bg-hundido hover:text-navy"
                aria-label="Cerrar nota"
              >
                <X className="size-4" strokeWidth={1.5} />
              </button>
            </div>
            <motion.h2
              key={nota.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mt-3 text-[21px] font-semibold leading-[1.25] tracking-[-0.018em] text-navy text-balance"
            >
              {nota.titulo}
            </motion.h2>
            <p className="mt-2 text-[13px] leading-relaxed text-secundario text-pretty">{nota.descripcion}</p>
            <dl className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-secundario">
              <div className="flex gap-1.5">
                <dt>actualizada</dt>
                <dd className="text-cuerpo">{fechaCorta(nota.actualizado)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>creada</dt>
                <dd className="text-cuerpo">{fechaCorta(nota.creado)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>lecturas</dt>
                <dd className="text-cuerpo">
                  {nota.lecturas}
                  {nota.ultimaLectura ? ` · ${haceCuanto(nota.ultimaLectura)}` : ''}
                </dd>
              </div>
            </dl>
            {nota.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {nota.tags.map((t) => (
                  <span key={t} className="rounded-md border border-borde-suave bg-hundido px-1.5 py-px font-mono text-[10.5px] text-secundario">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className="desplazable min-h-0 flex-1 px-6 py-5">
            {nota.fusionadaEn && (
              <button
                type="button"
                onClick={() => seleccionar(nota.fusionadaEn)}
                className="mb-4 flex w-full items-center gap-2 rounded-lg border border-borde bg-hundido px-3 py-2 text-left text-[12.5px] text-cuerpo hover:border-[#C3CBD6]"
              >
                <CornerDownRight className="size-4 text-secundario" strokeWidth={1.5} />
                Se fusionó en <span className="font-semibold text-navy">[{nota.fusionadaEn}]</span>
              </button>
            )}
            <div
              className="prosa"
              onClick={(e) => {
                const destino = (e.target as HTMLElement).closest<HTMLElement>('[data-nota]');
                if (destino?.dataset.nota) {
                  e.preventDefault();
                  seleccionar(destino.dataset.nota);
                }
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="mt-6 space-y-4 border-t border-borde-suave pt-4">
              <Vecinos titulo="Enlaza a" icono={ArrowUpRight} vecinos={nota.salientes} />
              <Vecinos titulo="Enlazada desde" icono={ArrowDownLeft} vecinos={nota.entrantes} />
            </div>
          </div>
          <footer className="flex items-center justify-between border-t border-borde-suave px-4 py-2">
            <CopiarId cerebro={cerebro} id={nota.id} />
            <span className="text-[11px] text-secundario">Esc para cerrar</span>
          </footer>
        </>
      )}
    </motion.aside>
  );
}
