// Crea scripts/cerebro.ico con la marca de la app (app/public/marca.svg) para el acceso directo del escritorio.
//   npm run icono
// Dibuja a mano las mismas figuras del SVG (cuadro redondeado, tres trazos y tres puntos) con 4x4 muestras
// por pixel, sin dependencias. Si cambia marca.svg, se cambian aqui las figuras (la mitad de abajo de la orbita va
// delante de la esfera y la de arriba detras; el punto blanco va sobre la orbita).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

type Rgb = [number, number, number];
const NAVY: Rgb = [0x0c, 0x19, 0x29];
const ROJO: Rgb = [0xc8, 0x1e, 0x1e];
const PAPEL: Rgb = [0xfa, 0xfb, 0xfc];

// Marca Orbis: esfera roja con su orbita inclinada -28 grados y un punto sobre ella. Coordenadas del viewBox 0..32.
const ORBITA: Rgb = [0xaa, 0xb8, 0xc9];
const BRILLO: Rgb = [0xdc, 0x3b, 0x3f];
const RX = 12;
const RY = 5;
const GIRO = (28 * Math.PI) / 180;
const GROSOR = 0.75;

function dentroDelCuadro(x: number, y: number): boolean {
  const r = 8;
  const cx = Math.min(Math.max(x, r), 32 - r);
  const cy = Math.min(Math.max(y, r), 32 - r);
  return x >= 0 && x <= 32 && y >= 0 && y <= 32 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** distancia aproximada de un punto local (ya sin el giro) a la elipse de la orbita */
function distanciaAOrbita(lx: number, ly: number): number {
  const u = (lx - 16) / RX;
  const v = (ly - 16) / RY;
  const f = Math.hypot(u, v);
  if (f === 0) return RY;
  const gradiente = Math.hypot(u / RX, v / RY) / f;
  return Math.abs(f - 1) / gradiente;
}

/** color del SVG en un punto, o null si cae fuera del cuadro */
function colorEn(x: number, y: number): Rgb | null {
  if (!dentroDelCuadro(x, y)) return null;
  // al punto se le quita el giro de la orbita para trabajar con la elipse derecha
  const dx = x - 16;
  const dy = y - 16;
  const lx = 16 + dx * Math.cos(GIRO) - dy * Math.sin(GIRO);
  const ly = 16 + dx * Math.sin(GIRO) + dy * Math.cos(GIRO);
  if (Math.hypot(lx - 6.8, ly - 12.8) <= 2) return PAPEL;
  // la mitad de abajo de la orbita pasa por delante de la esfera
  if (ly > 16 && distanciaAOrbita(lx, ly) <= GROSOR) return ORBITA;
  if (Math.hypot(lx - 14.3, ly - 14.2) <= 1.7) return BRILLO;
  if (Math.hypot(lx - 16, ly - 16) <= 5.2) return ROJO;
  if (distanciaAOrbita(lx, ly) <= GROSOR) return ORBITA;
  return NAVY;
}

function bloque(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(lado: number): Buffer {
  const M = 4;
  const fila = lado * 4 + 1;
  const crudo = Buffer.alloc(fila * lado);
  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < M; sy++) {
        for (let sx = 0; sx < M; sx++) {
          const c = colorEn(((px + (sx + 0.5) / M) / lado) * 32, ((py + (sy + 0.5) / M) / lado) * 32);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const o = py * fila + 1 + px * 4;
      if (a === 0) continue;
      crudo[o] = Math.round(r / a);
      crudo[o + 1] = Math.round(g / a);
      crudo[o + 2] = Math.round(b / a);
      crudo[o + 3] = Math.round((a / (M * M)) * 255);
    }
  }
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8;
  cabecera[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloque('IHDR', cabecera),
    bloque('IDAT', deflateSync(crudo)),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

function ico(lados: number[]): Buffer {
  const imagenes = lados.map(png);
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(lados.length, 4);
  let desplazamiento = 6 + 16 * lados.length;
  const directorio = lados.map((lado, i) => {
    const e = Buffer.alloc(16);
    e[0] = lado >= 256 ? 0 : lado;
    e[1] = lado >= 256 ? 0 : lado;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(imagenes[i].length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += imagenes[i].length;
    return e;
  });
  return Buffer.concat([cabecera, ...directorio, ...imagenes]);
}

const destino = join(dirname(fileURLToPath(import.meta.url)), 'cerebro.ico');
writeFileSync(destino, ico([16, 24, 32, 48, 64, 256]));
console.log(`icono: ${destino}`);
// el mismo dibujo en PNG, para compartir o revisar a ojo
const vista = join(dirname(destino), 'orbis-logo.png');
writeFileSync(vista, png(256));
console.log(`vista previa: ${vista}`);
