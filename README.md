# Pangea

A private browser game for 3–4 friends: settle a hex island, trade, build cities and
knights, improve your cities, and fend off barbarian raids. Each player drafts a
historical civilization (Rome, Egypt, Han China, Maya, Mali, Norse, Japan, Persia), and
every piece they own is drawn in that civ's style and colors. First to 13 victory points
on their own turn wins.

The full design and rules (in Pangea's own words) are in
[`docs/superpowers/specs/2026-11-24-pangea-design.md`](docs/superpowers/specs/2026-11-24-pangea-design.md).

## Hosting a game night (one PC runs it, everyone else just opens a link)

You need **Node.js 20 or newer** on the host PC.

- Mac: `brew install node` (or the LTS installer from nodejs.org)
- Windows: `winget install OpenJS.NodeJS.LTS` (or the LTS installer from nodejs.org)

### First time

```bash
git clone https://github.com/andrjackson/pangea-game.git
```

```bash
cd pangea-game
```

```bash
npm install
```

### Every game night

1. Start the game server (builds the site, then serves it on port 3000):

   ```bash
   npm run host
   ```

   Open http://localhost:3000 to check it's up.

2. In a **second terminal**, open a tunnel so friends can reach it. Install
   `cloudflared` once (Mac: `brew install cloudflared`, Windows:
   `winget install --id Cloudflare.cloudflared`), then:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   It prints a link like `https://some-words.trycloudflare.com`. Send that to your
   friends. The link changes every time you start the tunnel; nobody needs an account
   and friends install nothing.

3. Everyone opens the link: one person creates a game and shares the 4-letter code
   (or the invite link from the lobby), everyone picks a civilization, and the host
   picks the options (victory target 10–15, and the rulebook's spiral numbers or a
   random layout with no 6s or 8s side by side) and starts. When someone wins, the
   results screen shows everyone's points and stats, and **Play again with the same
   table** starts a fresh game with the same people and civs.

**Found a bug or something confusing?** Click **Report a problem** in the top bar
during the game. It saves the exact moment of the game plus your note in
`data/reports/` on the host PC. Open an issue on the GitHub repo and attach (or paste)
that file; bug issues get fixed before anything else on the [backlog](BACKLOG.md).

Keep the host PC awake. If it sleeps or the server stops, the game pauses; restart
`npm run host` and everyone's browser reconnects to the same game. Games are saved
after every move in `data/games/` (delete a file there to remove a finished game).

### Updating

```bash
git pull
```

```bash
npm install
```

Then `npm run host` as usual.

## How a turn works (quick reference)

- **Roll**: two number dice plus the event die. The event die either moves the
  raiders one step closer (each game draws a raider theme: Vikings, pirates,
  conquistadors, the Hunnic horde or the Sea Peoples), or opens a city gate (science, trade, politics) that
  hands out progress cards to players with improvements in that track.
- **Cities** produce a commodity on forest (paper), pasture (cloth) and mountains (coin).
  Spend commodities to improve your cities; level 3 unlocks an ability, and the first to
  level 4 in a track raises a metropolis.
- **Knights** (raise, activate, promote) defend against the barbarians. When the ship
  lands, active knight strength must match the number of cities on the island, or the
  weakest defenders lose a city.
- The **robber** sleeps until the first barbarian raid.
- **Undo** takes back your last build, knight action, improvement or bank trade. It
  can't undo dice, cards, steals or trades with players.
- **Hover** over any tile, piece or harbor for details.
- **Territory** is just for looks: tiles take on the style of whichever civs have
  spread onto them with roads, settlements and cities, and shared tiles are split
  between those civs.
- The **Waiting on** panel shows exactly who the game is waiting for (discards,
  robber moves, card choices…).

## Development

```bash
npm test
```

runs the rules-engine tests (including long random-play games that check the
rules never reach an impossible state).

```bash
npm run e2e
```

builds the site and drives real game screens with three browsers: barbarian raids,
knight displacement, every interactive progress card, trades, and the turn alerts.
It needs the `playwright` package and a Chromium it can launch.

For live-reload development, run these in two terminals and open http://localhost:5173:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Layout:

```
packages/engine   rules engine: pure TypeScript, no I/O, fully tested
packages/server   Express + Socket.IO: lobby, rooms, saves to data/games/
packages/client   React + SVG board and civ art
```

`PANGEA_DEBUG=1` enables a test-only endpoint that can rewrite games. Never set it for
real play.
