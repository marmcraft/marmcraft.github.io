import * as THREE from 'three';
import mesh from './assets/mineclonia-hand/mesh.json';
import skinUrl from './assets/mineclonia-hand/character.png';

/** Original CC0 Mineclonia mcl_meshhand mesh, with its wield pose removed offline. */
export function minecloniaHandGeometry(length = 12, mirror = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normal, 3));
  // Each face is a separate skin-atlas rectangle. Keep its edge samples inside
  // that rectangle: exact boundaries can select the neighbouring transparent
  // texel and discard fragments, exposing a crack along the knuckles.
  const uv = mesh.uv.slice();
  for (let face = 0; face < 6; face++) {
    const start = face * 8;
    for (let axis = 0; axis < 2; axis++) {
      const values = [0, 2, 4, 6].map(i => uv[start + i + axis]);
      const low = Math.min(...values), high = Math.max(...values);
      const inset = 0.5 / (axis === 0 ? 64 : 32);
      for (let i = 0; i < 8; i += 2)
        uv[start + i + axis] = uv[start + i + axis] === low ? low + inset : high - inset;
    }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Reflection reverses winding; the second arm is the same authored mesh mirrored.
  const index = mesh.index.slice();
  if (mirror) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  g.setIndex(index);
  g.scale(mirror ? -1 : 1, length / 12, 1);
  g.computeBoundingSphere();
  return g;
}

let skin: THREE.Texture | undefined;
/** Bundled Mineclonia skin: no external fetch or dependency on a media host. */
export function minecloniaHandSkin(): THREE.Texture {
  if (!skin) {
    skin = new THREE.TextureLoader().load(skinUrl);
    skin.flipY = false; // the authored B3D UVs use the platform's top-down atlas convention.
    skin.magFilter = skin.minFilter = THREE.NearestFilter;
    skin.generateMipmaps = false;
    skin.colorSpace = THREE.SRGBColorSpace;
  }
  return skin;
}
