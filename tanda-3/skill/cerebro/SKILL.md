---
name: cerebro
description: Lee, guarda, consolida y siembra los cerebros del usuario (memoria de trabajo en Markdown). Úsala con /cerebro, cuando el usuario diga "guarda esto en el cerebro", "recuerda que...", "consolida el cerebro", "siembra un cerebro", "crea un cerebro para este proyecto", o pregunte qué sabe el cerebro de algo.
---

# Cerebro

Los cerebros viven en `Documents\Cerebros\<nombre>\notas\*.md`. Se manejan solo con este CLI, desde la herramienta **Bash** (no PowerShell):

```bash
node "{{CEREBRO}}" <comando> ...
```

No edites esos archivos a mano: el CLI valida, enlaza, registra la actividad y hace el commit. No escribas scripts propios para leer o recorrer los cerebros.

| Comando | Para qué |
|---|---|
| `listar` | cerebros disponibles; el `(personal)` es la manera de trabajar del usuario |
| `mapa <cerebro>` | índice compacto: id + una línea por nota, por tipo. Léelo primero |
| `buscar <cerebro> <palabras> [--tipo t]` | notas por palabras, sin importar tildes |
| `leer <cerebro> <id> [id...]` | notas completas con sus enlaces (hasta 10) |
| `escribir <cerebro>` | crea o actualiza una nota que llega por stdin (ver abajo) |
| `estado <cerebro> <consolidada\|obsoleta> <id...> [--fusionada-en id]` | cambia el estado sin reescribir la nota |
| `crear <cerebro> <descripcion>` | cerebro nuevo y vacío |
| `verificar <cerebro>` | enlaces rotos, notas sueltas y tamaño del mapa |

El cerebro del proyecto es el de la línea `Cerebro: <nombre>` del `CLAUDE.md` del proyecto.

## Escribir una nota

```bash
node "{{CEREBRO}}" escribir mi-proyecto <<'NOTA'
---
titulo: Caché de consultas con vencimiento corto
tipo: decision
descripcion: Las consultas se guardan 10 minutos; reemplaza la caché sin vencimiento que servía datos viejos
tags: [rendimiento]
---
Qué se decidió, **por qué**, y enlaces a lo relacionado: [[servicio-de-consultas]].
NOTA
```

- Para actualizar una nota existente, agrega `id: <id>` al frontmatter. Si no, el id sale del título.
- Si la respuesta dice que quedó colgada del hub, vuelve a escribirla enlazando alguna de las candidatas que sugiere.
- Si dice que hay enlaces que no existen, corrígelos.
- **Etiquetas de una `convencion` en el cerebro personal:** la primera es su tema, una de `trabajo`, `interfaz`, `plataformas`, `seguridad`, `codigo`, `publicacion`, `comunicacion` (así la app las agrupa en el grafo). Después, las específicas que quieras (`edr`, `git`...). Evita las vagas como `feedback` o `preferencias`.

## Qué hacer según el argumento

**Sin argumento o con una pregunta** (`/cerebro`, `/cerebro qué sabemos de X`): corre `mapa` del cerebro del proyecto (o del personal si no hay) y responde con lo que ya está en el cerebro. Usa `buscar` o `leer` solo si el mapa no alcanza.

**`guardar <algo>`** o "recuerda que...": primero `buscar` por si ya existe una nota sobre eso. Si existe, actualízala con su `id`; si no, crea una. Decide el cerebro: lo del proyecto va al del proyecto; cómo trabaja el usuario, sus preferencias y convenciones generales van al personal.

**`consolidar [cerebro]`**: pasa la memoria de corto plazo a largo plazo.
1. `mapa` y toma las notas marcadas `(reciente)`.
2. `leer` las recientes junto con las consolidadas que tratan lo mismo (`buscar` por su título).
3. Por cada reciente decide una sola cosa:
   - Duplica a otra: integra lo nuevo en la existente (`escribir` con su `id`) y marca la reciente `obsoleta --fusionada-en <id>`.
   - Contradice a otra: no elijas tú. Muéstrale al usuario las dos versiones y pregunta cuál vale.
   - Es nueva y válida: mejora sus enlaces si hace falta y márcala `consolidada`.
4. Termina con un resumen corto: cuántas se consolidaron, cuántas se fusionaron y cuáles quedan por decidir.

**`sembrar <cerebro> [ruta del proyecto]`**: crea las notas iniciales a partir de la documentación del proyecto (`CLAUDE.md`, `README.md`, `ESTADO.md`, `docs/`, ADRs). No leas código fuente salvo para confirmar un dato. Si el cerebro no existe, créalo con `crear`. Escribe primero las notas `contexto` y luego las demás, enlazadas a ellas, con `estado: consolidada` porque vienen de documentación ya revisada.

**`nuevo <nombre>`**: `crear` el cerebro y agregar la línea `Cerebro: <nombre>` al `CLAUDE.md` del proyecto actual. Pregunta la descripción si no es obvia.

## Cómo es una buena nota

- **Una idea por nota.** Si tiene dos temas, son dos notas enlazadas.
- **Guarda el porqué**, no lo que el código ya dice. "Usamos X porque Y falló con Z" vale; "el archivo A exporta B" no.
- **La `descripcion` es lo que se ve en el mapa**: una línea concreta (máximo unos 140 caracteres) que permita decidir si abrir la nota sin abrirla.
- **Enlaza siempre** con `[[id]]` a notas relacionadas.
- **Cero datos inventados**, y nunca secretos, tokens ni contraseñas.
- **Tipos:** `contexto` (qué es y para quién), `decision` (qué se decidió y por qué), `convencion` (cómo se trabaja), `modulo` (una parte del sistema), `estado` (en qué va), `glosario` (términos del negocio), `persona` (quién es quién).
