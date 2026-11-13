import { cargarNotas, commit, guardarMapa, guardarNota, leerMeta, leerUso, registrarActividad } from './almacen.ts';
import { construirGrafo, indiceDeNotas, resolverEnlace, salientesDe } from './grafo.ts';
import { ErrorNota, extraerEnlaces, hoy, normalizar, slug } from './nota.ts';
import { NOMBRE_TIPO, TIPOS, type Estado, type Grafo, type Nota, type Tipo } from './tipos.ts';

export async function abrir(nombre: string): Promise<{ grafo: Grafo; errores: string[] }> {
  const { notas, errores } = await cargarNotas(nombre);
  return { grafo: construirGrafo(notas), errores };
}

function lineaIndice(nota: Nota): string {
  const marca = nota.estado === 'reciente' ? ' (reciente)' : '';
  // el id ya es el título en slug: repetir el título duplicaría el costo del mapa
  return `- [${nota.id}] ${nota.descripcion}${marca}`;
}

// El mapa es lo primero que lee un agente: debe ser compacto
async function textoMapa(nombre: string): Promise<string> {
  const meta = await leerMeta(nombre);
  const { grafo, errores } = await abrir(nombre);
  const uso = await leerUso(nombre);
  const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta');
  const recientes = vivas.filter((n) => n.estado === 'reciente').length;
  const obsoletas = grafo.notas.size - vivas.length;

  const lineas = [
    `# Cerebro ${meta.nombre}${meta.personal ? ' (personal)' : ''}`,
    meta.descripcion,
    `${vivas.length} notas · ${recientes} recientes sin consolidar${obsoletas ? ` · ${obsoletas} obsoletas ocultas` : ''}`,
    'Abre solo las que necesites, por su id entre corchetes.',
  ];
  if (vivas.length === 0) lineas.push('', 'Cerebro vacío.');

  const porUso = (a: Nota, b: Nota) =>
    (uso.get(b.id)?.lecturas ?? 0) - (uso.get(a.id)?.lecturas ?? 0) || a.titulo.localeCompare(b.titulo);
  for (const tipo of TIPOS) {
    const delTipo = vivas.filter((n) => n.tipo === tipo).sort(porUso);
    if (delTipo.length === 0) continue;
    lineas.push('', `## ${NOMBRE_TIPO[tipo]}`, ...delTipo.map(lineaIndice));
  }
  if (errores.length) lineas.push('', `Notas con errores (no cargadas): ${errores.join('; ')}`);
  return lineas.join('\n');
}

// MAPA.md lo importan los CLAUDE.md de los proyectos (@ruta): así el agente arranca con el mapa
// sin depender de hooks, que la política corporativa desactiva (allowManagedHooksOnly)
const CABECERA_MAPA = '<!-- Generado por Cerebro. No editar: se reescribe con cada cambio. -->';

export async function regenerarMapa(nombre: string): Promise<void> {
  await guardarMapa(nombre, `${CABECERA_MAPA}\n${await textoMapa(nombre)}\n`);
}

export async function mapa(nombre: string): Promise<string> {
  const texto = await textoMapa(nombre);
  await guardarMapa(nombre, `${CABECERA_MAPA}\n${texto}\n`);
  await registrarActividad(nombre, 'mapa', []);
  return texto;
}

export interface Resultado {
  id: string;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  puntaje: number;
  fragmento: string;
}

function fragmento(contenido: string, terminos: string[]): string {
  const plano = contenido.replace(/\s+/g, ' ');
  const norm = normalizar(plano);
  const pos = Math.min(...terminos.map((t) => norm.indexOf(t)).filter((p) => p >= 0), Infinity);
  if (!Number.isFinite(pos)) return plano.slice(0, 160);
  const inicio = Math.max(0, pos - 60);
  return `${inicio > 0 ? '…' : ''}${plano.slice(inicio, inicio + 180)}…`;
}

export function puntuar(grafo: Grafo, consulta: string, tipo?: Tipo, limite = 8): Resultado[] {
  const terminos = normalizar(consulta).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (terminos.length === 0) return [];
  const resultados: Resultado[] = [];
  for (const nota of grafo.notas.values()) {
    if (tipo && nota.tipo !== tipo) continue;
    if (nota.estado === 'obsoleta') continue;
    const titulo = normalizar(nota.titulo);
    const desc = normalizar(nota.descripcion);
    const tags = normalizar(nota.tags.join(' '));
    const cuerpo = normalizar(nota.contenido);
    let puntaje = 0;
    for (const t of terminos) {
      if (titulo.includes(t)) puntaje += 5;
      if (desc.includes(t)) puntaje += 3;
      if (tags.includes(t)) puntaje += 3;
      puntaje += Math.min(cuerpo.split(t).length - 1, 5);
    }
    if (puntaje > 0) {
      resultados.push({
        id: nota.id,
        titulo: nota.titulo,
        tipo: nota.tipo,
        descripcion: nota.descripcion,
        puntaje,
        fragmento: fragmento(nota.contenido, terminos),
      });
    }
  }
  return resultados.sort((a, b) => b.puntaje - a.puntaje).slice(0, limite);
}

export async function buscar(nombre: string, consulta: string, tipo?: Tipo): Promise<string> {
  const { grafo } = await abrir(nombre);
  const resultados = puntuar(grafo, consulta, tipo);
  await registrarActividad(nombre, 'buscar', resultados.map((r) => r.id));
  if (resultados.length === 0) return `Sin resultados para "${consulta}" en ${nombre}.`;
  return resultados.map((r) => `- [${r.id}] ${r.titulo} (${r.tipo}): ${r.descripcion}\n  ${r.fragmento}`).join('\n');
}

export async function leer(nombre: string, ids: string[]): Promise<string> {
  const { grafo } = await abrir(nombre);
  const indice = indiceDeNotas(grafo.notas);
  const leidas: string[] = [];
  const bloques: string[] = [];

  for (const pedido of ids) {
    const id = resolverEnlace(grafo.notas, indice, pedido);
    const nota = id ? grafo.notas.get(id) : undefined;
    if (!nota) {
      const parecidas = puntuar(grafo, pedido, undefined, 3).map((r) => r.id);
      bloques.push(`[${pedido}] no existe.${parecidas.length ? ` Quizás: ${parecidas.join(', ')}` : ''}`);
      continue;
    }
    leidas.push(nota.id);
    const cabecera = [
      `# ${nota.titulo} [${nota.id}]`,
      `tipo: ${nota.tipo} · estado: ${nota.estado} · actualizado: ${nota.actualizado}${nota.tags.length ? ` · tags: ${nota.tags.join(', ')}` : ''}`,
    ];
    if (nota.fusionadaEn) cabecera.push(`Fusionada en [${nota.fusionadaEn}]: lee esa en su lugar.`);
    const sal = salientesDe(grafo, nota.id);
    const ent = grafo.entrantes.get(nota.id) ?? [];
    const pie: string[] = [];
    if (sal.length) pie.push(`Enlaza a: ${sal.join(', ')}`);
    if (ent.length) pie.push(`Enlazada desde: ${ent.join(', ')}`);
    bloques.push([...cabecera, '', nota.contenido, ...(pie.length ? ['', ...pie] : [])].join('\n'));
  }

  await registrarActividad(nombre, 'leer', leidas);
  return bloques.join('\n\n---\n\n');
}

export interface EntradaNota {
  id?: string;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  contenido: string;
  tags?: string[];
  estado?: Estado;
}

export async function escribir(nombre: string, entrada: EntradaNota): Promise<string> {
  await leerMeta(nombre);
  if (!TIPOS.includes(entrada.tipo)) throw new ErrorNota(`Tipo no válido: ${entrada.tipo}. Usa: ${TIPOS.join(', ')}`);
  const descripcion = entrada.descripcion.trim().replace(/\s+/g, ' ');
  if (!descripcion) throw new ErrorNota('La descripción es obligatoria: es lo que ven los agentes en el mapa');

  const { grafo } = await abrir(nombre);
  const id = entrada.id ? slug(entrada.id) : slug(entrada.titulo);
  if (!id) throw new ErrorNota('No se pudo derivar un id del título');
  const previa = grafo.notas.get(id);

  const nota: Nota = {
    id,
    titulo: entrada.titulo.trim(),
    tipo: entrada.tipo,
    descripcion,
    estado: entrada.estado ?? 'reciente',
    tags: entrada.tags ?? previa?.tags ?? [],
    creado: previa?.creado || hoy(),
    actualizado: hoy(),
    contenido: entrada.contenido,
    enlaces: extraerEnlaces(entrada.contenido),
  };
  await guardarNota(nombre, nota);

  const notas = new Map(grafo.notas).set(id, nota);
  const indice = indiceDeNotas(notas);
  const validos = nota.enlaces.map((e) => resolverEnlace(notas, indice, e)).filter((d): d is string => !!d && d !== id);
  const rotos = nota.enlaces.filter((e) => !resolverEnlace(notas, indice, e));

  void commit(nombre, `cerebro: ${previa ? 'actualiza' : 'agrega'} ${id}`, [`notas/${id}.md`]);
  await registrarActividad(nombre, 'escribir', [id]);
  await regenerarMapa(nombre);

  const respuesta = [`${previa ? 'Actualizada' : 'Creada'} [${id}] en ${nombre} (${nota.estado}).`];
  if (rotos.length) respuesta.push(`Enlaces que no existen: ${rotos.join(', ')}. Corrígelos o crea esas notas.`);
  if (validos.length === 0 && !grafo.entrantes.get(id)?.length) {
    const candidatas = puntuar(grafo, `${nota.titulo} ${nota.descripcion}`, undefined, 4)
      .filter((r) => r.id !== id)
      .map((r) => r.id);
    respuesta.push(
      `Sin conexiones: quedó colgada del hub ${NOMBRE_TIPO[nota.tipo]}.` +
        (candidatas.length ? ` Enlázala con [[id]] a alguna de: ${candidatas.join(', ')}` : ''),
    );
  }
  return respuesta.join('\n');
}

/** etiquetas vagas que no separan temas: se quitan al poner el tema */
const ETIQUETAS_VAGAS = new Set(['feedback', 'preferencias', 'convenciones']);

/**
 * Pone a cada nota su tema como primera etiqueta y quita las vagas; las demás etiquetas se conservan. No toca el
 * contenido, el estado ni la fecha de actualización (ordenar etiquetas no es actualizar la nota) y no cuenta como
 * actividad de agentes. `mapaTemas`: id -> tema.
 */
export async function etiquetar(nombre: string, mapaTemas: Record<string, string>): Promise<string> {
  const { grafo } = await abrir(nombre);
  const cambiadas: string[] = [];
  const faltantes: string[] = [];
  for (const [id, tema] of Object.entries(mapaTemas)) {
    const nota = grafo.notas.get(id);
    if (!nota) {
      faltantes.push(id);
      continue;
    }
    const tags = [tema, ...nota.tags.filter((t) => t !== tema && !ETIQUETAS_VAGAS.has(t))];
    if (tags.join('|') === nota.tags.join('|')) continue;
    await guardarNota(nombre, { ...nota, tags });
    cambiadas.push(id);
  }
  if (cambiadas.length) {
    void commit(nombre, `cerebro: ordena etiquetas de ${cambiadas.length} notas`, cambiadas.map((id) => `notas/${id}.md`));
    await regenerarMapa(nombre);
  }
  return [
    `Etiquetas ordenadas en ${cambiadas.length} notas.`,
    faltantes.length ? `No existen: ${faltantes.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function cambiarEstado(nombre: string, ids: string[], estado: Estado, fusionadaEn?: string): Promise<string> {
  const { grafo } = await abrir(nombre);
  if (fusionadaEn && !grafo.notas.has(fusionadaEn)) throw new ErrorNota(`No existe la nota destino [${fusionadaEn}]`);
  const cambiadas: string[] = [];
  const faltantes: string[] = [];
  for (const id of ids) {
    const nota = grafo.notas.get(id);
    if (!nota) {
      faltantes.push(id);
      continue;
    }
    await guardarNota(nombre, { ...nota, estado, fusionadaEn: estado === 'obsoleta' ? fusionadaEn : undefined, actualizado: hoy() });
    cambiadas.push(id);
  }
  if (cambiadas.length) {
    void commit(nombre, `cerebro: marca ${estado} ${cambiadas.join(', ')}`, cambiadas.map((id) => `notas/${id}.md`));
    await registrarActividad(nombre, 'estado', cambiadas);
    await regenerarMapa(nombre);
  }
  return [
    cambiadas.length ? `Marcadas ${estado}: ${cambiadas.join(', ')}` : 'Ninguna nota cambió.',
    faltantes.length ? `No existen: ${faltantes.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
