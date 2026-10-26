# 1.22 polish hunt (26 Oct 2026)

Anandre, 26 Oct: "check the finer details on the Stapel game ... create something spectacular with the current version,
no need to add another game mode, lets optimise what weve got ... release it in the beginning of November". Then: "look at
the landscape look at the shadows look at the turning blocks". His picks: River run, Menu and screens, plus "there is no
daily leaderboard that is easy accessible for the Afgly". Pictures: scripts/qa audit122.mjs, dive122.mjs, rvsnap122.mjs.

## Done (local, not live)
- Invites: the app passes ?gly= (Saam gly) on to the game (app/shim.js LINK_RE); a link while the game runs opens the
  friend's room, or after this tower or ride (main.js 'stapel:link', saamLinkWaiting, S.saamLater).
- Tower: the island billboard only for a sponsor (GameScene.placeBillboard): it stood over the tower and the proverb.
- River: the loading ring leaves at once (veilOff); the rider's legs in an A (LEG_APART/LEG_SPLAY), the boots on the
  board (hip height sets the knee bend), white froth round the board instead of a dark hole (foam hull); the wake fades
  in (no hard edge in a jump); the day's sun 26° (shorter, softer shadows, catcher 0.34); stones' sandstone 4× larger
  (no wood-grain rings); walls: picture by height + distance along, no bump, rounded ledges, finer mesh, softer cracks
  and varnish (no streaks or teeth); floating blocks sway instead of spinning; stand-in elephant grey; water: less
  swell, softer glitter, fainter foam lines outside rapids, fine ripples near the camera.

## Still to do
- River: lake landscape (striped hills, flat island slab), sky (flat beige), waterfalls (flat strips), the dive's start.
- Tower: too many messages at once, fog turning everything white, the red miss ghost (muddy), falling blocks.
- Screens: results card busy, menu.
- Afgly daily leaderboard one tap from the menu.
