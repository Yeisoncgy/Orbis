---
name: cerebro
description: Memoria de trabajo entre sesiones (cerebros en Markdown). Úsala al empezar una tarea en un proyecto con cerebro, antes de decidir algo que quizá ya se decidió, cuando el usuario diga "recuerda", "guarda esto", "qué sabemos de", "consolida", "siembra" o "crea un cerebro", y antes de terminar una sesión en la que se decidió o se descubrió algo.
---

# Cerebro

Un cerebro es la memoria de un proyecto: notas cortas en Markdown, enlazadas, que sobreviven a la sesión. Todo pasa por este CLI, desde la herramienta **Bash**:

```bash
node "{{CEREBRO}}" <comando> <cerebro> ...
```

El cerebro del proyecto es el de la línea `Cerebro: <nombre>` de su `CLAUDE.md`. El marcado `(personal)` en `listar` guarda cómo trabaja el usuario. Sin argumentos, el CLI imprime todos los comandos.

## Leer: antes de explorar el repositorio

1. **Ubícate con el mapa.** Si el `CLAUDE.md` lo importa ya lo tienes; si no, `mapa <cerebro>`. Cuando el mapa es un índice por temas, abre el tema con `mapa <cerebro> <tema>`.
2. **Busca con las palabras de la tarea:** `buscar <cerebro> <palabras>`. Admite `"frase exacta"`, `--tipo`, `--tag`, `--desde` y `--todos` (todos los cerebros). Termina cuando tengas los ids que vas a usar o un «Sin resultados».
3. **Abre solo lo necesario.** `leer <cerebro> <id> --breve` da la ficha y las secciones; `leer <cerebro> <id>` la nota completa; `--seccion "título"` una sola parte. `vecinos <cerebro> <id>` muestra qué la rodea.

Cuánto fiarse de una nota lo dice su cabecera:

| Dice | Qué hacer |
|---|---|
| `SIN REVISAR` | La escribió un agente y nadie la consolidó. Contrástala con el repositorio antes de actuar. |
| `VENCIDA` o `POR REVISAR` | Confirma que sigue siendo cierta. Si cambió, corrígela. |
| `Reemplazada por` o `Fusionada en` | Lee esa otra. |
| `En conflicto con` | Muéstrale las dos versiones al usuario; decide él. |

El repositorio manda: si una nota contradice el código, gana el código y la nota se corrige en ese momento.

**Sin resultados:** prueba otra forma de decirlo o las palabras parecidas que sugiere el CLI, y luego `--todos`. Si aparece por otro camino, agrégale a esa nota un `alias` con las palabras que usaste: así la próxima búsqueda la encuentra.

## Guardar: lo que una sesión futura necesitaría

Entra al cerebro lo que no se puede sacar del repositorio:

- una **decisión y su porqué**, con las alternativas descartadas;
- algo **no obvio que costó descubrir**: una trampa, una causa raíz, un límite;
- una **preferencia o corrección del usuario** sobre cómo trabajar (va al cerebro personal);
- **en qué quedó** un trabajo que se va a retomar.

Lo que el código, la documentación versionada o `git log` ya dicen se queda donde está. Los secretos nunca entran: el CLI rechaza claves, tokens y contraseñas; escribe dónde viven («en `.env.local`»).

Pasos:

1. `buscar` el tema. Si ya hay una nota, **actualízala**: léela completa y vuelve a escribirla con `id: <id>` y el contenido entero que debe quedar.
2. Si no existe, escríbela:

```bash
node "{{CEREBRO}}" escribir mi-proyecto <<'NOTA'
---
titulo: Caché de consultas con vencimiento corto
tipo: decision
descripcion: Las consultas se guardan 10 minutos; antes no vencían y servían datos viejos
tags: [rendimiento]
fuente: [src/cache.ts]
---
Qué se decidió y **por qué**. Enlaza lo relacionado: [[servicio-de-consultas]].
NOTA
```

3. **Atiende la respuesta del CLI** hasta que quede sin avisos: enlaces que no existen (corrígelos), «sin conexiones» (enlaza una de las candidatas), «se parece a» (léelas: si dicen lo mismo, fusiona; si dicen lo contrario, pregúntale al usuario).

Campos:

| Campo | Para qué |
|---|---|
| `titulo`, `tipo`, `descripcion` | Obligatorios. La descripción es la única línea que se ve en el mapa: una frase de hasta 140 caracteres que permita decidir si abrir la nota. |
| `tags` | La primera es el tema por el que se agrupa en el mapa. |
| `alias` | Otras palabras con las que alguien la buscaría. |
| `fuente` | Archivo, commit o conversación de donde sale. |
| `valido_hasta` | Fecha (AAAA-MM-DD) tras la cual hay que confirmarla. Úsalo en todo lo que caduca. |
| `reemplaza`, `depende_de`, `contradice` | Listas de ids. |

Tipos: `contexto` (qué es y para quién), `decision`, `convencion` (cómo se trabaja), `modulo` (una parte del sistema), `estado` (en qué va), `glosario`, `persona`.

Una idea por nota. Si tiene dos temas, son dos notas enlazadas.

## Antes de terminar la sesión

Si en la sesión se decidió o se descubrió algo, corre `cerrar <cerebro>`: lista qué revisar y acepta varias notas de una vez, separadas por una línea `===`. Quedan como recientes hasta que alguien las consolide. Si no hubo nada que valga la pena, no se guarda nada.

## Cuidar el cerebro (cuando el usuario lo pida)

| El usuario pide | Comando | Qué sigue |
|---|---|---|
| consolidar | `consolidar <cerebro>` | Propone qué hacer con cada reciente. Aplica con `estado` y `escribir`; termina con cuántas quedaron consolidadas, fusionadas y por decidir. |
| limpiar, podar | `podar <cerebro>` | Informe de lo que sobra. Retira con `estado <cerebro> obsoleta <id...>` solo lo que el usuario apruebe. |
| revisar si está al día | `comprobar <cerebro> <repo> --marcar` | Marca las notas que citan archivos que ya no existen. |
| salud | `verificar <cerebro>` | Enlaces rotos, sin revisar, vencidas y costo del mapa. |
| si sirve | `metricas <cerebro>` y `evaluar <cerebro>` | Uso real y calidad de la búsqueda. |
| crear un cerebro | `crear <nombre> "<descripción>" --repo <ruta>` | Agrega `Cerebro: <nombre>` al `CLAUDE.md` del proyecto. |
| sembrar | `sembrar <cerebro> <repo>` | Muestra qué crearía; con `--aplicar` lo escribe. Después reescribe las notas de resumen guardando el porqué. |
| traer de Obsidian o de la memoria de Claude Code | `importar-obsidian`, `importar-memoria` | Igual: vista previa, luego `--aplicar`. |
| deshacer | `historial <cerebro>` y `deshacer <cerebro> [código]` | Revierte un cambio sin borrar historia. |

Las notas se cambian solo con el CLI: valida, enlaza, respalda y deja historial.

## Subagentes

Un subagente no ve esta skill. Al delegar, pásale los ids que necesita y la línea de comando completa para leerlos; lo que descubra lo guardas tú al recibir su informe.
