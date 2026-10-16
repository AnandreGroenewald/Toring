// (1.17 3D) Die Kasteelreeks: `kasteel.html` plays a siege (siege.js); `?shot=kasteel|beleg|visier` draws the style
// pictures (shots.js).
if (new URLSearchParams(location.search).has('shot')) import('./shots.js');
else import('./siege.js');
