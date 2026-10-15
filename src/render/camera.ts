// Câmera estratégica: inclinada sobre o terreno, com deslocamento, zoom e rotação.
import * as THREE from 'three';

export class CameraController {
  readonly target = new THREE.Vector3();
  distance = 34;
  yaw = Math.PI / 4; // rotação em torno do eixo vertical
  pitch = 0.95; // inclinação (rad) acima do horizonte
  minDistance = 12;
  maxDistance = 75;

  constructor(
    public camera: THREE.PerspectiveCamera,
    private mapW: number,
    private mapH: number,
  ) {
    this.target.set(mapW / 2, 0, mapH / 2);
  }

  setBounds(w: number, h: number) {
    this.mapW = w;
    this.mapH = h;
  }

  /** Move a câmera em coordenadas relativas à tela (dx = direita, dy = para cima na tela). */
  pan(dx: number, dy: number) {
    const k = this.distance / 30;
    // Direções "direita" e "frente" no chão de acordo com a rotação.
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.target.x += (rx * dx + fx * dy) * k;
    this.target.z += (rz * dx + fz * dy) * k;
    this.clamp();
  }

  zoom(delta: number) {
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + delta), this.minDistance, this.maxDistance);
  }

  rotate(delta: number) {
    this.yaw += delta;
  }

  centerOn(x: number, z: number) {
    this.target.set(x, 0, z);
    this.clamp();
  }

  private clamp() {
    const m = 4;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -m, this.mapW + m);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -m, this.mapH + m);
  }

  apply() {
    const h = Math.sin(this.pitch) * this.distance;
    const r = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(this.target.x + Math.sin(this.yaw) * r, h, this.target.z + Math.cos(this.yaw) * r);
    this.camera.lookAt(this.target);
  }
}
