// CLI de Cerebro. Es la puerta de los agentes (los hooks y el MCP están bloqueados por política corporativa).
// Solo lee y escribe dentro de la raíz de cerebros y de la carpeta de respaldos; el único proceso que lanza es git.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { conBloqueo, crearCerebro, guardarMeta, leerMeta, listarCerebros, raiz, raizRespaldos } from '../core/src/almacen.ts';
import {
  buscar,
  cambiarEstado,
  cerrar,
  entradaDesdeTexto,
  escribir,
  etiquetar,
  importarLote,
  leer,
  mapa,
  regenerarMapa,
  vecinos,
  type EntradaNota,
} from '../core/src/consultas.ts';
import { importarMemoria, importarObsidian, sembrar } from '../core/src/importadores.ts';
import {
  agregarPregunta,
  comprobar,
  consolidar,
  deshacer,
  evaluar,
  historial,
  metricas,
  podar,
  renombrar,
  respaldarAhora,
  verificar,
} from '../core/src/mantenimiento.ts';
import { ErrorNota } from '../core/src/nota.ts';
import { ESTADOS, TIPOS, type Estado, type Tipo } from '../core/src/tipos.ts';

const AYUDA = `Uso: cerebro <comando> <cerebro> ...

Consultar
  listar                                   cerebros disponibles y dónde viven
  mapa <cerebro> [tema]                    índice (léelo primero); con tema abre ese grupo, ej. decision/precios
  buscar <cerebro> <palabras>              notas por relevancia. "frase exacta" entre comillas
         [--tipo t] [--tag e] [--desde AAAA-MM-DD] [--limite n] [--todos]
  leer <cerebro> <id...>                   notas completas con sus enlaces (hasta 10)
         [--breve] [--seccion "título"]    solo la ficha, o solo una sección
  vecinos <cerebro> <id> [--saltos n]      qué notas rodean a una (1 a 3 saltos)

Guardar
  escribir <cerebro> [--forzar]            nota por la entrada estándar: frontmatter + contenido
  cerrar <cerebro>                         antes de terminar la sesión: qué guardar, o varias notas separadas por ===
  estado <cerebro> <estado> <id...> [--fusionada-en id]     reciente | consolidada | obsoleta
  renombrar <cerebro> <id> <título nuevo>  cambia título e id y reescribe los enlaces

Cuidar
  verificar <cerebro>                      enlaces rotos, notas sin revisar, vencidas, costo del mapa
  consolidar <cerebro>                     propone qué hacer con cada nota reciente
  podar <cerebro> [--dias n]               informe de lo que sobra (no retira nada)
  comprobar <cerebro> [repo] [--marcar]    notas que citan archivos que ya no existen
  metricas <cerebro> [--dias n]            uso real: lo leído, lo nunca leído, búsquedas sin resultado
  evaluar <cerebro>                        mide la búsqueda con el banco de preguntas
  pregunta <cerebro> "<pregunta>" <id...>  agrega una pregunta al banco
  historial <cerebro> [id]                 últimos cambios
  deshacer <cerebro> [código]              revierte un cambio (el último si no se dice cuál)
  respaldar <cerebro>                      copia de respaldo ahora (hay una automática al día)

Crear e importar
  crear <cerebro> <descripción> [--personal] [--repo ruta]
  ajustar <cerebro> [--presupuesto n] [--repo ruta] [--descripcion "…"]
  sembrar <cerebro> <repo> [--aplicar]                  notas desde la documentación del proyecto
  importar-obsidian <cerebro> <bóveda> [--tipos f.json] [--aplicar]
  importar-memoria <cerebro> [carpeta] [--aplicar]      memoria propia de Claude Code
  importar <cerebro> <notas.json>                       lote ya preparado
  etiquetar <cerebro> <temas.json>         {"id": "tema"}: pone el tema como primera etiqueta
  regenerar <cerebro>                      reescribe MAPA.md

Tipos: ${TIPOS.join(', ')}
Campos de una nota: titulo, tipo, descripcion (obligatorios) · id, tags, alias, fuente, valido_desde, valido_hasta,
  reemplaza, depende_de, contradice (opcionales)`;

/** Separa las opciones (--nombre valor, o --nombre sola si está en `sueltas`) del resto de argumentos */
function opciones(args: string[], sueltas: string[] = []): { op: Record<string, string>; resto: string[] } {
  const op: Record<string, string> = {};
  const resto: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      resto.push(a);
      continue;
    }
    const clave = a.slice(2);
    if (sueltas.includes(clave)) op[clave] = 'si';
    else {
      if (args[i + 1] === undefined) throw new ErrorNota(`A la opción ${a} le falta su valor.`);
      op[clave] = args[++i];
    }
  }
  return { op, resto };
}

function entero(valor: string | undefined, nombre: string, minimo: number, maximo: number): number | undefined {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < minimo || n > maximo) throw new ErrorNota(`${nombre} debe ser un número entre ${minimo} y ${maximo} (llegó "${valor}").`);
  return n;
}

function leerStdin(): string {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function leerJson<T>(ruta: string | undefined, queEs: string): T {
  if (!ruta) throw new ErrorNota(`Falta el archivo JSON con ${queEs}.`);
  try {
    return JSON.parse(readFileSync(ruta, 'utf8')) as T;
  } catch (e) {
    throw new ErrorNota(`No se pudo leer ${ruta} como JSON (${e instanceof Error ? e.message : String(e)}).`);
  }
}

async function ejecutar(argv: string[]): Promise<string> {
  const [comando, cerebro, ...args] = argv;
  const requerirCerebro = () => {
    if (!cerebro || cerebro.startsWith('--')) throw new ErrorNota(`Falta el nombre del cerebro. Los que hay: \`cerebro listar\`.`);
    return cerebro;
  };

  switch (comando) {
    case 'listar': {
      const cerebros = await listarCerebros();
      if (cerebros.length === 0) return `No hay cerebros en ${raiz()}. Crea el primero: crear <nombre> "<descripción>"`;
      return [...cerebros.map((c) => `- ${c.nombre}${c.personal ? ' (personal)' : ''}: ${c.descripcion}`), `Viven en ${raiz()} · respaldos en ${raizRespaldos()}`].join('\n');
    }
    case 'mapa':
      return mapa(requerirCerebro(), args.join(' ').trim() || undefined);
    case 'buscar': {
      const { op, resto } = opciones(args, ['todos']);
      if (op.tipo && !TIPOS.includes(op.tipo as Tipo)) throw new ErrorNota(`Tipo no válido: "${op.tipo}". Usa uno de: ${TIPOS.join(', ')}.`);
      if (op.estado && !ESTADOS.includes(op.estado as Estado)) throw new ErrorNota(`Estado no válido: "${op.estado}". Usa uno de: ${ESTADOS.join(', ')}.`);
      if (op.desde && !/^\d{4}-\d{2}-\d{2}$/.test(op.desde)) throw new ErrorNota(`--desde va como AAAA-MM-DD (llegó "${op.desde}").`);
      if (resto.length === 0) throw new ErrorNota(`Faltan las palabras a buscar. Ejemplo: buscar ${cerebro ?? '<cerebro>'} despliegue vercel`);
      return buscar(requerirCerebro(), resto.join(' '), {
        tipo: op.tipo as Tipo | undefined,
        tag: op.tag,
        estado: op.estado,
        desde: op.desde,
        limite: entero(op.limite, '--limite', 1, 30),
        todos: op.todos === 'si',
      });
    }
    case 'leer': {
      const { op, resto } = opciones(args, ['breve']);
      if (resto.length === 0) throw new ErrorNota(`Falta al menos un id. Los ids salen de \`mapa\` o \`buscar\`, entre corchetes.`);
      return leer(requerirCerebro(), resto.slice(0, 10), { breve: op.breve === 'si', seccion: op.seccion });
    }
    case 'vecinos': {
      const { op, resto } = opciones(args);
      if (!resto[0]) throw new ErrorNota('Falta el id de la nota.');
      return vecinos(requerirCerebro(), resto[0], entero(op.saltos, '--saltos', 1, 3) ?? 1);
    }
    case 'escribir': {
      const { op } = opciones(args, ['forzar']);
      return escribir(requerirCerebro(), { ...entradaDesdeTexto(leerStdin()), forzar: op.forzar === 'si' });
    }
    case 'cerrar':
      return cerrar(requerirCerebro(), leerStdin());
    case 'estado': {
      const { op, resto } = opciones(args);
      const [estado, ...ids] = resto;
      if (!ESTADOS.includes(estado as Estado)) throw new ErrorNota(`Estado no válido: "${estado ?? ''}". Usa uno de: ${ESTADOS.join(', ')}.`);
      if (ids.length === 0) throw new ErrorNota('Falta al menos un id.');
      return cambiarEstado(requerirCerebro(), ids, estado as Estado, op['fusionada-en']);
    }
    case 'renombrar': {
      const [id, ...titulo] = args;
      if (!id || titulo.length === 0) throw new ErrorNota(`Úsalo así: renombrar ${cerebro ?? '<cerebro>'} <id> <título nuevo>`);
      return renombrar(requerirCerebro(), id, titulo.join(' '));
    }
    case 'verificar':
      return verificar(requerirCerebro());
    case 'consolidar':
      return consolidar(requerirCerebro());
    case 'podar': {
      const { op } = opciones(args);
      return podar(requerirCerebro(), entero(op.dias, '--dias', 1, 3650));
    }
    case 'comprobar': {
      const { op, resto } = opciones(args, ['marcar']);
      return comprobar(requerirCerebro(), resto[0], op.marcar === 'si');
    }
    case 'metricas': {
      const { op } = opciones(args);
      return metricas(requerirCerebro(), entero(op.dias, '--dias', 1, 3650));
    }
    case 'evaluar':
      return evaluar(requerirCerebro());
    case 'pregunta':
      return agregarPregunta(requerirCerebro(), args[0] ?? '', args.slice(1));
    case 'historial':
      return historial(requerirCerebro(), args[0]);
    case 'deshacer':
      return deshacer(requerirCerebro(), args[0]);
    case 'respaldar':
      return respaldarAhora(requerirCerebro());
    case 'etiquetar':
      return etiquetar(requerirCerebro(), leerJson<Record<string, string>>(args[0], '{"id": "tema"}'));
    case 'crear': {
      const { op, resto } = opciones(args, ['personal']);
      const descripcion = resto.join(' ');
      if (descripcion.length < 10) throw new ErrorNota('La descripción debe tener al menos 10 caracteres: di para qué proyecto es y qué guarda.');
      await crearCerebro(requerirCerebro(), descripcion, op.personal === 'si', op.repo ? resolve(op.repo) : undefined);
      // el mapa existe desde el primer momento: así el @MAPA.md de un CLAUDE.md nunca apunta a un archivo que falta
      await regenerarMapa(requerirCerebro());
      return `Cerebro "${cerebro}" creado en ${raiz()}.`;
    }
    case 'ajustar': {
      const { op } = opciones(args);
      const nombre = requerirCerebro();
      return conBloqueo(nombre, async () => {
        const meta = await leerMeta(nombre);
        const nuevo = {
          ...meta,
          presupuestoMapa: entero(op.presupuesto, '--presupuesto', 500, 50000) ?? meta.presupuestoMapa,
          repo: op.repo ? resolve(op.repo) : meta.repo,
          descripcion: op.descripcion ?? meta.descripcion,
        };
        await guardarMeta(nuevo);
        await regenerarMapa(nombre);
        return `${nombre}: presupuesto del mapa ${nuevo.presupuestoMapa ?? 'por defecto'} tokens · repositorio ${nuevo.repo ?? 'sin definir'}`;
      });
    }
    case 'sembrar': {
      const { op, resto } = opciones(args, ['aplicar']);
      if (!resto[0]) throw new ErrorNota(`Falta la carpeta del proyecto: sembrar ${cerebro ?? '<cerebro>'} <ruta del repositorio>`);
      return sembrar(requerirCerebro(), resto[0], { aplicar: op.aplicar === 'si' });
    }
    case 'importar-obsidian': {
      const { op, resto } = opciones(args, ['aplicar']);
      if (!resto[0]) throw new ErrorNota(`Falta la carpeta de la bóveda: importar-obsidian ${cerebro ?? '<cerebro>'} <ruta>`);
      return importarObsidian(requerirCerebro(), resto[0], {
        aplicar: op.aplicar === 'si',
        tipos: op.tipos ? leerJson<Record<string, string>>(op.tipos, 'los tipos') : undefined,
      });
    }
    case 'importar-memoria': {
      const { op, resto } = opciones(args, ['aplicar']);
      return importarMemoria(requerirCerebro(), resto[0], { aplicar: op.aplicar === 'si' });
    }
    case 'importar':
      return importarLote(requerirCerebro(), leerJson<EntradaNota[]>(args[0], 'la lista de notas'));
    case 'regenerar':
      await regenerarMapa(requerirCerebro());
      return 'MAPA.md regenerado.';
    default:
      return AYUDA;
  }
}

const version = Number(process.versions.node.split('.')[0]);
if (version < 24) {
  process.stderr.write(`Cerebro necesita Node.js 24 o superior y este equipo tiene la ${process.versions.node}. Instala Node 24 LTS y vuelve a intentarlo.\n`);
  process.exit(1);
}

try {
  process.stdout.write(`${await ejecutar(process.argv.slice(2))}\n`);
} catch (e) {
  process.stderr.write(`${e instanceof ErrorNota ? e.message : `Error interno: ${e instanceof Error ? e.message : String(e)}`}\n`);
  process.exitCode = 1;
}
