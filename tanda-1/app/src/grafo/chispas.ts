// Chispas: impulsos con estela que recorren los filamentos (curvas cuadráticas de cada enlace)
import { BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial, Vector3 } from 'three';

export interface Curva {
  p0: Vector3;
  p1: Vector3;
  p2: Vector3;
}

export function puntoEn(c: Curva, t: number, destino: Vector3): Vector3 {
  const u = 1 - t;
  return destino
    .copy(c.p0)
    .multiplyScalar(u * u)
    .addScaledVector(c.p1, 2 * u * t)
    .addScaledVector(c.p2, t * t);
}

interface Chispa {
  curva: Curva;
  t: number;
  velocidad: number;
  inverso: boolean;
  color: Color;
  tam: number;
  fuerza: number;
}

const ESTELA = 9;
const MAXIMO = 320;

export class Chispas {
  readonly puntos: Points;
  private readonly activas: Chispa[] = [];
  private readonly posicion: Float32Array;
  private readonly color: Float32Array;
  private readonly tam: Float32Array;
  private readonly alfa: Float32Array;
  private readonly tmp = new Vector3();
  readonly material: ShaderMaterial;

  constructor(escalaPx: { value: number }) {
    const n = MAXIMO * ESTELA;
    this.posicion = new Float32Array(n * 3);
    this.color = new Float32Array(n * 3);
    this.tam = new Float32Array(n);
    this.alfa = new Float32Array(n);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.posicion, 3));
    geo.setAttribute('color', new BufferAttribute(this.color, 3));
    geo.setAttribute('tam', new BufferAttribute(this.tam, 1));
    geo.setAttribute('alfa', new BufferAttribute(this.alfa, 1));
    geo.setDrawRange(0, 0);
    this.material = new ShaderMaterial({
      uniforms: { escalaPx },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float tam;
        attribute float alfa;
        uniform float escalaPx;
        varying vec3 vColor;
        varying float vAlfa;
        void main() {
          vColor = color;
          vAlfa = alfa;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.5, tam * escalaPx / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlfa;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float a = exp(-d * d * 3.2);
          vec3 col = mix(vColor, vec3(1.0), smoothstep(0.45, 0.0, d) * 0.7);
          gl_FragColor = vec4(col, a * vAlfa);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.puntos = new Points(geo, this.material);
    this.puntos.frustumCulled = false;
    this.puntos.renderOrder = 5;
  }

  lanzar(curva: Curva, color: Color | string, opciones: { fuerza?: number; inverso?: boolean; lenta?: boolean } = {}): void {
    if (this.activas.length >= MAXIMO) this.activas.shift();
    const fuerza = opciones.fuerza ?? 1;
    this.activas.push({
      curva,
      t: 0,
      velocidad: (opciones.lenta ? 0.28 : 0.62) * (0.85 + Math.random() * 0.3),
      inverso: opciones.inverso ?? false,
      color: new Color(color),
      tam: 1.5 + fuerza * 1.6,
      fuerza,
    });
  }

  actualizar(dt: number): void {
    let i = 0;
    for (let k = this.activas.length - 1; k >= 0; k--) {
      const c = this.activas[k];
      c.t += c.velocidad * dt;
      if (c.t > 1 + ESTELA * 0.02) this.activas.splice(k, 1);
    }
    for (const c of this.activas) {
      for (let s = 0; s < ESTELA; s++) {
        const ts = c.t - s * 0.022;
        if (ts < 0 || ts > 1) continue;
        puntoEn(c.curva, c.inverso ? 1 - ts : ts, this.tmp);
        const decae = 1 - s / ESTELA;
        this.posicion.set([this.tmp.x, this.tmp.y, this.tmp.z], i * 3);
        this.color.set([c.color.r, c.color.g, c.color.b], i * 3);
        this.tam[i] = c.tam * (0.35 + 0.65 * decae);
        // aparece y se apaga en los extremos del filamento
        const borde = Math.min(1, ts * 8, (1 - ts) * 8);
        this.alfa[i] = Math.pow(decae, 1.6) * borde * (0.55 + 0.45 * Math.min(1, c.fuerza));
        i++;
      }
    }
    const geo = this.puntos.geometry;
    geo.setDrawRange(0, i);
    for (const nombre of ['position', 'color', 'tam', 'alfa']) (geo.getAttribute(nombre) as BufferAttribute).needsUpdate = true;
  }
}
