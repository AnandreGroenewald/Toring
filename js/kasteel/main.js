// (1.17 3D) Die Kasteelreeks: `kasteel.html` plays a siege (siege.js; `?teen=my` attacks a copy of your own castle);
// `?plan` is your castle and its defence plan (planner.js); `?shot=kasteel|beleg|visier` draws the style pictures.
const q = new URLSearchParams(location.search);
if (q.has('shot')) import('./shots.js');
else if (q.has('plan')) import('./planner.js');
else import('./siege.js');
