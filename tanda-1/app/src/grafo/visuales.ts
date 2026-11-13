import { CanvasTexture, Color, Group, Mesh, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Nodo } from './modelo.ts';

function textura(dibujar: (ctx: CanvasRenderingContext2D, t: number) => void, t = 256): CanvasTexture {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = t;
  dibujar(lienzo.getContext('2d')!, t);
  const tex = new CanvasTexture(lienzo);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Blancas: el color lo pone el material, así una textura sirve para todos los tipos
const HALO = textura((ctx, t) => {
  const g = ctx.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, t, t);
});

const ANILLO = textura((ctx, t) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = t * 0.022;
  ctx.beginPath();
  ctx.arc(t / 2, t / 2, t / 2 - ctx.lineWidth, 0, Math.PI * 2);
  ctx.stroke();
});

const ANILLO_SELECCION = textura((ctx, t) => {
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = t * 0.026;
  const r = t / 2 - ctx.lineWidth;
  // arcos separados: al girar despacio se lee como "en foco"
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(t / 2, t / 2, r, (i * Math.PI * 2) / 3 + 0.18, ((i + 1) * Math.PI * 2) / 3 - 0.18);
    ctx.stroke();
  }
});

// pocas caras: a su tamaño en pantalla el shader (fresnel) ya la hace ver redonda; 48x32 costaba 215 mil triángulos
const ESFERA = new SphereGeometry(1, 22, 14);

// Célula luminosa: núcleo claro, borde saturado (fresnel), brillo especular y disparo
const VERTICE = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vVista;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vVista = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENTO = /* glsl */ `
  uniform vec3 color;
  uniform vec3 colorDisparo;
  uniform float disparo;
  uniform float opacidad;
  uniform float densidad;
  uniform vec3 colorNiebla;
  varying vec3 vNormal;
  varying vec3 vVista;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vVista);
    float frente = max(dot(n, v), 0.0);
    float borde = pow(1.0 - frente, 1.7);
    vec3 nucleo = mix(color, vec3(1.0), 0.62);
    vec3 col = mix(nucleo, color, 0.35 + 0.65 * borde);
    float brillo = pow(max(dot(n, normalize(vec3(-0.35, 0.6, 0.72))), 0.0), 24.0);
    col += vec3(1.0) * brillo * 0.55;
    col = mix(col, mix(colorDisparo, vec3(1.0), 0.25), disparo * 0.85);
    float d = length(vVista);
    float niebla = 1.0 - exp(-densidad * densidad * d * d);
    col = mix(col, colorNiebla, niebla * 0.9);
    gl_FragColor = vec4(col, opacidad * (0.88 + 0.12 * borde));
  }
`;

export interface Visual {
  grupo: Group;
  orbe: Mesh<SphereGeometry, ShaderMaterial>;
  halo: Sprite;
  anillo?: Sprite;
  seleccion: Sprite;
  ondas: [Sprite, Sprite];
  etiqueta: HTMLDivElement;
  // el objeto CSS2D: invisible = el renderizador no lo recalcula en cada cuadro
  ancla: CSS2DObject;
  anchoEtiqueta: number;
  tapada: boolean;
  // valores animados
  opacidad: number;
  escala: number;
  opacidadEtiqueta: number;
  nace: number;
  disparoInicio: number;
  disparoFuerte: boolean;
  colorDisparo: Color;
}

function sprite(mapa: CanvasTexture, color: string | Color, opacidad: number): Sprite {
  return new Sprite(new SpriteMaterial({ map: mapa, color, transparent: true, opacity: opacidad, depthWrite: false }));
}

export function crearVisual(n: Nodo, densidad: { value: number }): Visual {
  const grupo = new Group();
  const r = n.radio;
  const color = new Color(n.color);

  const orbe = new Mesh(
    ESFERA,
    new ShaderMaterial({
      vertexShader: VERTICE,
      fragmentShader: FRAGMENTO,
      uniforms: {
        color: { value: color },
        colorDisparo: { value: new Color('#C81E1E') },
        disparo: { value: 0 },
        opacidad: { value: 1 },
        densidad,
        colorNiebla: { value: new Color('#FAFBFC') },
      },
      transparent: true,
    }),
  );
  orbe.scale.setScalar(n.hub ? 1.2 : r);
  grupo.add(orbe);

  // luz que sangra alrededor de la célula
  const halo = sprite(HALO, color, n.hub ? 0 : 0.3);
  halo.scale.setScalar(r * 5.2);
  grupo.add(halo);

  let anillo: Sprite | undefined;
  if (!n.hub && n.reciente) {
    anillo = sprite(ANILLO, '#C81E1E', 0.7);
    anillo.scale.setScalar(r * 2.7);
    grupo.add(anillo);
  }

  const seleccion = sprite(ANILLO_SELECCION, color, 0);
  seleccion.scale.setScalar(r * 3.4);
  grupo.add(seleccion);

  const ondas: [Sprite, Sprite] = [sprite(ANILLO, color, 0), sprite(ANILLO, color, 0)];
  for (const o of ondas) grupo.add(o);

  const ancla = document.createElement('div');
  ancla.className = 'ancla-etiqueta';
  const etiqueta = document.createElement('div');
  etiqueta.className = 'etiqueta-nodo';
  etiqueta.textContent = n.titulo;
  etiqueta.style.opacity = '0';
  ancla.appendChild(etiqueta);
  const objetoEtiqueta = new CSS2DObject(ancla);
  objetoEtiqueta.visible = false;
  grupo.add(objetoEtiqueta);
  seleccion.visible = false;
  for (const o of ondas) o.visible = false;

  return {
    grupo,
    orbe,
    halo,
    anillo,
    seleccion,
    ondas,
    etiqueta,
    ancla: objetoEtiqueta,
    anchoEtiqueta: 0,
    tapada: false,
    opacidad: 1,
    escala: 0,
    opacidadEtiqueta: 0,
    nace: 0,
    disparoInicio: -1,
    disparoFuerte: false,
    colorDisparo: new Color('#C81E1E'),
  };
}
