// Modelos 3D provisórios (geométricos), montados a partir de primitivas.
// Para substituir por assets definitivos (glTF), basta trocar as funções
// createUnitModel/createBuildingModel mantendo a mesma assinatura.
import * as THREE from 'three';
import type { BuildingRole, FactionId, UnitModel } from '../game/types';
import { applyFog } from './fogMaterial';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

export function mat(color: number, opts: { rough?: number; metal?: number; emissive?: number; fog?: boolean } = {}): THREE.Material {
  const key = `${color}|${opts.rough ?? 0.8}|${opts.metal ?? 0}|${opts.emissive ?? 0}|${opts.fog ?? false}`;
  let m = matCache.get(key);
  if (!m) {
    const sm = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? 0,
    });
    m = opts.fog ? applyFog(sm) : sm;
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geo(`box${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)),
    m,
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geo(`cyl${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
    m,
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  return mesh;
}

function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geo(`sph${r}`, () => new THREE.SphereGeometry(r, 10, 8)),
    m,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function wheel(m: THREE.Material, x: number, z: number, r = 0.11): THREE.Mesh {
  const w = new THREE.Mesh(geo(`wheel${r}`, () => new THREE.CylinderGeometry(r, r, 0.08, 10)), m);
  w.rotation.x = Math.PI / 2;
  w.position.set(x, r, z);
  return w;
}

const SKIN = 0xc98e66;
const DARK = 0x23272d;
const GLASS = 0x26384a;
const TIRE = 0x161616;

/** Unidades: frente apontando para +X. */
export function createUnitModel(model: UnitModel, color: number): THREE.Group {
  const g = new THREE.Group();
  const team = mat(color, { rough: 0.6 });
  const dark = mat(DARK);
  const skin = mat(SKIN);
  const glass = mat(GLASS, { rough: 0.2, metal: 0.3 });
  const tire = mat(TIRE);
  switch (model) {
    case 'soldier':
    case 'heavy':
    case 'scout':
    case 'engineer':
    case 'medic': {
      const bodyR = model === 'heavy' ? 0.2 : model === 'scout' ? 0.13 : 0.16;
      g.add(cyl(0.07, 0.07, 0.22, dark, 0, 0, 0.07));
      g.add(cyl(0.07, 0.07, 0.22, dark, 0, 0, -0.07));
      const bodyMat = model === 'medic' ? mat(0xf2f2f2) : team;
      g.add(cyl(bodyR * 0.9, bodyR, 0.32, bodyMat, 0, 0.22, 0));
      g.add(sphere(0.1, skin, 0, 0.64, 0));
      if (model === 'heavy') {
        g.add(sphere(0.115, dark, 0, 0.68, 0));
        g.add(box(0.05, 0.36, 0.3, dark, 0.2, 0.2, 0));
      } else if (model === 'engineer') {
        g.add(sphere(0.11, mat(0xf4c20d), 0, 0.68, 0));
        g.add(box(0.14, 0.1, 0.1, mat(0x8a5a2b), 0.05, 0.12, 0.2));
      } else if (model === 'medic') {
        g.add(box(0.02, 0.1, 0.24, team, bodyR + 0.005, 0.38, 0));
        g.add(box(0.02, 0.24, 0.08, team, bodyR + 0.005, 0.31, 0));
      } else if (model === 'scout') {
        g.add(cyl(0.01, 0.01, 0.35, dark, -0.08, 0.5, 0.05, 4));
        g.add(box(0.06, 0.05, 0.12, dark, 0.06, 0.66, 0));
      } else {
        g.add(sphere(0.105, team, 0, 0.67, 0));
      }
      if (model !== 'medic' && model !== 'engineer') g.add(box(0.32, 0.05, 0.05, dark, 0.14, 0.38, -0.12));
      break;
    }
    case 'moto': {
      g.add(box(0.6, 0.14, 0.12, team, 0, 0.12, 0));
      g.add(wheel(tire, 0.24, 0, 0.12));
      g.add(wheel(tire, -0.24, 0, 0.12));
      g.add(cyl(0.1, 0.11, 0.26, dark, -0.02, 0.26, 0));
      g.add(sphere(0.09, team, -0.02, 0.62, 0));
      break;
    }
    case 'car':
    case 'suv':
    case 'utility':
    case 'pickup': {
      const L = model === 'suv' ? 1.05 : model === 'utility' ? 1.05 : 1.0;
      const W = model === 'car' ? 0.5 : 0.56;
      const H = model === 'car' ? 0.26 : 0.32;
      g.add(box(L, H, W, team, 0, 0.1, 0));
      if (model === 'pickup') {
        g.add(box(L * 0.45, 0.24, W * 0.95, glass, 0.18, 0.1 + H, 0));
        g.add(box(L * 0.4, 0.1, W, dark, -0.28, 0.1 + H, 0));
      } else if (model === 'utility') {
        g.add(box(L * 0.8, 0.3, W * 0.96, mat(0xe9e9e9), -0.05, 0.1 + H, 0));
        g.add(box(0.06, 0.22, W * 0.8, glass, L * 0.38, 0.12 + H, 0));
      } else {
        g.add(box(L * 0.55, model === 'suv' ? 0.26 : 0.2, W * 0.92, glass, -0.04, 0.1 + H, 0));
      }
      if (model === 'car' || model === 'suv') {
        // barra de sinalização (cor da equipe)
        g.add(box(0.08, 0.05, W * 0.6, mat(0xffffff, { emissive: 0x333333 }), -0.04, 0.1 + H + (model === 'suv' ? 0.26 : 0.2), 0));
      }
      for (const [x, z] of [
        [L * 0.32, W / 2],
        [L * 0.32, -W / 2],
        [-L * 0.32, W / 2],
        [-L * 0.32, -W / 2],
      ]) g.add(wheel(tire, x, z, 0.12));
      break;
    }
    case 'armored': {
      g.add(box(1.25, 0.42, 0.72, mat(0x4b5320), 0, 0.12, 0));
      g.add(box(1.25, 0.06, 0.74, team, 0, 0.4, 0));
      g.add(box(0.55, 0.26, 0.5, mat(0x3d4419), -0.1, 0.54, 0));
      const barrel = cyl(0.04, 0.04, 0.5, dark, 0.35, 0.62, 0, 6);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0.4, 0.67, 0);
      g.add(barrel);
      for (const x of [-0.42, -0.14, 0.14, 0.42]) {
        g.add(wheel(tire, x, 0.37, 0.14));
        g.add(wheel(tire, x, -0.37, 0.14));
      }
      break;
    }
  }
  return g;
}

const FACTION_WALL: Record<FactionId, number> = {
  policia: 0xd7dde4,
  milicia: 0xd8ccb2,
  bandido: 0xc98f6e,
};

/** Construções. A origem fica no centro do terreno ocupado (size × size). */
export function createBuildingModel(role: BuildingRole, faction: FactionId, size: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const team = mat(color, { rough: 0.6, fog: true });
  const wall = mat(FACTION_WALL[faction], { fog: true });
  const dark = mat(DARK, { fog: true });
  const concrete = mat(0x9a9a96, { fog: true });
  const glass = mat(GLASS, { rough: 0.25, metal: 0.3, fog: true });
  const s = size;
  // Laje de base
  g.add(box(s - 0.1, 0.08, s - 0.1, concrete, 0, 0, 0));

  switch (role) {
    case 'hq': {
      g.add(box(s * 0.78, 1.9, s * 0.62, wall, 0, 0.08, -s * 0.08));
      g.add(box(s * 0.8, 0.14, s * 0.64, team, 0, 1.98, -s * 0.08));
      g.add(box(s * 0.5, 0.9, s * 0.3, wall, 0, 2.1, -s * 0.12));
      g.add(box(s * 0.79, 0.35, 0.04, glass, 0, 0.9, s * 0.23));
      g.add(box(s * 0.3, 0.6, 0.06, dark, 0, 0.08, s * 0.24));
      g.add(cyl(0.03, 0.03, 1.6, dark, s * 0.38, 0.08, s * 0.38, 5));
      const flag = box(0.5, 0.3, 0.02, team, s * 0.38 + 0.25, 1.35, s * 0.38);
      g.add(flag);
      g.add(cyl(0.35, 0.35, 0.03, mat(0x444444, { fog: true }), 0, 3.0, -s * 0.12, 16));
      break;
    }
    case 'barracks': {
      g.add(box(s * 0.85, 1.4, s * 0.7, wall, 0, 0.08, -s * 0.05));
      g.add(box(s * 0.88, 0.12, s * 0.74, team, 0, 1.48, -s * 0.05));
      g.add(box(s * 0.6, 0.28, 0.04, glass, 0, 0.8, s * 0.3));
      g.add(box(0.5, 0.6, 0.05, dark, 0, 0.08, s * 0.31));
      break;
    }
    case 'garage': {
      g.add(box(s * 0.9, 1.5, s * 0.8, wall, 0, 0.08, -s * 0.03));
      g.add(box(s * 0.92, 0.1, s * 0.82, team, 0, 1.58, -s * 0.03));
      for (const x of [-s * 0.25, s * 0.25]) g.add(box(s * 0.35, 1.0, 0.05, mat(0x5a6068, { fog: true }), x, 0.08, s * 0.38));
      break;
    }
    case 'power': {
      g.add(box(s * 0.7, 0.6, s * 0.4, mat(0x8a8f94, { fog: true }), 0, 0.08, -s * 0.15));
      g.add(cyl(0.18, 0.18, 0.8, mat(0xb8bcc0, { metal: 0.5, fog: true }), -s * 0.2, 0.08, s * 0.2));
      g.add(cyl(0.18, 0.18, 0.8, mat(0xb8bcc0, { metal: 0.5, fog: true }), s * 0.2, 0.08, s * 0.2));
      g.add(cyl(0.04, 0.04, 1.8, dark, s * 0.35, 0.08, -s * 0.35, 5));
      g.add(box(0.5, 0.05, 0.05, dark, s * 0.35, 1.75, -s * 0.35));
      g.add(box(s * 0.72, 0.08, s * 0.42, team, 0, 0.68, -s * 0.15));
      break;
    }
    case 'logistics': {
      g.add(box(s * 0.85, 1.1, s * 0.5, wall, 0, 0.08, -s * 0.2));
      g.add(box(s * 0.87, 0.1, s * 0.52, team, 0, 1.18, -s * 0.2));
      const cont = [0xb3472f, 0x2f6fb3, 0x3f8f4a, 0xd19a2a];
      for (let i = 0; i < 3; i++) g.add(box(0.8, 0.45, 0.4, mat(cont[i % cont.length], { fog: true }), -s * 0.25 + i * 0.3, 0.08 + (i === 2 ? 0.45 : 0), s * 0.28));
      break;
    }
    case 'research': {
      g.add(box(s * 0.75, 1.6, s * 0.75, wall, 0, 0.08, 0));
      g.add(box(s * 0.77, 0.1, s * 0.77, team, 0, 1.68, 0));
      g.add(box(s * 0.76, 0.3, s * 0.76, glass, 0, 1.0, 0));
      g.add(cyl(0.03, 0.03, 1.4, dark, s * 0.2, 1.78, s * 0.2, 5));
      const dish = new THREE.Mesh(geo('dish', () => new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0xe8e8e8, { fog: true }));
      dish.position.set(-s * 0.15, 1.78, -s * 0.1);
      dish.rotation.x = Math.PI;
      dish.rotation.z = 0.5;
      g.add(dish);
      break;
    }
    case 'defense': {
      g.add(box(s * 0.85, 0.7, s * 0.85, concrete, 0, 0.08, 0));
      g.add(cyl(0.45, 0.5, 1.4, wall, 0, 0.78, 0, 8));
      g.add(cyl(0.55, 0.55, 0.15, team, 0, 2.18, 0, 8));
      g.add(box(0.5, 0.08, 0.08, dark, 0.45, 1.8, 0));
      break;
    }
    case 'outpost': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(box(0.35, 0.3, 0.2, mat(0xb9a57a, { fog: true }), Math.cos(a) * s * 0.4, 0.08, Math.sin(a) * s * 0.4));
      }
      g.add(box(s * 0.5, 0.9, s * 0.5, wall, 0, 0.08, 0));
      g.add(box(s * 0.55, 0.08, s * 0.55, team, 0, 0.98, 0));
      g.add(cyl(0.025, 0.025, 1.4, dark, s * 0.3, 0.08, -s * 0.3, 5));
      g.add(box(0.35, 0.22, 0.02, team, s * 0.3 + 0.18, 1.2, -s * 0.3));
      break;
    }
  }
  return g;
}

export function createRuinModel(size: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rub = [mat(0x6d6a65, { fog: true }), mat(0x55524d, { fog: true }), mat(0x3a3836, { fog: true })];
  g.add(box(size - 0.2, 0.06, size - 0.2, rub[2], 0, 0, 0));
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < size * 3; i++) {
    const w = 0.2 + rnd() * 0.6;
    const h = 0.1 + rnd() * 0.5;
    const m = box(w, h, 0.2 + rnd() * 0.5, rub[i % 3], (rnd() - 0.5) * (size - 0.6), 0.04, (rnd() - 0.5) * (size - 0.6));
    m.rotation.y = rnd() * Math.PI;
    g.add(m);
  }
  return g;
}

/** Andaime para obras em andamento. */
export function createScaffold(size: number): THREE.LineSegments {
  const g = geo(`scaf${size}`, () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size - 0.2, 1, size - 0.2, 2, 2, 2)));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf4c20d }));
  return l;
}
