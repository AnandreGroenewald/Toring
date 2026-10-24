# Stapel's Blender models (1.20)

Each model is made by a script, headless, no hand work: `common.py` has the helpers (a skin-modifier body made smooth,
primitives, joining, pivots, surface detail, the bake into one texture set, the glTF export).

    ~/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P art/blender/croc.py -- img/models/croc.glb

| Script | Model | Parts the game moves |
|---|---|---|
| builder.py | the builder, his surfboard and bazooka | thigh, shin, pelvis, torso, head, upperarm, forearm, board, bazooka (dressed onto js/rivier/rider.js's joints) |
| croc.py | the crocodile | jaw (snaps) |
| hippo.py | the hippo | jaw (yawns) |
| monkey.py | Blouaap on his block | head, arms (the paddle) |
| dorp.py | the Karoo town | huis1-3, kerk, windpomp, rotor (turns), tenk (instanced by things.js) |
| island.py | the rock island | island |
| props.py | life ring + swimmer, boulders, jetty, boat | swimarm (waves) |

After changing a model: raise its number in `MODEL_V` (js/rivier/models.js), so the website's model cache fetches it
again. Pictures: proto/models.html?m=croc (and ~/.claude/skills/stapel/scripts/qa/model_shot.mjs).
