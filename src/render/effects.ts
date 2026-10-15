// Efeitos visuais simples e reaproveitados (pool): disparos, impactos,
// explosões, fumaça e marcadores de ordem.
import * as THREE from 'three';

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  update: (t: number, dt: number) => void;
}

export class Effects {
  readonly group = new THREE.Group();
  private active: Fx[] = [];
  private tracerPool: THREE.Line[] = [];
  private spherePool: THREE.Mesh[] = [];
  private ringPool: THREE.Mesh[] = [];
  private sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  private ringGeo = new THREE.RingGeometry(0.7, 1, 24);
  enabled = true;

  constructor() {
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  private spawn(fx: Fx) {
    this.group.add(fx.obj);
    this.active.push(fx);
  }

  tracer(x0: number, z0: number, x1: number, z1: number, heavy: boolean) {
    if (!this.enabled) return;
    const line =
      this.tracerPool.pop() ??
      new THREE.Line(
        new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
        new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true }),
      );
    const p = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, x0, heavy ? 0.65 : 0.45, z0);
    p.setXYZ(1, x1, 0.4, z1);
    p.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    const m = line.material as THREE.LineBasicMaterial;
    m.color.setHex(heavy ? 0xffa040 : 0xffe08a);
    m.opacity = 1;
    this.spawn({
      obj: line,
      life: 0,
      max: heavy ? 0.18 : 0.1,
      update: (t) => {
        m.opacity = 1 - t;
      },
    });
    this.flash(x1, z1, heavy ? 0.22 : 0.1, heavy ? 0xff8a30 : 0xfff2b0, 0.12);
  }

  private sphere(color: number): THREE.Mesh {
    const s = this.spherePool.pop() ?? new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    (s.material as THREE.MeshBasicMaterial).color.setHex(color);
    return s;
  }

  flash(x: number, z: number, size: number, color: number, dur: number) {
    if (!this.enabled) return;
    const s = this.sphere(color);
    s.position.set(x, 0.4, z);
    const m = s.material as THREE.MeshBasicMaterial;
    this.spawn({
      obj: s,
      life: 0,
      max: dur,
      update: (t) => {
        s.scale.setScalar(size * (0.6 + t));
        m.opacity = 1 - t;
      },
    });
  }

  explosion(x: number, z: number, size: number) {
    const s = this.sphere(0xff7a1a);
    s.position.set(x, 0.3, z);
    const m = s.material as THREE.MeshBasicMaterial;
    this.spawn({
      obj: s,
      life: 0,
      max: 0.55,
      update: (t) => {
        s.scale.setScalar(size * (0.3 + t * 1.2));
        m.color.setHSL(0.08 - t * 0.06, 1, 0.55 - t * 0.35);
        m.opacity = 1 - t;
      },
    });
    for (let i = 0; i < Math.ceil(size * 2); i++) this.smoke(x + (Math.random() - 0.5) * size, z + (Math.random() - 0.5) * size, size * 0.6);
  }

  smoke(x: number, z: number, size: number) {
    if (!this.enabled) return;
    const s = this.sphere(0x444444);
    s.position.set(x, 0.5, z);
    const m = s.material as THREE.MeshBasicMaterial;
    const drift = (Math.random() - 0.5) * 0.4;
    this.spawn({
      obj: s,
      life: 0,
      max: 1.6,
      update: (t) => {
        s.position.y = 0.5 + t * 2.5;
        s.position.x = x + drift * t;
        s.scale.setScalar(size * (0.4 + t));
        m.opacity = 0.55 * (1 - t);
      },
    });
  }

  marker(x: number, z: number, color: number) {
    const r = this.ringPool.pop() ?? new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    const m = r.material as THREE.MeshBasicMaterial;
    m.color.setHex(color);
    r.position.set(x, 0.06, z);
    this.spawn({
      obj: r,
      life: 0,
      max: 0.5,
      update: (t) => {
        r.scale.setScalar(0.9 - t * 0.6);
        m.opacity = 1 - t;
      },
    });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life += dt;
      const t = Math.min(1, fx.life / fx.max);
      fx.update(t, dt);
      if (fx.life >= fx.max) {
        this.group.remove(fx.obj);
        this.active.splice(i, 1);
        if (fx.obj instanceof THREE.Line) this.tracerPool.push(fx.obj);
        else if (fx.obj instanceof THREE.Mesh && fx.obj.geometry === this.ringGeo) this.ringPool.push(fx.obj);
        else if (fx.obj instanceof THREE.Mesh) this.spherePool.push(fx.obj);
      }
    }
  }

  clear() {
    for (const fx of this.active) this.group.remove(fx.obj);
    this.active = [];
  }
}
