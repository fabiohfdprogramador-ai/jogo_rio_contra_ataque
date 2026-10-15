// Injeta a névoa de guerra nos materiais via onBeforeCompile: cada fragmento
// consulta a textura de visibilidade pela posição no mundo. Assim terreno,
// prédios e estruturas escurecem de forma consistente, sem planos sobrepostos.
import * as THREE from 'three';

export const fogUniforms = {
  uFogTex: { value: null as THREE.Texture | null },
  uMapSize: { value: new THREE.Vector2(1, 1) },
  uFogEnabled: { value: 1 },
};

export function applyFog<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogTex = fogUniforms.uFogTex;
    shader.uniforms.uMapSize = fogUniforms.uMapSize;
    shader.uniforms.uFogEnabled = fogUniforms.uFogEnabled;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFowWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fowW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fowW = instanceMatrix * fowW;
        #endif
        vFowWorld = (modelMatrix * fowW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFowWorld;
        uniform sampler2D uFogTex;
        uniform vec2 uMapSize;
        uniform float uFogEnabled;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uFogEnabled > 0.5) {
          vec2 fowUv = vec2(vFowWorld.x / uMapSize.x, vFowWorld.z / uMapSize.y);
          float fowV = texture2D(uFogTex, fowUv).r;
          // 0 = desconhecido (quase preto), ~0.5 = explorado (escurecido), 1 = visível
          float fowK = mix(0.06, 1.0, smoothstep(0.0, 1.0, fowV));
          float fowGray = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 fowCol = mix(vec3(fowGray) * 0.85, gl_FragColor.rgb, smoothstep(0.6, 1.0, fowV));
          gl_FragColor.rgb = fowCol * fowK;
        }`,
      );
  };
  // Garante um programa separado por material (evita cache incorreto).
  material.customProgramCacheKey = () => 'fow';
  return material;
}
