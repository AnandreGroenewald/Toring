// (1.20) The river's Blender models (art/blender/*.py → img/models/*.glb): loaded once, their materials bent with the
// river like everything else, cloned for each use (the geometry and materials are shared). A model that can't be had
// (no connection, an old browser) is simply left out: the animals fall back to their simple shapes.
import { GLTFLoader } from '../../lib/three-addons/loaders/GLTFLoader.js';
import { bendMaterial, rimMaterial } from './world.js';

const cache = new Map();   // name -> Promise<scene | null>
const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'bumpMap', 'aoMap', 'alphaMap'];
/**
 * Each model's version: raise it when its .glb changes (the website's service worker keeps a model until its name,
 * with this number, changes: sw.js MODELS).
 */
export const MODEL_V = { croc: 7, hippo: 7, monkey: 7, builder: 11, dorp: 3, island: 2, props: 5, hazards: 5, elephant: 3 };
const WAIT_MS = 4000;      // (a ride never waits longer than this for its models)
// (the characters and creatures get the rim light: the people in the rings, not the rocks, boats or town)
const RIM_MODELS = new Set(['croc', 'monkey', 'builder']);   // (not the hippo: so much of it faces sideways that it washes out)
const RIM_PARTS = new Set(['ring', 'swimmer', 'swimarm']);
const partOf = (o) => { for (let p = o; p; p = p.parent) if (RIM_PARTS.has(p.name)) return true; return false; };

function load(name) {
  if (!cache.has(name)) {
    const url = new URL(`../../img/models/${name}.glb?v=${MODEL_V[name] || 1}`, import.meta.url).href;
    const once = () => new GLTFLoader().loadAsync(url);
    // (a download the browser dropped is tried once more; a model that still can't be had isn't remembered as
    // missing: the next ride asks again)
    cache.set(name, once().catch(() => new Promise((res) => setTimeout(res, 400)).then(once)).then((g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        o.castShadow = o.receiveShadow = true;
        o.material = bendMaterial(o.material);
        if (RIM_MODELS.has(name) || (name === 'props' && partOf(o))) rimMaterial(o.material);
        // (kept for every ride: a screen's clean-up passes these by)
        o.geometry.userData.model = true;
        o.material.userData.model = true;
        for (const k of TEX_SLOTS) if (o.material[k]) o.material[k].userData.model = true;
      });
      return g.scene;
    }).catch(() => {
      cache.delete(name);
      return null;
    }));
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
