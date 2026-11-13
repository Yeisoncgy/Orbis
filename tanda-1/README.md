![Orbis. La memoria de tus agentes, a la vista: local, de solo lectura y sin red.](docs/orbis-banner.png)

# Orbis · La memoria de tus agentes

Las notas que tus agentes de Claude Code escriben y leen, vistas como una red de esferas conectadas: cada tipo de
nota en su constelación, cada enlace como un hilo, y cada lectura o escritura de un agente como una chispa en vivo.

> **Hecho para dos lectores.** Los agentes entran por una herramienta de línea de comandos (`cerebro`) y gastan
> muy pocos tokens: leen un mapa corto y abren solo las notas que necesitan. Tú entras por Orbis, la parte
> visual, para ver qué saben y cómo se conecta. Todo local: solo `127.0.0.1`, solo lectura, sin red.

![](docs/pantalla-grafo.jpg)

## Qué ves

- **Constelaciones por tipo.** Contexto, decisiones, convenciones, módulos, estado, glosario y personas: cada tipo
  de nota se agrupa alrededor de su centro, con un color propio.
- **Enlaces.** Una nota enlaza a otra con `[[id]]`. Orbis dibuja el hilo y, al elegir una nota, deja a plena luz
  a sus vecinas y apenas visibles a las vecinas de sus vecinas (dos saltos).
- **Actividad en vivo.** Cuando un agente lee, busca o escribe, la esfera correspondiente se enciende.
- **Notas recientes.** Lo que escribió un agente y nadie ha revisado lleva un anillo; el aviso de salud cuenta
  cuántas faltan por consolidar.
- **Olvido suave.** Lo que nadie toca hace semanas se apaga un poco. Nunca desaparece.

![](docs/pantalla-nota.jpg)

El cerebro de las capturas es de ejemplo. Los tuyos viven en tu carpeta de documentos, no en este repositorio.

## Requisitos

| Requisito | Detalle |
|:---|:---|
| Sistema | Windows |
| Node.js | **24 LTS o superior** |
| Navegador | Edge o Chrome con WebGL 2. |
| Claude Code | Haberlo usado al menos una vez, para que exista la carpeta `.claude`. |

## Instalar

```powershell
npm install
```

Luego abre **`Abrir Orbis.cmd`** con doble clic. La primera vez compila la app sola y tarda un poco; después se
abre en segundos.

Eso basta para **ver** Orbis. Para que **tus agentes** usen los cerebros, falta el paso de abajo.

### Darle los cerebros a tus agentes

```powershell
npm run build
npm run instalar
```

- `npm run build` empaqueta la herramienta de línea de comandos en `dist/cerebro.mjs`.
- `npm run instalar` la copia a `~/.claude/cerebro/`, instala la skill `/cerebro` y agrega un bloque con marcas
  `<!-- cerebro:inicio -->` y `<!-- cerebro:fin -->` en tu `~/.claude/CLAUDE.md`. Se puede correr las veces que
  quieras: no duplica nada. Antes de tocar tu configuración guarda un respaldo
  (`settings.json.antes-de-cerebro`).
- Lo corres tú, no un agente: edita configuración de tu usuario.

## Abrir Orbis

Doble clic en **`Abrir Orbis.cmd`**. No abre ninguna ventana de terminal: en unos segundos Orbis aparece en el
navegador. Si ya estaba abierto, solo abre otra pestaña. **Se apaga sola 3 minutos después de cerrar la última
pestaña.** Si algo falla, un mensaje dice por qué.

Para tenerlo en el escritorio y en la barra de tareas, crea un acceso directo (clic derecho en el escritorio >
Nuevo > Acceso directo) con este destino, cambiando la carpeta por la tuya:

```
wscript.exe "C:\ruta\a\Orbis\scripts\abrir-oculto.js"
```

En Propiedades > Cambiar icono elige `scripts\cerebro.ico`. Luego clic derecho en el acceso directo > Mostrar más
opciones > Anclar a la barra de tareas.

Para verlo con una consola (se apaga al cerrarla): `npm run app:abrir`.

## Cómo lo usan los agentes

Los agentes no necesitan Orbis abierto. Trabajan con el comando `cerebro` desde la herramienta Bash:

| Comando | Para qué |
|:---|:---|
| `cerebro mapa <cerebro>` | Índice corto: una línea por nota, por tipo. Es lo primero que se lee. |
| `cerebro buscar <cerebro> <palabras>` | Notas por palabras, sin importar tildes. |
| `cerebro leer <cerebro> <id...>` | Notas completas, con a quién enlazan y quién las enlaza. |
| `cerebro escribir <cerebro>` | Crea o actualiza una nota (llega por la entrada estándar). |
| `cerebro estado <cerebro> <estado> <id...>` | Marca notas como `reciente`, `consolidada` u `obsoleta`. |
| `cerebro etiquetar <cerebro> <temas.json>` | Ordena etiquetas sin tocar contenido ni fecha. |
| `cerebro verificar <cerebro>` | Enlaces rotos, notas sueltas y tamaño del mapa. |

La skill `/cerebro` le enseña esto al agente. Con `/cerebro guardar ...` guarda lo aprendido,
con `/cerebro consolidar` pasa lo reciente a largo plazo y con `/cerebro sembrar` crea las primeras notas de un
proyecto a partir de su documentación.

Cada cerebro genera un `MAPA.md`. Si el `CLAUDE.md` de tu proyecto lo importa con una línea `@`, el agente ya lo
tiene en contexto desde el primer mensaje y gasta pocos tokens.

### Cómo es una nota

```
---
titulo: Caché de consultas con vencimiento corto
tipo: decision
descripcion: Las consultas se guardan 10 minutos; reemplaza una caché sin vencimiento que servía datos viejos
tags: [rendimiento]
---
Qué se decidió, **por qué**, y enlaces a lo relacionado: [[servicio-de-consultas]].
```

- **Tipos:** `contexto`, `decision`, `convencion`, `modulo`, `estado`, `glosario` y `persona`.
- **Estados:** `reciente` (lo que escribe un agente), `consolidada` (revisada) y `obsoleta` (se oculta, nunca se borra).
- **Una idea por nota,** con el porqué, y enlazada con `[[id]]` a lo relacionado. La `descripcion` es lo que se ve
  en el mapa.
- Las notas son archivos Markdown en `Documents\Cerebros\<cerebro>\notas\`, con un commit de git por nota si hay git.

## Controles

| Control | Qué hace |
|---|---|
| `Ctrl K` o `/` | Buscar en el cerebro. Flechas y Enter para elegir. |
| Clic en una esfera | Abre la nota a la derecha y la cámara vuela hasta ella. |
| `Esc` | Cierra la nota. |
| Botón de lista (abajo a la derecha) | Todas las notas en una lista, lo más reciente primero. |
| Filtros de abajo | Clic oculta o muestra un tipo; doble clic deja solo ese tipo. |
| Pastilla "por consolidar" | Salud del cerebro: recientes, notas sin enlaces y enlaces rotos, con un botón que copia el comando para pegarlo en Claude Code. |
| Cabecera de cerebros | Cambia entre cerebros. El personal (el de tus preferencias) va primero. |

Enlace directo a una nota: `http://127.0.0.1:4810/?cerebro=<nombre>&nota=<id>`.

## Privacidad

- Orbis solo escucha en `127.0.0.1` y solo acepta lecturas (`GET`): nadie más en la red puede entrar y la app no
  puede cambiar tus notas. También rechaza otros `Host`, para que una página web cualquiera no pueda leerlas.
- Tus cerebros viven en `Documents\Cerebros\` (o donde indique `CEREBRO_RAIZ`), **nunca dentro de este
  repositorio**. No los copies aquí.
- Orbis no registra qué miras tú: el refuerzo (las esferas que crecen) mide solo lo que leen los agentes.
- No llama a ningún servicio externo ni usa tokens.

## Si algo falla

- **Un mensaje dice que Orbis no pudo abrir.** Lo más común es que el puerto 4810 lo use otra aplicación. Cambia
  el puerto con la variable `CEREBRO_PUERTO` o ciérrala. Para ver el detalle, corre `npm run app:abrir`.
- **"No se pudo conectar con Orbis".** El servidor se apagó (por inactividad) o se cerró. Vuelve a abrirlo con
  `Abrir Orbis.cmd`.
- **"Aún no hay cerebros".** Crea el primero desde una sesión de Claude Code con `/cerebro nuevo`, o con
  `cerebro crear <nombre> "<descripción>"`.
- **Los agentes no usan los cerebros.** Corre `npm run build` y `npm run instalar`, y abre una sesión **nueva** de
  Claude Code. Con `cerebro listar` confirmas que ve tus cerebros.
- **Pantalla en blanco al desarrollar en Windows.** Si el directorio actual llega como `c:` y `C:` mezclados,
  Vite empaqueta React dos veces. `vite.config.ts` ya usa la ruta real y evita el problema.

## Desarrollo

```powershell
npm run typecheck
npm test
npm run build:app
```

```
Abrir Orbis.cmd     doble clic: abre la app sin ventana de terminal
core/               formato de nota, grafo, búsqueda, escritura, git y actividad (con sus pruebas)
cli/                el comando cerebro que usan los agentes
skill/              la skill /cerebro que se instala en Claude Code
servidor/           servidor local de Orbis (solo lectura, solo 127.0.0.1, actividad en vivo)
app/                la app visual: React 19, Vite 6, Tailwind 4 y 3d-force-graph
scripts/            instalador, lanzador sin ventana, icono y pruebas del apagado automático
docs/               imágenes de este README
```

Tras cambiar `core/`, `cli/` o la skill: `npm run build` y `npm run instalar`. Tras cambiar `app/`:
`npm run build:app` (el servidor lee `dist/app` en cada pedido, no hace falta reiniciarlo).
