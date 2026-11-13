// Crea scripts/cerebro.ico con la marca de Orbis para el acceso directo del escritorio, y sus copias en PNG.
//   npm run icono
// Dibuja a mano las mismas figuras de app/public/marca.svg (losa redondeada, anillo de órbita y neurona encendida)
// con 4x4 muestras por pixel, sin dependencias. Si cambia marca.svg, se cambian aquí las medidas.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

type Rgb = [number, number, number];
const AGUA: Rgb[] = [[0x0c, 0x3d, 0x66], [0x06, 0x22, 0x3f], [0x02, 0x0c, 0x1b]];
const MENTA: Rgb = [0x7c, 0xff, 0xe1];
const CIAN: Rgb = [0x19, 0xc3, 0xff];
const BLANCO: Rgb = [0xff, 0xff, 0xff];
const BORDE: Rgb = [0x8c, 0xe6, 0xff];

const limitar = (x: number) => Math.max(0, Math.min(1, x));
const mezcla = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// La marca, en un cuadro de 0 a 32: el anillo es lo que queda entre un círculo y otro menor y descentrado
// (así es grueso abajo a la izquierda y fino arriba a la derecha), y la neurona va sobre la parte fina.
const RADIO = 12.8;
const DESVIO = 1.5 / Math.SQRT2;

/** color de la marca en un punto, o null si cae fuera de la losa. En tamaños pequeños el trazo va más grueso. */
function colorEn(x: number, y: number, gruesa: boolean): Rgb | null {
  // la losa: un cuadrado de esquinas redondas
  const qx = Math.abs(x - 16) - 8.5, qy = Math.abs(y - 16) - 8.5;
  const borde = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 7.5;
  if (borde > 0) return null;
  // el agua: de azul hondo arriba a la izquierda a casi negro abajo a la derecha, con una luz en la esquina
  const t = limitar((x + y) / 64);
  let c = t < 0.5 ? mezcla(AGUA[0], AGUA[1], t / 0.5) : mezcla(AGUA[1], AGUA[2], (t - 0.5) / 0.5);
  c = mezcla(c, CIAN, 0.26 * limitar(1 - Math.hypot(x - 8, y - 6) / 24) ** 2);
  if (borde > -0.45 && !gruesa) c = mezcla(c, BORDE, 0.2);
  // de la losa a las medidas de la marca
  const escala = gruesa ? 0.9 : 0.84, hueco = gruesa ? 8.8 : 9.3, chispa = gruesa ? 3.5 : 3.1;
  const sx = 16 + (x - 16) / escala, sy = 16 + (y - 16) / escala;
  const fuera = Math.hypot(sx - 16, sy - 16) - RADIO, dentro = hueco - Math.hypot(sx - 16 - DESVIO, sy - 16 + DESVIO);
  const tinte = mezcla(MENTA, CIAN, limitar((sx + sy - 10) / 44));
  // el resplandor del anillo en el agua, y el anillo
  const lejos = Math.max(fuera, dentro);
  if (lejos > 0) c = mezcla(c, tinte, 0.3 * Math.exp(-lejos / 1.5));
  else c = tinte;
  // la neurona: su halo y su núcleo blanco
  const orbita = (RADIO + 1.5 + hueco) / 2 / Math.SQRT2;
  const d = Math.hypot(sx - 16 - orbita, sy - 16 + orbita);
  c = mezcla(c, MENTA, 0.85 * limitar(1 - d / (chispa * 2.3)) ** 2);
  if (d <= chispa) c = mezcla(BLANCO, MENTA, limitar((d / chispa - 0.55) / 0.45) * 0.85);
  return c;
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
          const c = colorEn(((px + (sx + 0.5) / M) / lado) * 32, ((py + (sy + 0.5) / M) / lado) * 32, lado <= 32);
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

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = join(aqui, 'cerebro.ico');
writeFileSync(destino, ico([16, 24, 32, 48, 64, 256]));
console.log(`icono: ${destino}`);
// el mismo dibujo en PNG: para revisarlo a ojo, para el README y para cuando el navegador pide un icono grande
for (const [ruta, lado] of [[join(aqui, 'orbis-logo.png'), 256], [join(aqui, '..', 'docs', 'orbis-logo.png'), 512], [join(aqui, '..', 'app', 'public', 'marca-180.png'), 180]] as [string, number][]) {
  writeFileSync(ruta, png(lado));
  console.log(`png de ${lado}: ${ruta}`);
}
