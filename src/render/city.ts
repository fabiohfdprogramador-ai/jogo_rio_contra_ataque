// Construção visual da cidade: chão (textura gerada), edifícios do cenário
// (uma única malha mesclada), árvores e coqueiros (instanciados), pontes.
import * as THREE from 'three';
import { BLOCK_SIZE, ROAD_WIDTH } from '../config/game';
import { Tile } from '../game/types';
import type { MapData } from '../game/types';
import { applyFog } from './fogMaterial';

const PX = 16; // pixels por tile na textura do chão

/** Desenha o mapa em um canvas (também reutilizado pelo minimapa). */
export function drawGroundCanvas(map: MapData): HTMLCanvasElement {
  const { width, height, tiles } = map;
  const canvas = document.createElement('canvas');
  canvas.width = width * PX;
  canvas.height = height * PX;
  const ctx = canvas.getContext('2d')!;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? Tile.Lot : tiles[y * width + x]);
  const elevado = new Set(map.sectors.filter((s) => s.type === 'elevado').map((s) => s.id));
  const sectorOf = (x: number, y: number) => Math.floor(y / map.sectorSize) * map.sectorsX + Math.floor(x / map.sectorSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x];
      const px = x * PX;
      const py = y * PX;
      switch (t) {
        case Tile.Road:
          ctx.fillStyle = '#3d4148';
          break;
        case Tile.Bridge:
          ctx.fillStyle = '#5d6168';
          break;
        case Tile.Water: {
          const deep = y > height - 3 ? 1 : 0;
          ctx.fillStyle = deep ? '#1f5f8a' : '#2a6c8c';
          break;
        }
        case Tile.Sand:
          ctx.fillStyle = '#e6d6a3';
          break;
        case Tile.Park:
          ctx.fillStyle = (x + y) % 2 ? '#5b9a49' : '#5f9f4d';
          break;
        default: {
          // Lote: calçada junto às ruas, terreno no interior
          const nearRoad = at(x - 1, y) === Tile.Road || at(x + 1, y) === Tile.Road || at(x, y - 1) === Tile.Road || at(x, y + 1) === Tile.Road;
          if (nearRoad) ctx.fillStyle = '#b8b2a5';
          else if (elevado.has(sectorOf(x, y))) ctx.fillStyle = (x * 7 + y * 3) % 5 ? '#8f9a62' : '#86915a';
          else ctx.fillStyle = (x * 7 + y * 3) % 5 ? '#a9a48f' : '#a29d88';
        }
      }
      ctx.fillRect(px, py, PX, PX);
    }
  }
  // Faixas e calçadão
  ctx.strokeStyle = 'rgba(240,220,120,0.75)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  for (let k = 0; k * BLOCK_SIZE < height; k++) {
    const y = (k * BLOCK_SIZE + ROAD_WIDTH / 2) * PX;
    ctx.beginPath();
    let drawing = false;
    for (let x = 0; x < width; x++) {
      const road = at(x, k * BLOCK_SIZE) === Tile.Road || at(x, k * BLOCK_SIZE) === Tile.Bridge;
      if (road && !drawing) {
        ctx.moveTo(x * PX, y);
        drawing = true;
      } else if (!road && drawing) {
        ctx.lineTo(x * PX, y);
        drawing = false;
      }
    }
    if (drawing) ctx.lineTo(width * PX, y);
    ctx.stroke();
  }
  for (let k = 0; k * BLOCK_SIZE < width; k++) {
    const x = (k * BLOCK_SIZE + ROAD_WIDTH / 2) * PX;
    ctx.beginPath();
    let drawing = false;
    for (let y = 0; y < height; y++) {
      const road = at(k * BLOCK_SIZE, y) === Tile.Road || at(k * BLOCK_SIZE, y) === Tile.Bridge;
      if (road && !drawing) {
        ctx.moveTo(x, y * PX);
        drawing = true;
      } else if (!road && drawing) {
        ctx.lineTo(x, y * PX);
        drawing = false;
      }
    }
    if (drawing) ctx.lineTo(x, height * PX);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Calçadão em ondas (referência visual à orla carioca)
  const sandTop = (height - 5) * PX;
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(0, sandTop, width * PX, PX * 0.8);
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= width * PX; x += 2) {
    const yy = sandTop + PX * 0.4 + Math.sin(x / 6) * 3;
    if (x === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  // Espuma da arrebentação
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (let x = 0; x < width * PX; x += 3) ctx.fillRect(x, (height - 3) * PX + Math.sin(x / 9) * 2, 2, 2);
  return canvas;
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#6f8396';
  ctx.fillRect(14, 16, 36, 30);
  ctx.fillStyle = '#9fb3c4';
  ctx.fillRect(14, 16, 36, 8);
  ctx.fillStyle = '#d9d9d9';
  ctx.fillRect(10, 46, 44, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Gera uma malha única com todos os edifícios do cenário (UVs em unidades de mundo). */
function buildDecorMesh(map: MapData): THREE.Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const groups: { start: number; count: number; mat: number }[] = [];
  const quadsByMat: number[][][] = [[], [], []]; // 0 janelas, 1 liso, 2 telhado
  const c = new THREE.Color();

  const pushQuad = (matIdx: number, verts: number[][], n: number[], uvs: number[][], color: THREE.Color) => {
    quadsByMat[matIdx].push([...verts.flat(), ...n, ...uvs.flat(), color.r, color.g, color.b]);
  };

  for (const d of map.decor) {
    const x0 = d.x + 0.05;
    const x1 = d.x + d.w - 0.05;
    const z0 = d.y + 0.05;
    const z1 = d.y + d.h - 0.05;
    const h = d.height;
    c.setHex(d.color);
    const windows = d.style !== 'galpao';
    const wallMat = windows ? 0 : 1;
    const floorH = d.style === 'torre' ? 0.75 : 0.9;
    const vMax = h / floorH;
    const walls: [number[], number[], number[], number[], number[], number][] = [
      // [a, b, c, d (sentido anti-horário visto de fora), normal, comprimento]
      [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], x1 - x0],
      [[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], x1 - x0],
      [[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], z1 - z0],
      [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], z1 - z0],
    ];
    for (const [a, b, cc, dd, n, len] of walls as unknown as [number[], number[], number[], number[], number[], number][]) {
      const u = Math.max(1, Math.round(len));
      pushQuad(wallMat, [a, b, cc, dd], n, [[0, 0], [u, 0], [u, vMax], [0, vMax]], c);
    }
    const roof = new THREE.Color(d.style === 'casa' || d.style === 'morro' ? (d.style === 'casa' ? 0xa9573c : 0x9d6b55) : 0x7d8287);
    pushQuad(2, [[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0]], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], roof);
  }

  let vertCount = 0;
  quadsByMat.forEach((quads, matIdx) => {
    const start = vertCount;
    for (const q of quads) {
      const v = [q.slice(0, 3), q.slice(3, 6), q.slice(6, 9), q.slice(9, 12)];
      const n = q.slice(12, 15);
      const t = [q.slice(15, 17), q.slice(17, 19), q.slice(19, 21), q.slice(21, 23)];
      const color = q.slice(23, 26);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...v[i]);
        nor.push(...n);
        uv.push(...t[i]);
        col.push(...color);
        vertCount++;
      }
    }
    groups.push({ start, count: vertCount - start, mat: matIdx });
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
  g.computeBoundingSphere();
  const tex = windowTexture();
  const mats = [
    applyFog(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.85 })),
    applyFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
    applyFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })),
  ];
  const mesh = new THREE.Mesh(g, mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildTrees(map: MapData): THREE.Group {
  const group = new THREE.Group();
  const spots: { x: number; y: number; palm: boolean }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (map.trees[y * map.width + x]) spots.push({ x: x + 0.5, y: y + 0.5, palm: false });
  // Coqueiros ao longo da orla
  const sandY = map.height - 4.3;
  for (let x = 2; x < map.width; x += 4) spots.push({ x: x + 0.5, y: sandY, palm: true });

  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const palmGeo = new THREE.ConeGeometry(0.75, 0.35, 7);
  const trunkMat = applyFog(new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }));
  const crownMat = applyFog(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }));
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const trees = spots.filter((s) => !s.palm);
  const palms = spots.filter((s) => s.palm);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, Math.max(1, trees.length));
  const palmCrowns = new THREE.InstancedMesh(palmGeo, crownMat, Math.max(1, palms.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const color = new THREE.Color();
  spots.forEach((s, i) => {
    const h = s.palm ? 2.2 : 0.7 + ((i * 37) % 10) / 20;
    sc.set(1, h, 1);
    m.compose(new THREE.Vector3(s.x, 0, s.y), q, sc);
    trunks.setMatrixAt(i, m);
  });
  trees.forEach((s, i) => {
    const k = 0.8 + ((i * 53) % 10) / 20;
    const h = 0.7 + ((i * 37) % 10) / 20;
    sc.set(k, k * 0.9, k);
    q.setFromEuler(new THREE.Euler(0, i, 0));
    m.compose(new THREE.Vector3(s.x, h + 0.35, s.y), q, sc);
    crowns.setMatrixAt(i, m);
    color.setHex([0x3f7f3a, 0x4e8f3f, 0x36703a, 0x5a9a45][i % 4]);
    crowns.setColorAt(i, color);
  });
  palms.forEach((s, i) => {
    q.setFromEuler(new THREE.Euler(0, i * 0.7, 0));
    sc.set(1, 1, 1);
    m.compose(new THREE.Vector3(s.x, 2.25, s.y), q, sc);
    palmCrowns.setMatrixAt(i, m);
    color.setHex(0x4f9a3c);
    palmCrowns.setColorAt(i, color);
  });
  for (const im of [trunks, crowns, palmCrowns]) {
    im.castShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }
  return group;
}

function buildBridgeRails(map: MapData): THREE.Group {
  const g = new THREE.Group();
  const railMat = applyFog(new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.6 }));
  const { width, tiles } = map;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y * width + x] !== Tile.Bridge) continue;
      const left = x > 0 && tiles[y * width + x - 1] === Tile.Water;
      const right = x < width - 1 && tiles[y * width + x + 1] === Tile.Water;
      for (const [cond, ox] of [
        [left, 0.05],
        [right, 0.95],
      ] as [boolean, number][]) {
        if (!cond) continue;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 1), railMat);
        rail.position.set(x + ox, 0.125, y + 0.5);
        rail.castShadow = true;
        g.add(rail);
      }
    }
  }
  return g;
}

export interface CityView {
  group: THREE.Group;
  groundCanvas: HTMLCanvasElement;
}

export function buildCity(map: MapData, maxAnisotropy: number): CityView {
  const group = new THREE.Group();
  const groundCanvas = drawGroundCanvas(map);
  const tex = new THREE.CanvasTexture(groundCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const groundGeo = new THREE.PlaneGeometry(map.width, map.height);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(map.width / 2, 0, map.height / 2);
  const ground = new THREE.Mesh(groundGeo, applyFog(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })));
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // Borda escura fora do mapa
  const outerGeo = new THREE.PlaneGeometry(map.width * 4, map.height * 4);
  outerGeo.rotateX(-Math.PI / 2);
  outerGeo.translate(map.width / 2, -0.05, map.height / 2);
  group.add(new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({ color: 0x0b1118 })));

  group.add(buildDecorMesh(map));
  group.add(buildTrees(map));
  group.add(buildBridgeRails(map));
  return { group, groundCanvas };
}
