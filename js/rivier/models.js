// (1.20) The river's Blender models (art/blender/*.py → img/models/*.glb): loaded once, their materials bent with the
// river like everything else, cloned for each use (the geometry and materials are shared). A model that can't be had
// (no connection, an old browser) is simply left out: the animals fall back to their simple shapes.
import { GLTFLoader } from '../../lib/three-addons/loaders/GLTFLoader.js';
import { bendMaterial } from './world.js';

const cache = new Map();   // name -> Promise<scene | null>
const WAIT_MS = 4000;      // (a ride never waits longer than this for its models)

function load(name) {
  if (!cache.has(name)) {
    const url = new URL(`../../img/models/${name}.glb`, import.meta.url).href;
    cache.set(name, new GLTFLoader().loadAsync(url).then((g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        o.material = bendMaterial(o.material);
      });
      return g.scene;
    }).catch(() => null));
  }
  return cache.get(name);
}

/** The named models ({ name: scene }), those that loaded within WAIT_MS. */
export async function loadModels(names) {
  const timeout = new Promise((res) => setTimeout(() => res(null), WAIT_MS));
  const got = await Promise.all(names.map((n) => Promise.race([load(n), timeout]).then((s) => [n, s])));
  return Object.fromEntries(got.filter(([, s]) => s));
}

/** A copy of a loaded model (its parts keep their names: `getObjectByName('jaw')`). */
export const cloneModel = (scene) => scene.clone(true);
