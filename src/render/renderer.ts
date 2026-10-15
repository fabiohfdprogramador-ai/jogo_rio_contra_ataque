// Renderização da partida com Three.js. Lê o estado da simulação (somente
// leitura) e o representa em 2.5D/3D; nunca altera regras do jogo.
import * as THREE from 'three';
import { getBuildingDef } from '../config/buildings';
import { CAPTURE } from '../config/game';
import { getUnitDef } from '../config/units';
import { isVisibleTo } from '../game/units/behavior';
import type { GameEvent, World } from '../game/types';
import { CameraController } from './camera';
import { buildCity, type CityView } from './city';
import { Effects } from './effects';
import { fogUniforms } from './fogMaterial';
import { createBuildingModel, createRuinModel, createScaffold, createUnitModel } from './models';

export interface RenderQuality {
  shadows: boolean;
  pixelRatio: number;
  effects: boolean;
}

const UNIT_SCALE = 1.35;

interface UnitView {
  obj: THREE.Group;
  ring: THREE.Mesh;
}

interface BuildingView {
  obj: THREE.Group;
  model: THREE.Group;
  scaffold: THREE.LineSegments | null;
  ring: THREE.Mesh;
  smokeTimer: number;
}

interface SectorView {
  flag: THREE.Mesh;
  flagMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  ringSegments: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly cam: CameraController;
  readonly effects = new Effects();
  city!: CityView;
  private world!: World;
  private humanId = 0;
  private sun: THREE.DirectionalLight;
  private worldGroup = new THREE.Group();
  private unitViews = new Map<number, UnitView>();
  private buildingViews = new Map<number, BuildingView>();
  private ruinViews = new Map<number, THREE.Group>();
  private sectorViews: SectorView[] = [];
  private territoryData!: Uint8Array;
  private territoryTex!: THREE.DataTexture;
  private fogData!: Uint8Array;
  private fogTex!: THREE.DataTexture;
  private ghost: THREE.Group | null = null;
  private ghostTiles: THREE.InstancedMesh | null = null;
  private rallyMarker: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ringGeoSmall = new THREE.RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2);
  private time = 0;

  constructor(private container: HTMLElement, quality: RenderQuality) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    this.cam = new CameraController(this.camera, 72, 72);

    this.scene.background = new THREE.Color(0x0b1118);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 1.15));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 160;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.worldGroup);
    this.scene.add(this.effects.group);

    this.rallyMarker = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pole.position.y = 0.6;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.28), new THREE.MeshBasicMaterial({ color: 0x5cff8a, side: THREE.DoubleSide }));
    fl.position.set(0.23, 1.05, 0);
    this.rallyMarker.add(pole, fl);
    this.rallyMarker.visible = false;
    this.scene.add(this.rallyMarker);

    this.setQuality(quality);
    this.resize();
  }

  setQuality(q: RenderQuality) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.effects.enabled = q.effects;
    // Força recompilação dos materiais quando as sombras mudam.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) (m as THREE.Material).needsUpdate = true;
    });
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    // Janela minimizada/oculta: mantém o tamanho anterior para não gerar aspecto inválido.
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Prepara a cena para uma nova partida (ou partida carregada). */
  setWorld(world: World, humanId: number) {
    this.world = world;
    this.humanId = humanId;
    this.clearWorld();
    const { map } = world;
    this.cam.setBounds(map.width, map.height);
    this.city = buildCity(map, this.renderer.capabilities.getMaxAnisotropy());
    this.worldGroup.add(this.city.group);

    // Território (sobreposição colorida por tile)
    this.territoryData = new Uint8Array(map.width * map.height * 4);
    this.territoryTex = new THREE.DataTexture(this.territoryData, map.width, map.height, THREE.RGBAFormat);
    this.territoryTex.magFilter = THREE.NearestFilter;
    this.territoryTex.minFilter = THREE.LinearFilter;
    this.territoryTex.colorSpace = THREE.SRGBColorSpace;
    const terrGeo = new THREE.PlaneGeometry(map.width, map.height);
    terrGeo.rotateX(-Math.PI / 2);
    terrGeo.translate(map.width / 2, 0.03, map.height / 2);
    // A textura é amostrada com v invertido para alinhar a linha 0 ao topo (z = 0).
    const uv = terrGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const terr = new THREE.Mesh(
      terrGeo,
      new THREE.MeshBasicMaterial({ map: this.territoryTex, transparent: true, depthWrite: false }),
    );
    terr.renderOrder = 1;
    this.worldGroup.add(terr);

    // Névoa de guerra
    this.fogData = new Uint8Array(map.width * map.height * 4);
    this.fogTex = new THREE.DataTexture(this.fogData, map.width, map.height, THREE.RGBAFormat);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.flipY = false;
    fogUniforms.uFogTex.value = this.fogTex;
    fogUniforms.uMapSize.value.set(map.width, map.height);
    fogUniforms.uFogEnabled.value = world.config.fogOfWar ? 1 : 0;

    // Pontos de controle
    this.sectorViews = map.sectors.map((s) => {
      const g = new THREE.Group();
      g.position.set(s.cx, 0, s.cy);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xd8d4c8 }));
      pad.position.y = 0.04;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0xe6e6e6, metalness: 0.4 }));
      pole.position.y = 1.3;
      const flagMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7 });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 6, 1), flagMat);
      flag.position.set(0.47, 2.25, 0);
      const outline = new THREE.Mesh(
        new THREE.RingGeometry(CAPTURE.radius - 0.08, CAPTURE.radius, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      outline.position.y = 0.05;
      const segs = 64;
      const ringGeo = new THREE.RingGeometry(CAPTURE.radius - 0.35, CAPTURE.radius - 0.1, segs, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.06;
      ring.renderOrder = 2;
      g.add(pad, pole, flag, outline, ring);
      this.worldGroup.add(g);
      return { flag, flagMat, ring, ringMat, ringSegments: segs };
    });

    this.updateTerritory();
    this.updateFog();
    // Câmera atrás da base do jogador, olhando para o centro da cidade
    const hq = [...world.buildings.values()].find((b) => b.owner === humanId);
    if (hq) {
      const bx = hq.tx + hq.size / 2;
      const bz = hq.ty + hq.size / 2;
      const dx = bx - map.width / 2;
      const dz = bz - map.height / 2;
      this.cam.yaw = Math.atan2(dx, dz);
      const len = Math.hypot(dx, dz) || 1;
      this.cam.distance = 34;
      this.cam.centerOn(bx - (dx / len) * 2, bz - (dz / len) * 2);
    }
    this.syncEntities(1, new Set());
  }

  private clearWorld() {
    this.effects.clear();
    for (const v of this.unitViews.values()) this.worldGroup.remove(v.obj);
    for (const v of this.buildingViews.values()) this.worldGroup.remove(v.obj);
    for (const v of this.ruinViews.values()) this.worldGroup.remove(v);
    this.unitViews.clear();
    this.buildingViews.clear();
    this.ruinViews.clear();
    // Geometrias de modelos são compartilhadas (cache) e reaproveitadas entre partidas.
    this.worldGroup.clear();
    this.setGhost(null);
  }

  /** Atualiza as cores de território (chamado quando setores mudam de dono). */
  updateTerritory() {
    const { map, sectors, players } = this.world;
    const d = this.territoryData;
    const color = new THREE.Color();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const sid = Math.floor(y / map.sectorSize) * map.sectorsX + Math.floor(x / map.sectorSize);
        const owner = sectors[sid].owner;
        const lx = x % map.sectorSize;
        const ly = y % map.sectorSize;
        const edge = lx === 0 || ly === 0 || lx === map.sectorSize - 1 || ly === map.sectorSize - 1;
        const i = (y * map.width + x) * 4;
        if (owner === null) {
          d[i] = d[i + 1] = d[i + 2] = 255;
          d[i + 3] = edge ? 40 : 0;
        } else {
          color.setHex(players[owner].color);
          d[i] = color.r * 255;
          d[i + 1] = color.g * 255;
          d[i + 2] = color.b * 255;
          d[i + 3] = edge ? 170 : 38;
        }
      }
    }
    this.territoryTex.needsUpdate = true;
  }

  /** Copia a visibilidade do jogador humano para a textura de névoa. */
  updateFog() {
    const vis = this.world.visibility[this.humanId];
    const d = this.fogData;
    for (let i = 0; i < vis.length; i++) {
      const v = vis[i] === 2 ? 255 : vis[i] === 1 ? 120 : 0;
      d[i * 4] = v;
      d[i * 4 + 3] = 255;
    }
    this.fogTex.needsUpdate = true;
  }

  handleEvents(events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const visible =
            !this.world.config.fogOfWar ||
            this.world.visibility[this.humanId][Math.floor(e.y0) * this.world.map.width + Math.floor(e.x0)] === 2 ||
            this.world.visibility[this.humanId][Math.floor(e.y1) * this.world.map.width + Math.floor(e.x1)] === 2;
          if (visible) this.effects.tracer(e.x0, e.y0, e.x1, e.y1, e.heavy);
          break;
        }
        case 'death':
          if (this.isPointVisible(e.x, e.y)) {
            if (e.vehicle) this.effects.explosion(e.x, e.y, 0.9);
            else this.effects.flash(e.x, e.y, 0.35, 0xb03030, 0.4);
          }
          break;
        case 'buildingDestroyed':
          if (this.isPointVisible(e.x, e.y)) this.effects.explosion(e.x, e.y, e.size * 0.8);
          break;
        case 'sectorCaptured':
        case 'sectorLost':
        case 'playerEliminated':
          this.updateTerritory();
          break;
      }
    }
  }

  private isPointVisible(x: number, y: number): boolean {
    if (!this.world.config.fogOfWar) return true;
    return this.world.visibility[this.humanId][Math.floor(y) * this.world.map.width + Math.floor(x)] === 2;
  }

  /** Sincroniza objetos 3D com as entidades da simulação. alpha = interpolação entre ticks. */
  syncEntities(alpha: number, selection: Set<number>) {
    const world = this.world;
    // Unidades
    for (const [id, v] of this.unitViews) {
      if (!world.units.has(id)) {
        this.worldGroup.remove(v.obj);
        this.unitViews.delete(id);
      }
    }
    for (const u of world.units.values()) {
      let v = this.unitViews.get(u.id);
      if (!v) {
        const def = getUnitDef(u.type);
        const obj = new THREE.Group();
        const model = createUnitModel(def.model, world.players[u.owner].color);
        // Escala de leitura: unidades um pouco maiores que a proporção real do cenário.
        model.scale.setScalar(UNIT_SCALE);
        obj.add(model);
        const ring = new THREE.Mesh(this.ringGeoSmall, new THREE.MeshBasicMaterial({ color: 0x5cff8a, transparent: true, opacity: 0.9, depthWrite: false }));
        ring.position.y = 0.05;
        if (def.category === 'vehicle') ring.scale.setScalar(1.45);
        obj.add(ring);
        this.worldGroup.add(obj);
        v = { obj, ring };
        this.unitViews.set(u.id, v);
      }
      const visible = u.owner === this.humanId || isVisibleTo(world, this.humanId, u);
      v.obj.visible = visible;
      if (!visible) continue;
      const x = u.px + (u.x - u.px) * alpha;
      const z = u.py + (u.y - u.py) * alpha;
      v.obj.position.set(x, 0, z);
      // Rotação suave em direção ao "facing"
      const targetRot = -u.facing;
      let diff = targetRot - v.obj.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      v.obj.rotation.y += diff * 0.25;
      v.ring.visible = selection.has(u.id);
      (v.ring.material as THREE.MeshBasicMaterial).color.setHex(u.owner === this.humanId ? 0x5cff8a : 0xff5050);
      v.ring.rotation.y = -v.obj.rotation.y;
    }

    // Construções
    for (const [id, v] of this.buildingViews) {
      if (!world.buildings.has(id)) {
        this.worldGroup.remove(v.obj);
        this.buildingViews.delete(id);
      }
    }
    for (const b of world.buildings.values()) {
      let v = this.buildingViews.get(b.id);
      const def = getBuildingDef(b.type);
      if (!v) {
        const obj = new THREE.Group();
        obj.position.set(b.tx + b.size / 2, 0, b.ty + b.size / 2);
        const model = createBuildingModel(def.role, def.faction, b.size, world.players[b.owner].color);
        obj.add(model);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(b.size * 0.68, b.size * 0.72, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x5cff8a, transparent: true, depthWrite: false }),
        );
        ring.position.y = 0.06;
        obj.add(ring);
        obj.userData.pick = { kind: 'building', id: b.id };
        this.worldGroup.add(obj);
        v = { obj, model, scaffold: null, ring, smokeTimer: 0 };
        this.buildingViews.set(b.id, v);
      }
      const explored = b.owner === this.humanId || this.isBuildingExplored(b);
      v.obj.visible = explored;
      if (!explored) continue;
      if (!b.built) {
        v.model.scale.y = 0.12 + 0.88 * b.progress;
        if (!v.scaffold) {
          v.scaffold = createScaffold(b.size);
          v.obj.add(v.scaffold);
        }
        v.scaffold.scale.y = 2.2;
        v.scaffold.position.y = 1.1;
      } else {
        v.model.scale.y = 1;
        if (v.scaffold) {
          v.obj.remove(v.scaffold);
          v.scaffold = null;
        }
      }
      // Demolição: afunda a construção
      v.model.position.y = b.demolishTicks > 0 ? -0.3 * (1 - b.demolishTicks / 30) : 0;
      v.ring.visible = selection.has(b.id);
      (v.ring.material as THREE.MeshBasicMaterial).color.setHex(b.owner === this.humanId ? 0x5cff8a : 0xff5050);
    }

    // Ruínas
    for (const [id, g] of this.ruinViews) {
      if (!world.ruins.has(id)) {
        this.worldGroup.remove(g);
        this.ruinViews.delete(id);
      }
    }
    for (const r of world.ruins.values()) {
      if (this.ruinViews.has(r.id)) continue;
      const g = createRuinModel(r.size, r.id);
      g.position.set(r.tx + r.size / 2, 0, r.ty + r.size / 2);
      g.userData.pick = { kind: 'ruin', id: r.id };
      this.worldGroup.add(g);
      this.ruinViews.set(r.id, g);
    }
  }

  private isBuildingExplored(b: { tx: number; ty: number; size: number }): boolean {
    if (!this.world.config.fogOfWar) return true;
    const vis = this.world.visibility[this.humanId];
    const w = this.world.map.width;
    for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) if (vis[y * w + x] > 0) return true;
    return false;
  }

  private updateSectors(dt: number) {
    const { sectors, players } = this.world;
    this.sectorViews.forEach((v, i) => {
      const s = sectors[i];
      const ownerColor = s.owner === null ? 0xf2f2f2 : players[s.owner].color;
      v.flagMat.color.setHex(ownerColor);
      // Bandeira tremulando
      const pos = v.flag.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const x = (k % 7) / 6;
        pos.setZ(k, Math.sin(this.time * 4 + x * 5 + i) * 0.06 * x);
      }
      pos.needsUpdate = true;
      // Anel de progresso: cor da equipe que capturando/controla
      const team = s.owner ?? s.captureTeam;
      const show = s.progress > 0.5 && (s.owner === null || s.progress < 99.5 || s.contested);
      v.ring.visible = show;
      if (show) {
        v.ringMat.color.setHex(s.contested ? 0xffd040 : team === null ? 0xffffff : players[team].color);
        const count = Math.round((s.progress / 100) * v.ringSegments) * 6;
        v.ring.geometry.setDrawRange(0, count);
        v.ringMat.opacity = s.contested ? 0.5 + 0.4 * Math.sin(this.time * 8) : 0.85;
      }
    });
    void dt;
  }

  /** Fantasma de posicionamento de construção. tiles = validade por tile. */
  setGhost(spec: { size: number; tx: number; ty: number; tiles: boolean[]; ok: boolean; height: number } | null) {
    if (!spec) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostTiles = null;
      return;
    }
    if (!this.ghost || (this.ghostTiles && this.ghostTiles.count !== spec.size * spec.size)) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = new THREE.Group();
      const tileGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
      this.ghostTiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), spec.size * spec.size);
      this.ghost.add(this.ghostTiles);
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(spec.size - 0.1, spec.height, spec.size - 0.1)),
        new THREE.LineBasicMaterial({ color: 0xffffff }),
      );
      box.name = 'box';
      this.ghost.add(box);
      this.scene.add(this.ghost);
    }
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < spec.tiles.length; i++) {
      const lx = i % spec.size;
      const ly = Math.floor(i / spec.size);
      m.makeTranslation(spec.tx + lx + 0.5, 0.08, spec.ty + ly + 0.5);
      this.ghostTiles!.setMatrixAt(i, m);
      c.setHex(spec.tiles[i] ? 0x3dff7a : 0xff3d3d);
      this.ghostTiles!.setColorAt(i, c);
    }
    this.ghostTiles!.instanceMatrix.needsUpdate = true;
    if (this.ghostTiles!.instanceColor) this.ghostTiles!.instanceColor.needsUpdate = true;
    const box = this.ghost.getObjectByName('box') as THREE.LineSegments;
    box.position.set(spec.tx + spec.size / 2, spec.height / 2, spec.ty + spec.size / 2);
    (box.material as THREE.LineBasicMaterial).color.setHex(spec.ok ? 0x3dff7a : 0xff3d3d);
  }

  setRallyMarker(p: { x: number; y: number } | null) {
    this.rallyMarker.visible = !!p;
    if (p) this.rallyMarker.position.set(p.x, 0, p.y);
  }

  /** Converte coordenadas de tela (pixels relativos ao canvas) em ponto no chão. */
  screenToGround(sx: number, sy: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((sx / rect.width) * 2 - 1, -(sy / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, p)) return null;
    return { x: p.x, y: p.z };
  }

  /** Seleciona construção ou ruína sob o cursor (raycast nos modelos). */
  pickStructure(sx: number, sy: number): { kind: 'building' | 'ruin'; id: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((sx / rect.width) * 2 - 1, -(sy / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets: THREE.Object3D[] = [];
    for (const v of this.buildingViews.values()) if (v.obj.visible) targets.push(v.obj);
    for (const g of this.ruinViews.values()) targets.push(g);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick as { kind: 'building' | 'ruin'; id: number };
    }
    return null;
  }

  private tmp = new THREE.Vector3();
  worldToScreen(x: number, y: number, h = 0): { x: number; y: number; visible: boolean } {
    this.tmp.set(x, h, y).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: (this.tmp.x * 0.5 + 0.5) * rect.width,
      y: (-this.tmp.y * 0.5 + 0.5) * rect.height,
      visible: this.tmp.z < 1 && this.tmp.z > -1,
    };
  }

  /** Pontos do chão nos cantos da tela (para o retângulo da câmera no minimapa). */
  viewCorners(): { x: number; y: number }[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pts = [
      [0, 0],
      [rect.width, 0],
      [rect.width, rect.height],
      [0, rect.height],
    ];
    return pts.map(([sx, sy]) => this.screenToGround(sx, sy) ?? { x: this.cam.target.x, y: this.cam.target.z });
  }

  render(dt: number, alpha: number, selection: Set<number>) {
    this.time += dt;
    const el = this.renderer.domElement;
    if (this.container.clientWidth && (el.clientWidth !== this.container.clientWidth || el.clientHeight !== this.container.clientHeight)) this.resize();
    this.cam.apply();
    // A luz do sol acompanha a câmera para manter sombras nítidas na área vista.
    const t = this.cam.target;
    this.sun.position.set(t.x - 30, 60, t.z - 18);
    this.sun.target.position.set(t.x, 0, t.z);
    const span = Math.min(70, this.cam.distance * 1.3);
    const sc = this.sun.shadow.camera;
    if (sc.right !== span) {
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.updateProjectionMatrix();
    }
    this.syncEntities(alpha, selection);
    this.updateSectors(dt);
    this.effects.update(dt);
    // Fumaça em construções muito danificadas
    for (const [id, v] of this.buildingViews) {
      const b = this.world.buildings.get(id);
      if (!b || !b.built || !v.obj.visible || b.hp > b.maxHp * 0.4) continue;
      v.smokeTimer -= dt;
      if (v.smokeTimer <= 0) {
        v.smokeTimer = 0.35;
        this.effects.smoke(b.tx + b.size / 2 + (Math.random() - 0.5) * b.size * 0.5, b.ty + b.size / 2, 0.5);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
