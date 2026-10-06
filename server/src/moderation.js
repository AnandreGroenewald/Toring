// Moderation of everything a sponsor wants shown in the game.
// The rules live in ONE place, js/core/nameRules.js, which the sign-up page and the game
// import too, so the instant feedback in the browser always agrees with this server.
// The server stays authoritative: it re-checks everything it is sent. wrangler's bundler
// (esbuild) follows this import, so `wrangler deploy` ships the shared file inside the Worker.
export * from '../../js/core/nameRules.js';
