// CLI de Cerebro. Es la puerta de los agentes (el MCP está bloqueado por política corporativa).
// Solo lee y escribe dentro de la raíz de cerebros; el único proceso que lanza es git.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { commit, crearCerebro, listarCerebros, raiz } from '../core/src/almacen.ts';
import { abrir, buscar, cambiarEstado, escribir, etiquetar, leer, mapa, regenerarMapa, type EntradaNota } from '../core/src/consultas.ts';
import { ErrorNota } from '../core/src/nota.ts';
import { ESTADOS, TIPOS, type Estado, type Tipo } from '../core/src/tipos.ts';

const AYUDA = `Uso: cerebro <comando> ...
  listar                                  cerebros disponibles
  mapa <cerebro>                          índice compacto (léelo primero)
  buscar <cerebro> <palabras> [--tipo t]  notas por palabras
  leer <cerebro> <id> [id...]             notas completas con sus enlaces
  escribir <cerebro>                      nota por stdin: frontmatter (titulo, tipo, descripcion, [id], [tags], [estado]) + contenido
  estado <cerebro> <estado> <id...> [--fusionada-en id]   ${ESTADOS.join(' | ')}
  etiquetar <cerebro> <temas.json>        {"id": "tema"}: pone el tema como primera etiqueta, sin tocar contenido ni fecha
  crear <cerebro> <descripcion> [--personal]
  importar <cerebro> <notas.json>         siembra en lote (consolidadas)
  verificar <cerebro>                     enlaces rotos, notas sueltas, tamaño del mapa
  regenerar <cerebro>                     reescribe MAPA.md (lo importa el CLAUDE.md del proyecto)
Tipos: ${TIPOS.join(', ')}`;

function opcion(args: string[], nombre: string): { valor?: string; resto: string[] } {
  const i = args.indexOf(nombre);
  if (i < 0) return { resto: args };
  return { valor: args[i + 1], resto: [...args.slice(0, i), ...args.slice(i + 2)] };
}

function leerStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Los agentes escriben "descripcion: algo: con dos puntos" y eso no es YAML válido.
// Si el YAML falla, cada línea es clave: valor cortando en el primer ":".
function frontmatterTolerante(texto: string): Record<string, unknown> {
  try {
    return (parse(texto) ?? {}) as Record<string, unknown>;
  } catch {
    const fm: Record<string, unknown> = {};
    for (const linea of texto.split(/\r?\n/)) {
      const m = linea.match(/^([a-z_]+):\s*(.*)$/);
      if (!m) continue;
      const valor = m[2].trim();
      fm[m[1]] = /^\[.*\]$/.test(valor)
        ? valor.slice(1, -1).split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : valor.replace(/^["'](.*)["']$/, '$1');
    }
    return fm;
  }
}

function notaDesdeTexto(texto: string): EntradaNota {
  const m = texto.replace(/^﻿/, '').match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new ErrorNota('La nota debe llegar por stdin con frontmatter entre --- y ---, seguido del contenido');
  const fm = frontmatterTolerante(m[1]);
  for (const campo of ['titulo', 'tipo', 'descripcion']) {
    if (!fm[campo]) throw new ErrorNota(`Falta "${campo}" en el frontmatter`);
  }
  const contenido = m[2].trim();
  if (!contenido) throw new ErrorNota('La nota no tiene contenido');
  return {
    id: fm.id ? String(fm.id) : undefined,
    titulo: String(fm.titulo),
    tipo: String(fm.tipo) as Tipo,
    descripcion: String(fm.descripcion),
    contenido,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : undefined,
    estado: fm.estado ? (String(fm.estado) as Estado) : undefined,
  };
}

async function verificar(cerebro: string): Promise<string> {
  const { grafo, errores } = await abrir(cerebro);
  const colgadas = grafo.aristas.filter((a) => a.clase === 'hub').map((a) => a.origen);
  const porTipo = new Map<string, number>();
  for (const n of grafo.notas.values()) porTipo.set(n.tipo, (porTipo.get(n.tipo) ?? 0) + 1);
  const lineas = [
    `${cerebro}: ${grafo.notas.size} notas, ${grafo.aristas.filter((a) => a.clase === 'enlace').length} enlaces`,
    `Por tipo: ${[...porTipo].map(([t, c]) => `${t} ${c}`).join(', ')}`,
  ];
  if (colgadas.length) lineas.push(`Sin conexiones (colgadas del hub): ${colgadas.join(', ')}`);
  for (const [id, rotos] of grafo.rotos) lineas.push(`Enlaces rotos en ${id}: ${rotos.join(', ')}`);
  for (const e of errores) lineas.push(`Error: ${e}`);
  lineas.push(`Mapa: ~${Math.round((await mapa(cerebro)).length / 3.5)} tokens`);
  return lineas.join('\n');
}

async function importar(cerebro: string, archivo: string): Promise<string> {
  const notas = JSON.parse(readFileSync(archivo, 'utf8')) as EntradaNota[];
  const avisos: string[] = [];
  // dos pasadas: la primera crea todas, la segunda resuelve enlaces entre notas del mismo lote
  for (const n of notas) await escribir(cerebro, { estado: 'consolidada', ...n });
  for (const n of notas) {
    const r = await escribir(cerebro, { estado: 'consolidada', ...n });
    if (/no existen|Sin conexiones/.test(r)) avisos.push(r);
  }
  await commit(cerebro, `cerebro: siembra ${notas.length} notas`);
  return [...avisos, `Importadas ${notas.length} notas en ${cerebro}`].join('\n');
}

async function ejecutar(argv: string[]): Promise<string> {
  const [comando, cerebro, ...resto] = argv;
  const requerirCerebro = () => {
    if (!cerebro) throw new ErrorNota(`Falta el nombre del cerebro.\n\n${AYUDA}`);
    return cerebro;
  };

  switch (comando) {
    case 'listar': {
      const cerebros = await listarCerebros();
      if (cerebros.length === 0) return `No hay cerebros en ${raiz()}.`;
      return cerebros.map((c) => `- ${c.nombre}${c.personal ? ' (personal)' : ''}: ${c.descripcion}`).join('\n');
    }
    case 'mapa':
      return mapa(requerirCerebro());
    case 'buscar': {
      const { valor: tipo, resto: palabras } = opcion(resto, '--tipo');
      if (tipo && !TIPOS.includes(tipo as Tipo)) throw new ErrorNota(`Tipo no válido: ${tipo}`);
      if (palabras.length === 0) throw new ErrorNota('Faltan las palabras a buscar');
      return buscar(requerirCerebro(), palabras.join(' '), tipo as Tipo | undefined);
    }
    case 'leer':
      if (resto.length === 0) throw new ErrorNota('Falta al menos un id');
      return leer(requerirCerebro(), resto.slice(0, 10));
    case 'escribir':
      return escribir(requerirCerebro(), notaDesdeTexto(leerStdin()));
    case 'estado': {
      const { valor: fusionadaEn, resto: args } = opcion(resto, '--fusionada-en');
      const [estado, ...ids] = args;
      if (!ESTADOS.includes(estado as Estado)) throw new ErrorNota(`Estado no válido: ${estado}. Usa: ${ESTADOS.join(', ')}`);
      if (ids.length === 0) throw new ErrorNota('Falta al menos un id');
      return cambiarEstado(requerirCerebro(), ids, estado as Estado, fusionadaEn);
    }
    case 'etiquetar': {
      if (!resto[0]) throw new ErrorNota('Falta el archivo JSON con {"id": "tema"}');
      return etiquetar(requerirCerebro(), JSON.parse(readFileSync(resto[0], 'utf8')) as Record<string, string>);
    }
    case 'crear': {
      const descripcion = resto.filter((r) => r !== '--personal').join(' ');
      if (descripcion.length < 10) throw new ErrorNota('La descripción debe tener al menos 10 caracteres');
      await crearCerebro(requerirCerebro(), descripcion, resto.includes('--personal'));
      return `Cerebro "${cerebro}" creado en ${raiz()}.`;
    }
    case 'importar':
      return importar(requerirCerebro(), resto[0]);
    case 'verificar':
      return verificar(requerirCerebro());
    case 'regenerar':
      await regenerarMapa(requerirCerebro());
      return 'MAPA.md regenerado.';
    default:
      return AYUDA;
  }
}

try {
  process.stdout.write(`${await ejecutar(process.argv.slice(2))}\n`);
} catch (e) {
  process.stderr.write(`${e instanceof ErrorNota ? e.message : `Error interno: ${e instanceof Error ? e.message : String(e)}`}\n`);
  process.exitCode = 1;
}
