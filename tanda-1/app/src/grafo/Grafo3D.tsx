import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import { forceCollide } from 'd3-force-3d';
import { useEffect, useRef } from 'react';
import { Color, FogExp2, Object3D, PerspectiveCamera, Vector3, type InterleavedBuffer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Tipo } from '../../../core/src/tipos.ts';
import type { GrafoApi } from '../lib/api.ts';
import { pulsos, useApp } from '../lib/estado.ts';
import { ETIQUETA_TIPO, SINGULAR_TIPO } from '../lib/tipos.ts';
import { Chispas, type Curva } from './chispas.ts';
import { ANCLA, radioPara } from './disposicion.ts';
import { construirModelo, idDe, type Enlace, type Nodo } from './modelo.ts';
import { crearVisual, type Visual } from './visuales.ts';

type EnlaceG = Enlace & { indice: number; alfa: number; pintado: number; ca: Color; cb: Color; curva?: Curva; giro?: number };

// Todos los filamentos en una sola malla: una llamada de dibujo en vez de una por enlace
interface Filamentos {
  malla: LineSegments2;
  posiciones: InterleavedBuffer;
  colores: InterleavedBuffer;
  posicionesSucias: boolean;
}
type Instancia = ForceGraph3DInstance<Nodo, EnlaceG>;

const PAPEL = new Color('#FAFBFC');
const NEUTRO = new Color('#A7B1C0');
const COLOR_ACCION: Record<string, string> = {
  leer: '#C81E1E',
  buscar: '#0EA5E9',
  escribir: '#10B981',
  estado: '#F59E0B',
  mapa: '#3D5AFE',
};
const SEGMENTOS = 10;
const DURACION_DISPARO = 2000;
const PANEL_NOTA = 476;

export const accionesGrafo = {
  encuadrar: () => {},
};

interface Constelacion {
  objeto: CSS2DObject;
  caja: HTMLDivElement;
  opacidad: number;
}

interface Motor {
  g: Instancia;
  visuales: Map<string, Visual>;
  nodos: Map<string, Nodo>;
  enlaces: EnlaceG[];
  vecinos: Map<string, Set<string>>;
  incidentes: Map<string, EnlaceG[]>;
  foco?: Set<string>;
  /** segundo salto de la nota elegida: las vecinas de sus vecinas, tenues, para ver por donde sigue la red */
  foco2?: Set<string>;
  etiquetas: Set<string>;
  seleccion?: string;
  desplazamiento: number;
  radio: number;
  constelaciones: Map<Tipo, Constelacion>;
  /** rótulo de cada tema dentro de una constelación grande, clave `tipo:tema` */
  temas: Map<string, Constelacion & { tipo: Tipo; tema: string }>;
  chispas: Chispas;
  densidad: { value: number };
  despertar: number;
  filamentos?: Filamentos;
  material: LineMaterial;
}

function calcularFoco(m: Motor): void {
  const { seleccion, hover, resaltadas } = useApp.getState();
  const conVecinos = (id: string) => new Set([id, ...(m.vecinos.get(id) ?? [])]);
  let foco: Set<string> | undefined;
  if (seleccion && m.nodos.has(seleccion)) foco = conVecinos(seleccion);
  else if (resaltadas && resaltadas.size) foco = new Set(resaltadas);
  else if (hover && m.nodos.has(hover)) foco = conVecinos(hover);
  m.foco = foco;
  m.foco2 = undefined;
  if (seleccion && foco) {
    const segundo = new Set<string>();
    for (const v of m.vecinos.get(seleccion) ?? []) {
      for (const w of m.vecinos.get(v) ?? []) if (!foco.has(w)) segundo.add(w);
    }
    m.foco2 = segundo;
  }
  m.seleccion = seleccion;
  // poco texto en pantalla: en reposo ningún nombre; solo lo que se mira, lo seleccionado y sus vecinas
  const etiquetas = new Set<string>();
  const vecinas = seleccion ? (m.vecinos.get(seleccion) ?? new Set<string>()) : new Set<string>();
  if (seleccion) {
    etiquetas.add(seleccion);
    for (const v of vecinas) etiquetas.add(v);
  } else if (resaltadas?.size) for (const id of [...resaltadas].slice(0, 5)) etiquetas.add(id);
  if (hover) etiquetas.add(hover);
  m.etiquetas = etiquetas;
  for (const [id, v] of m.visuales) {
    v.etiqueta.classList.toggle('es-seleccion', id === seleccion);
    v.etiqueta.classList.toggle('es-vecina', id !== seleccion && id !== hover && vecinas.has(id));
  }
}

// Fuerza propia: cada nota tiende a la constelación de su tipo y nada se escapa del espacio
function fuerzaConstelaciones(m: Motor) {
  let nodos: Nodo[] = [];
  const fuerza = (alpha: number) => {
    const R = m.radio;
    for (const n of nodos) {
      if (n.hub || n.x === undefined) continue;
      const [ax, ay, az] = ANCLA[n.tipo];
      // constelación grande: cada tema tiene su rincón alrededor del ancla del tipo
      const [sx, sy, sz] = n.sub ?? [0, 0, 0];
      const abre = R * 0.9;
      n.vx! += (ax * R + sx * abre - n.x) * 0.2 * alpha;
      n.vy! += (ay * R + sy * abre - n.y!) * 0.2 * alpha;
      n.vz! += (az * R + sz * abre - n.z!) * 0.2 * alpha;
      const d = Math.hypot(n.x, n.y!, n.z!);
      if (d > R * 1.15) {
        const k = ((d - R * 1.15) / d) * 0.2;
        n.vx! -= n.x * k;
        n.vy! -= n.y! * k;
        n.vz! -= n.z! * k;
      }
    }
  };
  fuerza.initialize = (lista: Nodo[]) => {
    nodos = lista;
  };
  return fuerza;
}

function encuadrar(m: Motor, ms: number): void {
  const camara = m.g.camera() as PerspectiveCamera;
  const ocultos = useApp.getState().tiposOcultos;
  const visibles = [...m.nodos.values()].filter((n) => n.x !== undefined && !ocultos.has(n.tipo));
  const centro = new Vector3();
  for (const n of visibles) centro.add(new Vector3(n.x, n.y, n.z));
  if (visibles.length) centro.divideScalar(visibles.length);
  let radio = 40;
  for (const n of visibles) radio = Math.max(radio, centro.distanceTo(new Vector3(n.x, n.y, n.z)) + n.radio * 2);
  const vertical = (camara.fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * camara.aspect);
  // margen para las piezas flotantes de arriba y abajo
  const distancia = (radio / Math.sin(Math.min(vertical, horizontal))) * 0.9;
  const dir = new Vector3(0.2, 0.14, 1).normalize().multiplyScalar(distancia);
  m.g.cameraPosition({ x: centro.x + dir.x, y: centro.y + dir.y, z: centro.z + dir.z }, { x: centro.x, y: centro.y, z: centro.z }, ms);
}

function volarA(m: Motor, id: string): void {
  const n = m.nodos.get(id);
  if (!n || n.x === undefined) return;
  const p = new Vector3(n.x, n.y, n.z);
  // distancia suficiente para ver la nota con todas sus vecinas
  let alcance = 30;
  for (const v of m.vecinos.get(id) ?? []) {
    const o = m.nodos.get(v);
    if (o?.x !== undefined) alcance = Math.max(alcance, p.distanceTo(new Vector3(o.x, o.y, o.z)));
  }
  const camara = m.g.camera() as PerspectiveCamera;
  // el espacio libre es la parte izquierda (el panel de la nota ocupa la derecha)
  const libre = Math.min(Math.tan((camara.fov * Math.PI) / 360), Math.tan((camara.fov * Math.PI) / 360) * camara.aspect * 0.62);
  const distancia = Math.min(m.radio * 3.4, (alcance / libre) * 1.15 + 30);
  const desde = camara.position.clone().sub(p).normalize();
  const destino = p.clone().add(desde.multiplyScalar(distancia));
  m.g.cameraPosition({ x: destino.x, y: destino.y, z: destino.z }, { x: p.x, y: p.y, z: p.z }, 1500);
}

function curvaDe(l: EnlaceG, a: Vector3, b: Vector3): Curva {
  const c = (l.curva ??= { p0: new Vector3(), p1: new Vector3(), p2: new Vector3() });
  c.p0.copy(a);
  c.p2.copy(b);
  const v = b.clone().sub(a);
  const largo = v.length() || 1;
  v.divideScalar(largo);
  const n1 = new Vector3(0, 1, 0).cross(v);
  if (n1.lengthSq() < 1e-4) n1.set(1, 0, 0);
  n1.normalize();
  const n2 = v.clone().cross(n1);
  const giro = (l.giro ??= Math.random() * Math.PI * 2);
  c.p1
    .copy(a)
    .add(b)
    .multiplyScalar(0.5)
    .addScaledVector(n1, Math.cos(giro) * largo * 0.16)
    .addScaledVector(n2, Math.sin(giro) * largo * 0.16);
  return c;
}

// El cerebro termina de despertar cuando nacen las neuronas más lejanas
function finDelDespertar(nodos: Nodo[]): number {
  return 500 + Math.max(0, ...nodos.map((n) => (n.x === undefined ? 0 : Math.hypot(n.x, n.y ?? 0, n.z ?? 0) * 7))) * 0.4;
}

export function Grafo3D({ datos }: { datos: GrafoApi }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  const obsoletas = useApp((s) => s.obsoletas);
  const rotacion = useApp((s) => s.rotacion);
  const tiposOcultos = useApp((s) => s.tiposOcultos);
  const hover = useApp((s) => s.hover);

  useEffect(() => {
    const el = contenedor.current!;
    const css2d = new CSS2DRenderer();
    css2d.domElement.style.pointerEvents = 'none';
    const g = new ForceGraph3D(el, {
      controlType: 'orbit',
      rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' },
      extraRenderers: [css2d as unknown as never],
    }) as unknown as Instancia;
    const escalaPx = { value: 400 };
    const densidad = { value: 0.002 };
    const m: Motor = {
      g,
      visuales: new Map(),
      nodos: new Map(),
      enlaces: [],
      vecinos: new Map(),
      incidentes: new Map(),
      etiquetas: new Set(),
      desplazamiento: 0,
      radio: 125,
      constelaciones: new Map(),
      temas: new Map(),
      chispas: new Chispas(escalaPx),
      densidad,
      despertar: performance.now(),
      material: new LineMaterial({ linewidth: 1.3, vertexColors: true, worldUnits: false, depthWrite: false }),
    };
    m.material.resolution.set(el.clientWidth, el.clientHeight);
    motor.current = m;

    g.backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .width(el.clientWidth)
      .height(el.clientHeight)
      .nodeId('id')
      .nodeLabel(() => '')
      .nodeThreeObject((n) => {
        const v = crearVisual(n, densidad);
        m.visuales.set(n.id, v);
        return v.grupo;
      })
      // el enlace no dibuja nada propio: su curva se escribe en la malla común de filamentos
      .linkThreeObject(() => new Object3D())
      .linkPositionUpdate((_obj, { start, end }, l) => {
        const f = m.filamentos;
        const c = curvaDe(l, new Vector3(start.x, start.y, start.z), new Vector3(end.x, end.y, end.z));
        if (!f) return true;
        const arr = f.posiciones.array as Float32Array;
        let o = l.indice * SEGMENTOS * 6;
        let ax = c.p0.x;
        let ay = c.p0.y;
        let az = c.p0.z;
        for (let i = 1; i <= SEGMENTOS; i++) {
          const t = i / SEGMENTOS;
          const u = 1 - t;
          const bx = c.p0.x * u * u + c.p1.x * 2 * u * t + c.p2.x * t * t;
          const by = c.p0.y * u * u + c.p1.y * 2 * u * t + c.p2.y * t * t;
          const bz = c.p0.z * u * u + c.p1.z * 2 * u * t + c.p2.z * t * t;
          arr[o++] = ax;
          arr[o++] = ay;
          arr[o++] = az;
          arr[o++] = bx;
          arr[o++] = by;
          arr[o++] = bz;
          ax = bx;
          ay = by;
          az = bz;
        }
        f.posicionesSucias = true;
        return true;
      })
      .warmupTicks(140)
      .cooldownTicks(200)
      .d3AlphaDecay(0.035)
      .d3VelocityDecay(0.38)
      .onNodeHover((n) => {
        el.style.cursor = n ? 'pointer' : 'grab';
        useApp.getState().setHover(n && !n.hub ? n.id : undefined);
      })
      .onNodeClick((n) => {
        if (n.hub) useApp.getState().soloTipo(n.tipo);
        else useApp.getState().seleccionar(n.id);
      })
      .onBackgroundClick(() => useApp.getState().seleccionar(undefined));

    const carga = g.d3Force('charge') as unknown as { strength: (v: number) => void; distanceMax: (v: number) => void };
    carga.strength(-60);
    carga.distanceMax(75);
    const enlace = g.d3Force('link') as unknown as { distance: (f: (l: EnlaceG) => number) => { strength: (f: (l: EnlaceG) => number) => void } };
    // dentro de un tipo los enlaces acercan; entre tipos casi no tiran, para que cada constelación se lea sola
    const mismoTipo = (l: EnlaceG) => m.nodos.get(idDe(l.source))?.tipo === m.nodos.get(idDe(l.target))?.tipo;
    enlace.distance((l) => (l.clase === 'hub' ? 16 : mismoTipo(l) ? 24 : 60)).strength((l) => (l.clase === 'hub' ? 0.4 : mismoTipo(l) ? 0.16 : 0.012));
    g.d3Force('center', null);
    g.d3Force('constelaciones', fuerzaConstelaciones(m) as never);
    // ninguna neurona se monta sobre otra
    g.d3Force('colision', forceCollide<Nodo>().radius((n) => (n.hub ? 2 : n.radio * 2.1 + 3)).strength(0.9).iterations(2) as never);

    g.lights([]);
    const niebla = new FogExp2(PAPEL, 0.002);
    g.scene().fog = niebla;
    g.scene().add(m.chispas.puntos);
    const renderer = g.renderer();
    // 1.5 basta para que se vea nítido; 2 cuesta casi el doble de píxeles
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);

    const camara = g.camera() as PerspectiveCamera;
    const controles = g.controls() as OrbitControls;
    controles.enableDamping = true;
    controles.dampingFactor = 0.06;
    controles.rotateSpeed = 0.55;
    controles.zoomSpeed = 0.8;
    controles.autoRotateSpeed = 0.28;
    controles.minDistance = 20;
    controles.maxDistance = 2200;
    const ajustarNiebla = () => {
      const d = camara.position.distanceTo(controles.target);
      // la niebla da profundidad a escala del cerebro entero: al acercarse no borra a las vecinas
      niebla.density = 0.36 / Math.max(d, m.radio * 2.4);
      densidad.value = niebla.density;
    };
    controles.addEventListener('change', ajustarNiebla);
    g.cameraPosition({ x: 0, y: 0, z: 1400 });
    ajustarNiebla();
    el.style.cursor = 'grab';

    accionesGrafo.encuadrar = () => {
      useApp.getState().seleccionar(undefined);
      encuadrar(m, 1200);
    };

    // las etiquetas no se pisan: la más importante gana su lugar en pantalla
    const proyectada = new Vector3();
    const resolverEtiquetas = (ancho: number, alto: number) => {
      const { hover: h, tiposOcultos: ocultos } = useApp.getState();
      const prioridad = (id: string) => (id === m.seleccion ? 1e6 : id === h ? 1e5 : (m.nodos.get(id)?.importancia ?? 0));
      const ocupados: [number, number, number, number][] = [];
      for (const v of m.visuales.values()) v.tapada = false;
      const candidatas = [...m.etiquetas].filter((id) => {
        const n = m.nodos.get(id);
        return n && !n.hub && !ocultos.has(n.tipo) && m.visuales.has(id);
      });
      candidatas.sort((a, b) => prioridad(b) - prioridad(a));
      for (const id of candidatas) {
        const v = m.visuales.get(id)!;
        v.grupo.getWorldPosition(proyectada).project(camara);
        if (proyectada.z > 1) {
          v.tapada = true;
          continue;
        }
        const x = ((proyectada.x + 1) / 2) * ancho;
        const y = ((1 - proyectada.y) / 2) * alto;
        if (!v.anchoEtiqueta) v.anchoEtiqueta = v.etiqueta.offsetWidth;
        const w = (v.anchoEtiqueta || 140) / 2 + 8;
        const caja: [number, number, number, number] = [x - w, y, x + w, y + 34];
        if (ocupados.some((o) => caja[0] < o[2] && caja[2] > o[0] && caja[1] < o[3] && caja[3] > o[1])) v.tapada = true;
        else ocupados.push(caja);
      }
    };

    // rótulo de cada constelación, sobre su centro
    const ubicarConstelaciones = () => {
      const suma = new Map<Tipo, { x: number; y: number; z: number; n: number; techo: number }>();
      for (const n of m.nodos.values()) {
        if (n.hub || n.x === undefined) continue;
        const s = suma.get(n.tipo) ?? { x: 0, y: 0, z: 0, n: 0, techo: -Infinity };
        s.x += n.x;
        s.y += n.y!;
        s.z += n.z!;
        s.n++;
        s.techo = Math.max(s.techo, n.y!);
        suma.set(n.tipo, s);
      }
      for (const [tipo, c] of m.constelaciones) {
        const s = suma.get(tipo);
        if (!s) continue;
        const centro = new Vector3(s.x / s.n, s.y / s.n, s.z / s.n);
        let alcance = 0;
        for (const n of m.nodos.values()) if (n.tipo === tipo && !n.hub && n.x !== undefined) alcance = Math.max(alcance, centro.distanceTo(new Vector3(n.x, n.y, n.z)));
        // el rótulo flota por encima de su constelación
        c.objeto.position.set(centro.x, centro.y + alcance * 0.85 + 14, centro.z);
      }
      // rótulo de cada tema: sobre el centro de sus notas
      const temas = new Map<string, { x: number; y: number; z: number; n: number }>();
      for (const n of m.nodos.values()) {
        if (!n.tema || n.x === undefined) continue;
        const clave = `${n.tipo}:${n.tema}`;
        const s = temas.get(clave) ?? { x: 0, y: 0, z: 0, n: 0 };
        s.x += n.x;
        s.y += n.y!;
        s.z += n.z!;
        s.n++;
        temas.set(clave, s);
      }
      for (const [clave, t] of m.temas) {
        const s = temas.get(clave);
        if (s) t.objeto.position.set(s.x / s.n, s.y / s.n - 9, s.z / s.n);
      }
    };

    const disparar = (id: string, color: string, fuerte: boolean, retardo = 0) => {
      const v = m.visuales.get(id);
      if (!v) return;
      v.disparoInicio = performance.now() + retardo;
      v.disparoFuerte = fuerte;
      v.colorDisparo.set(color);
      const salidas = (m.incidentes.get(id) ?? []).filter((l) => l.curva);
      const elegidas = fuerte ? salidas.slice(0, 16) : [...salidas].sort(() => Math.random() - 0.5).slice(0, 3);
      setTimeout(() => {
        for (const l of elegidas) m.chispas.lanzar(l.curva!, color, { fuerza: fuerte ? 1.3 : 0.55, inverso: idDe(l.target) === id, lenta: !fuerte });
      }, retardo + (fuerte ? 120 : 260));
    };

    let anterior = performance.now();
    let cuadro = 0;
    let cuadros = 0;
    let siguienteEspontaneo = performance.now() + 2600;
    const animar = (ahora: number) => {
      const dt = Math.min(0.1, (ahora - anterior) / 1000);
      anterior = ahora;
      const k = 1 - Math.pow(0.0025, dt);
      const ancho = el.clientWidth;
      const alto = el.clientHeight;
      const estado = useApp.getState();

      const objetivo = ancho > 1000 && m.seleccion ? -PANEL_NOTA / 2 : 0;
      m.desplazamiento += (objetivo - m.desplazamiento) * k;
      camara.setViewOffset(ancho, alto, -m.desplazamiento, 0, ancho, alto);
      const escalaVista = alto / 2 / Math.tan((camara.fov * Math.PI) / 360);
      escalaPx.value = escalaVista * renderer.getPixelRatio();

      if (++cuadros % 3 === 0) resolverEtiquetas(ancho, alto);
      if (cuadros % 15 === 1) ubicarConstelaciones();

      const ocultos = estado.tiposOcultos;
      for (const [tipo, c] of m.constelaciones) {
        const despierta = ahora > m.despertar ? 1 : 0;
        const o = (ocultos.has(tipo) ? 0 : m.foco ? 0.3 : 1) * despierta;
        const nuevo = c.opacidad + (o - c.opacidad) * k;
        if (Math.abs(nuevo - c.opacidad) > 0.003) c.caja.style.opacity = nuevo.toFixed(3);
        c.opacidad = nuevo;
      }
      for (const t of m.temas.values()) {
        const despierta = ahora > m.despertar + 1200 ? 1 : 0;
        // solo en reposo: con una nota elegida o bajo el mouse el grafo ya cuenta otra cosa
        const o = (ocultos.has(t.tipo) || m.foco ? 0 : 1) * despierta;
        const nuevo = t.opacidad + (o - t.opacidad) * k;
        if (Math.abs(nuevo - t.opacidad) > 0.003) t.caja.style.opacity = nuevo.toFixed(3);
        t.opacidad = nuevo;
      }

      for (const [id, v] of m.visuales) {
        const n = m.nodos.get(id);
        if (!n) continue;
        // despertar: cada neurona aparece con un pequeño rebote, en orden desde el centro
        const vida = Math.min(1, Math.max(0, (ahora - v.nace) / 750));
        const rebote = vida === 1 ? 1 : 1 + 2.2 * Math.pow(vida - 1, 3) + 1.2 * Math.pow(vida - 1, 2);
        const enFoco = !m.foco || m.foco.has(id);
        const enSegundo = !enFoco && m.foco2?.has(id) === true;
        const objetivoOpacidad = (enFoco ? 1 : enSegundo ? 0.38 : 0.1) * Math.min(1, vida * 1.5);
        const objetivoEscala = (id === m.seleccion ? 1.35 : id === estado.hover ? 1.18 : 1) * rebote;
        v.opacidad += (objetivoOpacidad - v.opacidad) * k;
        v.escala += (objetivoEscala - v.escala) * Math.min(1, k * 1.6);
        v.grupo.scale.setScalar(Math.max(0.001, v.escala));
        const vigor = n.hub ? 0.5 : n.vigor;
        v.orbe.material.uniforms.opacidad.value = vigor * v.opacidad;
        v.halo.material.opacity = n.hub ? 0 : 0.3 * vigor * v.opacidad * v.opacidad;
        if (v.anillo) v.anillo.material.opacity = 0.7 * v.opacidad;
        const sel = id === m.seleccion;
        v.seleccion.material.opacity += ((sel ? 0.9 : 0) - v.seleccion.material.opacity) * k;
        v.seleccion.visible = v.seleccion.material.opacity > 0.01;
        if (v.seleccion.visible) v.seleccion.material.rotation += dt * 0.45;

        const conEtiqueta = !n.hub && m.etiquetas.has(id) && !v.tapada && vida === 1;
        const lejania = camara.position.distanceTo(v.grupo.position) * niebla.density;
        const objetivoEtiqueta = conEtiqueta ? Math.min(1, v.opacidad * 1.2) * Math.exp(-lejania * lejania * 0.9) : 0;
        const antes = v.opacidadEtiqueta;
        v.opacidadEtiqueta += (objetivoEtiqueta - v.opacidadEtiqueta) * k;
        if (Math.abs(v.opacidadEtiqueta - antes) > 0.004 || (objetivoEtiqueta === 0 && antes > 0 && v.opacidadEtiqueta < 0.01)) {
          v.etiqueta.style.opacity = v.opacidadEtiqueta < 0.01 ? '0' : v.opacidadEtiqueta.toFixed(3);
        }
        v.ancla.visible = v.opacidadEtiqueta >= 0.01;
        if (v.opacidadEtiqueta > 0.01) {
          const distancia = camara.position.distanceTo(v.grupo.position);
          const radioPx = (n.radio * v.escala * escalaVista) / Math.max(distancia, 1);
          v.etiqueta.style.setProperty('--desplazar', `${Math.round(radioPx + 8)}px`);
        }

        const u = v.orbe.material.uniforms;
        if (v.disparoInicio >= 0) {
          const t = (ahora - v.disparoInicio) / DURACION_DISPARO;
          if (t >= 1) {
            v.disparoInicio = -1;
            u.disparo.value = 0;
            v.ondas[0].visible = false;
            v.ondas[1].visible = false;
          } else if (t >= 0) {
            const fuerte = v.disparoFuerte;
            u.disparo.value = (fuerte ? 1 : 0.5) * Math.pow(1 - t, 2);
            u.colorDisparo.value.copy(v.colorDisparo);
            v.ondas.forEach((o, i) => {
              const ti = Math.max(0, Math.min(1, (t - i * 0.18) * (fuerte ? 1.5 : 1.9)));
              const e = 1 - Math.pow(1 - ti, 2);
              o.scale.setScalar(n.radio * (2 + (fuerte ? 11 : 5) * e));
              o.material.color.copy(v.colorDisparo);
              o.material.opacity = ti > 0 && ti < 1 ? (fuerte ? 0.8 : 0.35) * (1 - ti) : 0;
              o.visible = o.material.opacity > 0.005;
            });
          }
        }
      }

      const despierto = ahora - m.despertar;
      const f = m.filamentos;
      if (f) {
        const col = f.colores.array as Float32Array;
        let coloresSucios = false;
        const tmp = new Color();
        for (const l of m.enlaces) {
          const a = idDe(l.source);
          const b = idDe(l.target);
          const na = m.nodos.get(a);
          const nb = m.nodos.get(b);
          const interno = na?.tipo === nb?.tipo;
          let objetivo = (l.clase === 'hub' ? 0.22 : interno ? 0.6 : 0.16) * Math.min(1, Math.max(0, (despierto + 400) / 1400));
          if (m.foco) {
            const ambos = m.foco.has(a) && m.foco.has(b);
            const tocaSeleccion = !m.seleccion || a === m.seleccion || b === m.seleccion;
            // segundo salto: del vecino hacia afuera, tenue
            const haciaAfuera =
              m.foco2 !== undefined &&
              ((m.foco.has(a) && m.foco2.has(b)) || (m.foco.has(b) && m.foco2.has(a)));
            objetivo = ambos && tocaSeleccion ? 1 : haciaAfuera ? 0.3 : 0.05;
          }
          if ((na && ocultos.has(na.tipo)) || (nb && ocultos.has(nb.tipo))) objetivo = 0;
          l.alfa += (objetivo - l.alfa) * k;
          if (Math.abs(l.alfa - l.pintado) < 0.004) continue;
          l.pintado = l.alfa;
          coloresSucios = true;
          // sin transparencia real: el desvanecido mezcla hacia el papel del fondo
          let o = l.indice * SEGMENTOS * 6;
          for (let i = 0; i < SEGMENTOS; i++) {
            for (const t of [i / SEGMENTOS, (i + 1) / SEGMENTOS]) {
              tmp.copy(l.ca).lerp(l.cb, t).lerp(PAPEL, 1 - l.alfa);
              col[o++] = tmp.r;
              col[o++] = tmp.g;
              col[o++] = tmp.b;
            }
          }
        }
        if (coloresSucios) f.colores.needsUpdate = true;
        if (f.posicionesSucias) {
          f.posiciones.needsUpdate = true;
          f.posicionesSucias = false;
        }
      }

      // actividad espontánea: el cerebro piensa solo, despacio
      if (ahora > siguienteEspontaneo && m.enlaces.length && !document.hidden) {
        siguienteEspontaneo = ahora + 1100 + Math.random() * 1500;
        const lista = [...m.nodos.values()].filter((n) => !n.hub && !ocultos.has(n.tipo) && (!m.foco || m.foco.has(n.id)));
        const n = lista[Math.floor(Math.random() * lista.length)];
        if (n) disparar(n.id, n.color, false);
      }
      m.chispas.actualizar(dt);
      cuadro = requestAnimationFrame(animar);
    };
    cuadro = requestAnimationFrame(animar);

    const alCambiar = useApp.subscribe((s, p) => {
      if (s.seleccion !== p.seleccion || s.hover !== p.hover || s.resaltadas !== p.resaltadas) calcularFoco(m);
      if (s.seleccion && s.seleccion !== p.seleccion) volarA(m, s.seleccion);
    });

    const dejarPulsos = pulsos.escuchar((ids, accion) => {
      const color = COLOR_ACCION[accion] ?? '#C81E1E';
      if (accion === 'mapa') {
        // leer el mapa recorre todo el cerebro: una ola desde el centro
        for (const n of m.nodos.values()) {
          if (n.hub || n.x === undefined) continue;
          disparar(n.id, color, false, Math.hypot(n.x, n.y!, n.z!) * 5);
        }
        return;
      }
      for (const id of ids) disparar(id, color, true);
    });

    const alMover = (e: PointerEvent) => {
      const t = tarjeta.current;
      if (!t) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const izquierda = x + 300 > r.width ? x - 284 : x + 18;
      t.style.transform = `translate(${izquierda}px, ${y + 18}px)`;
    };
    el.addEventListener('pointermove', alMover);

    const observador = new ResizeObserver(() => {
      g.width(el.clientWidth).height(el.clientHeight);
      m.material.resolution.set(el.clientWidth, el.clientHeight);
    });
    observador.observe(el);

    return () => {
      cancelAnimationFrame(cuadro);
      alCambiar();
      dejarPulsos();
      observador.disconnect();
      el.removeEventListener('pointermove', alMover);
      accionesGrafo.encuadrar = () => {};
      g._destructor();
      el.replaceChildren();
      motor.current = null;
    };
  }, []);

  // Datos: al cambiar el cerebro o llegar una nota nueva, conservando posiciones
  useEffect(() => {
    const m = motor.current;
    if (!m) return;
    const mismoCerebro = m.nodos.size > 0 && datos.nodos.some((n) => m.nodos.has(n.id));
    const previos = new Map(m.visuales);
    const { nodos, enlaces } = construirModelo(datos, obsoletas, mismoCerebro ? m.nodos : undefined);
    const R = radioPara(nodos.filter((n) => !n.hub).length);
    m.radio = R;
    for (const n of nodos) {
      const [ax, ay, az] = ANCLA[n.tipo];
      if (n.hub) Object.assign(n, { fx: ax * R, fy: ay * R, fz: az * R, x: ax * R, y: ay * R, z: az * R });
      else if (n.x === undefined)
        Object.assign(n, { x: (ax + (Math.random() - 0.5) * 0.4) * R, y: (ay + (Math.random() - 0.5) * 0.4) * R, z: (az + (Math.random() - 0.5) * 0.4) * R });
    }

    const escena = m.g.scene();
    for (const { objeto } of m.constelaciones.values()) {
      escena.remove(objeto);
      objeto.element.remove();
    }
    m.constelaciones.clear();
    const conteo = new Map<Tipo, number>();
    for (const n of nodos) if (!n.hub) conteo.set(n.tipo, (conteo.get(n.tipo) ?? 0) + 1);
    for (const tipo of conteo.keys()) {
      const ancla = document.createElement('div');
      ancla.className = 'ancla-etiqueta';
      const caja = document.createElement('div');
      caja.className = 'etiqueta-constelacion';
      caja.style.setProperty('--tono', nodos.find((n) => n.tipo === tipo)?.color ?? '#64748B');
      const punto = document.createElement('span');
      punto.className = 'punto';
      const nombre = document.createElement('span');
      nombre.textContent = ETIQUETA_TIPO[tipo];
      // la cantidad por tipo ya la dan los filtros de abajo: aquí solo el nombre
      caja.append(punto, nombre);
      caja.style.opacity = '0';
      ancla.appendChild(caja);
      const objeto = new CSS2DObject(ancla);
      const [ax, ay, az] = ANCLA[tipo];
      objeto.position.set(ax * R, ay * R + R * 0.3, az * R);
      escena.add(objeto);
      m.constelaciones.set(tipo, { objeto, caja, opacidad: 0 });
    }

    // rótulos de los temas de las constelaciones grandes
    for (const { objeto } of m.temas.values()) {
      escena.remove(objeto);
      objeto.element.remove();
    }
    m.temas.clear();
    for (const n of nodos) {
      if (!n.tema || m.temas.has(`${n.tipo}:${n.tema}`)) continue;
      const ancla = document.createElement('div');
      ancla.className = 'ancla-etiqueta';
      const caja = document.createElement('div');
      caja.className = 'etiqueta-tema';
      caja.style.setProperty('--tono', n.color);
      caja.textContent = n.tema;
      caja.style.opacity = '0';
      ancla.appendChild(caja);
      const objeto = new CSS2DObject(ancla);
      escena.add(objeto);
      m.temas.set(`${n.tipo}:${n.tema}`, { objeto, caja, opacidad: 0, tipo: n.tipo, tema: n.tema });
    }

    m.nodos = new Map(nodos.map((n) => [n.id, n]));
    const atenuar = (color: string, clase: string) => new Color(color).lerp(NEUTRO, clase === 'hub' ? 0.7 : 0.25);
    const enlacesG = enlaces as EnlaceG[];
    enlacesG.forEach((l, i) => {
      l.indice = i;
      l.alfa = 0;
      l.pintado = -1;
      l.ca = atenuar(m.nodos.get(idDe(l.source))?.color ?? '#A7B1C0', l.clase);
      l.cb = atenuar(m.nodos.get(idDe(l.target))?.color ?? '#A7B1C0', l.clase);
    });
    if (m.filamentos) {
      escena.remove(m.filamentos.malla);
      m.filamentos.malla.geometry.dispose();
    }
    const geo = new LineSegmentsGeometry();
    const vacio = new Float32Array(Math.max(1, enlaces.length * SEGMENTOS) * 6);
    geo.setPositions(vacio);
    geo.setColors(vacio.slice().fill(PAPEL.r));
    const malla = new LineSegments2(geo, m.material);
    malla.frustumCulled = false;
    malla.renderOrder = -1;
    escena.add(malla);
    m.filamentos = {
      malla,
      posiciones: (geo.getAttribute('instanceStart') as unknown as { data: InterleavedBuffer }).data,
      colores: (geo.getAttribute('instanceColorStart') as unknown as { data: InterleavedBuffer }).data,
      posicionesSucias: true,
    };
    m.enlaces = enlacesG;
    m.visuales.clear();
    m.vecinos = new Map();
    m.incidentes = new Map();
    for (const l of enlacesG) {
      const a = idDe(l.source);
      const b = idDe(l.target);
      if (!m.vecinos.has(a)) m.vecinos.set(a, new Set());
      if (!m.vecinos.has(b)) m.vecinos.set(b, new Set());
      m.vecinos.get(a)!.add(b);
      m.vecinos.get(b)!.add(a);
      if (l.clase === 'enlace') {
        m.incidentes.set(a, [...(m.incidentes.get(a) ?? []), l]);
        m.incidentes.set(b, [...(m.incidentes.get(b) ?? []), l]);
      }
    }
    m.g.graphData({ nodes: nodos, links: enlacesG });
    // CSS2DRenderer no borra el HTML de objetos que salen de la escena con su padre: sin esto quedan etiquetas fantasma
    for (const v of previos.values()) v.etiqueta.parentElement?.remove();

    const ahora = performance.now();
    for (const n of nodos) {
      const v = m.visuales.get(n.id);
      if (!v) continue;
      const previo = previos.get(n.id);
      if (mismoCerebro && previo) {
        // la misma neurona: sin volver a nacer
        v.nace = ahora - 1000;
        v.escala = previo.escala;
        v.opacidad = previo.opacidad;
      } else {
        const d = n.x === undefined ? 0 : Math.hypot(n.x, n.y ?? 0, n.z ?? 0);
        v.nace = ahora + (mismoCerebro ? 0 : 500 + d * 7 + Math.random() * 180);
      }
    }
    calcularFoco(m);
    if (!mismoCerebro) {
      m.despertar = ahora + finDelDespertar(nodos);
      m.g.cameraPosition({ x: 0, y: 0, z: R * 9 });
      const t = setTimeout(() => {
        if (!useApp.getState().seleccion) encuadrar(m, 2200);
      }, 120);
      return () => clearTimeout(t);
    }
  }, [datos, obsoletas]);

  useEffect(() => {
    const m = motor.current;
    if (!m) return;
    m.g.nodeVisibility((n) => !tiposOcultos.has(n.tipo)).linkVisibility((l) => {
      const a = m.nodos.get(idDe(l.source));
      const b = m.nodos.get(idDe(l.target));
      return !!a && !!b && !tiposOcultos.has(a.tipo) && !tiposOcultos.has(b.tipo);
    });
    for (const [id, v] of m.visuales) {
      const n = m.nodos.get(id);
      if (n && tiposOcultos.has(n.tipo)) {
        v.etiqueta.style.opacity = '0';
        v.ancla.visible = false;
      }
    }
  }, [tiposOcultos]);

  useEffect(() => {
    const m = motor.current;
    if (m) (m.g.controls() as OrbitControls).autoRotate = rotacion;
  }, [rotacion]);

  const nodoHover = hover ? motor.current?.nodos.get(hover) : undefined;

  return (
    <div className="absolute inset-0 isolate z-0">
      <div ref={contenedor} className="absolute inset-0" />
      <div
        ref={tarjeta}
        className={`pointer-events-none absolute left-0 top-0 z-20 w-[266px] transition-opacity duration-200 ${nodoHover ? 'opacity-100' : 'opacity-0'}`}
      >
        {nodoHover && (
          <div className="vidrio rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: nodoHover.color }}>
              <span className="size-2 rounded-full" style={{ background: nodoHover.color, boxShadow: `0 0 0 3px ${nodoHover.color}26` }} />
              {SINGULAR_TIPO[nodoHover.tipo]}
              {nodoHover.reciente && <span className="ml-auto rounded-full bg-[#FBEAEA] px-1.5 text-[10px] text-primario">Reciente</span>}
            </div>
            <div className="mt-1.5 text-[13.5px] font-semibold leading-snug text-navy">{nodoHover.titulo}</div>
            <div className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-secundario">{nodoHover.descripcion}</div>
            <div className="mt-2.5 flex gap-3 font-mono text-[10.5px] text-secundario">
              <span>{nodoHover.grado} conexiones</span>
              <span>{nodoHover.lecturas} lecturas</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
