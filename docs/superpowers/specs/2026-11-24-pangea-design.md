# Pangea — Design

Date: 2026-11-24 · Status: approved to build ("go ahead and build out as much as you can")

## Intent

A private, free, browser-based hex-island trading game for one group of friends,
playing the full "cities and knights" style ruleset (commodities, city improvements,
knights, barbarian raids, progress cards). It is a creative experiment: the rules play
the same as the tabletop expansion the group knows, but the name, look, art, card
names and wording are Pangea's own.

## Goals

- 3–4 players over the internet, each on their own laptop browser.
- Complete cities-and-knights rules, enforced by the server.
- Each player drafts a historical civilization at the lobby. The civ sets the player's
  color pair and the art of every piece they own.
- Randomized board built the way the tabletop rulebook does it.
- Games survive a server restart or a dropped connection.
- Undo for harmless mistakes; a "waiting on…" panel showing who the game is waiting for
  (especially who owes a discard).

## Non-goals (for now)

- Base-game rules (development cards, largest army). Only the knights ruleset.
- 5–6 player board or rules.
- Bots, accounts, matchmaking, ranked play, chat, turn timer.
- Phones/tablets. Laptop browsers only.
- Anti-cheat beyond the basics (the server still decides everything and only sends each
  player what they're allowed to see, because that's cheap).

## Anti-goals

- Using the original game's name, logo, art, card names or rule text.
- A rules engine that lets the game reach a state the tabletop rules don't allow
  (a broken game 90 minutes in is the worst failure).

## Constraints

- Hosted on one friend's PC (OS not yet decided, so everything must run on Windows and
  macOS: Node.js only, no native modules). Friends connect through a Cloudflare quick
  tunnel.
- Code lives in `andrjackson/pangea-game`.

## Approaches considered

1. **Hand-built engine + small Socket.IO server (chosen).** Rules are pure TypeScript
   functions `(state, action) → state` with a queue of pending decisions. The server
   holds state, persists it as JSON after each action, and sends per-player views.
   Full control over the knights ruleset's chained interruptions, undo, and the
   waiting-on panel; costs a few hundred lines of room/reconnect plumbing.
2. boardgame.io — built-in turns, stages, hidden info, undo. Rejected: chained
   interruptions (a card forcing a choice that forces another choice) fight its stage
   model, and the project's development has slowed.
3. Colyseus — rooms and state sync built in. Rejected: built around mutating synced
   objects, which works against a pure rules engine; more machinery than 4 friends need.

## Architecture

```
packages/
  engine/   pure TS rules: board generation, state, actions, views. No I/O. Vitest tests.
  server/   Node + Express + Socket.IO. Lobby, rooms, persistence (data/games/*.json),
            serves the built client. One port.
  client/   React + Vite, SVG board. Civ art as SVG components.
```

- **State** is a plain JSON object. The engine owns the RNG (seeded mulberry32 kept in
  state), so shuffles and dice are reproducible from a seed and testable.
- **Actions** are `{ type, ...params }` sent by a player. `applyAction(state, playerId,
  action)` validates and returns a new state, or throws a `RuleError` with a
  human-readable message the client shows.
- **Decision queue.** `state.pending` holds decisions the game is waiting on. A pending
  entry names one or more players who must answer (simultaneous answers allowed, e.g.
  everyone discarding on a 7). While anything is pending, normal turn actions are
  blocked. The waiting-on panel is a rendering of `state.pending`.
- **Views.** `viewFor(state, playerId)` strips the RNG, deck order, undo history and
  other players' hands (replaced by counts), and reveals only what a pending decision
  entitles the player to see (e.g. a target's hand when taking 2 cards from it).
- **Undo.** Before an undoable action by the current player, the engine snapshots the
  state. Undoable = reveals nothing new and involves nobody else: building, bank/harbor
  trades, knight activate/promote/move (without displacing), city improvements. Anything
  else (dice, drawing or playing a progress card, stealing, player trades, displacing)
  clears the undo history.
- **Persistence.** The server writes `data/games/<code>.json` (atomic write-then-rename)
  after every accepted action. On start it loads all saved games. Reconnect = the client
  rejoins with a token kept in localStorage.

## Rules (in Pangea's own words)

### Board

- 19 land tiles: 3 hills (brick), 4 forest (lumber), 4 pasture (wool), 4 fields (grain),
  3 mountains (ore), 1 desert. Shuffled into a radius-2 hexagon.
- Number tokens: the fixed sequence 5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6,
  3, 11 is laid counterclockwise in a spiral, starting at a random corner of the outer
  ring, then the inner ring, then the center, skipping the desert.
- 9 harbors at fixed, evenly spaced coastal positions; types shuffled: four 3:1 and one
  2:1 for each resource.
- The robber starts on the desert.

### Pieces and costs

| Piece | Cost | Limit |
|---|---|---|
| Road | brick + lumber | 15 |
| Settlement (1 VP) | brick + lumber + wool + grain | 5 |
| City (2 VP) | 2 grain + 3 ore, replaces a settlement | 4 |
| City wall | 2 brick, on a city | 3 |
| Knight (placed level 1, inactive) | wool + ore | 2 per level |
| Activate knight | grain | — |
| Promote knight one level | wool + ore | level 3 needs Politics 3 |
| City improvement level n | n commodities of that track | level 5 max, needs a city |

Placement: standard distance rule for settlements (no building on an adjacent
intersection); settlements and knights must touch one of your roads; roads extend from
your roads/buildings and may not pass through an intersection held by an opponent's
building or knight. No building on an intersection occupied by a knight.

### Production

- Cities on forest give 1 lumber + 1 paper; on pasture 1 wool + 1 cloth; on mountains
  1 ore + 1 coin; on hills 2 brick; on fields 2 grain. Settlements give 1 resource.
- The robber's tile produces nothing. The supply is unlimited (simplification).

### Setup

Random seat order. Round 1 in order: settlement + road. Round 2 in reverse: city +
road. Each player takes 1 resource per tile touching their city.

### A turn

1. (Optional) play **Augury** before rolling.
2. Roll the two number dice and the event die.
3. Event die first: 3 faces are the barbarian ship (move 1 step; on reaching step 7 they
   attack), 3 faces are city gates (science/green, trade/yellow, politics/blue). On a
   gate, every player whose improvement level in that track is ≥ 1 and for whom the red
   die ≤ level + 1 draws a progress card of that track.
4. Production, or on a 7: everyone holding more than 7 + 2×(their walls) cards
   (resources + commodities) discards half, rounded down. If the robber is active,
   the roller moves it and steals one random card from a player on that tile.
5. Main phase in any order: trade, build, improve, knight actions, progress cards.
6. End turn. A player must be at ≤ 4 progress cards to end their turn.

### Barbarians

- Strength = number of cities and metropolises on the board. Defense = total level of
  all active knights.
- Defense ≥ strength: the single top contributor gains a **Shield of Pangea** (1 VP).
  If tied, each tied player draws a progress card from a track of their choice.
- Strength > defense: among players who own at least one non-metropolis city, those with
  the lowest contribution each reduce one city (their choice) to a settlement; its wall
  is lost. Players with only metropolises are skipped (the next-lowest group loses).
- After any attack: all knights become inactive and the ship returns to the start.
- The robber stays on the desert and 7s cause only discards until the first attack.

### Knights

- Each knight may take one action per turn and only if it is active and was not
  activated this turn. Acting makes it inactive (it may be re-activated, but cannot act
  again that turn). Promote at most once per knight per turn.
- **Move:** along your connected roads to an empty intersection.
- **Displace:** move onto an opponent knight of strictly lower level reachable by your
  roads. The displaced owner moves it (keeping its status) to an empty intersection
  connected to its old spot by their roads, or removes it if there is none.
- **Chase the robber:** a knight touching the robber's tile moves the robber and steals.
- Opponent knights break your longest road, like buildings.

### City improvements

- Science (paper), Trade (cloth), Politics (coin); level 3 abilities:
  - Science 3, **Granaries:** a non-7 roll that gives you nothing lets you take any
    one resource.
  - Trade 3, **Counting House:** trade 2 of one commodity for any 1 card with the bank.
  - Politics 3, **Citadel:** knights may be promoted to level 3.
- First to level 4 in a track turns one of their cities into that track's
  **metropolis** (+2 VP, total 4; can't be lost to barbarians). Level 4+ requires a
  city that can take it. Reaching level 5 first takes the metropolis from a level-4
  holder; a level-5 holder keeps it permanently.

### Trading

- With the bank: 4 of one card for 1 of any card (resources and commodities alike);
  3:1 with a generic harbor; 2:1 for the matching resource at a 2:1 harbor; 2:1 for the
  caravan tile's resource while you hold the caravan; 2:1 for the type named by
  **Monsoon Winds** this turn; 2:1 commodity trades with Counting House.
- With players: only with the current player. The current player posts an offer to
  everyone; others accept/decline; the current player confirms with one acceptor.
  Others may post a counter-offer to the current player. No gifts (each side gives ≥ 1).

### Progress cards (18 per track, 54 total)

Hand limit 4 (VP cards are revealed immediately and don't count). Anyone who goes over
4 outside their own turn discards one immediately (back under the deck); the current
player must be at 4 to end their turn. Any number may be played per turn, all after the
roll except Augury.

| Track | Pangea name | × | Effect |
|---|---|---|---|
| Science | Augury | 2 | Before rolling, set both number dice yourself (event die still rolled) |
| Science | Scaffolding | 2 | Your next city improvement this turn costs 1 commodity less |
| Science | Master Mason | 1 | Build a city wall for free |
| Science | Surveyor | 2 | Swap two number tokens (never a 2, 6, 8 or 12) |
| Science | Canals | 2 | Take 2 grain per fields tile you touch |
| Science | Physician | 2 | Upgrade a settlement to a city for 2 ore + 1 grain |
| Science | Deep Shafts | 2 | Take 2 ore per mountains tile you touch |
| Science | Writing | 1 | 1 VP, revealed immediately |
| Science | Road Corps | 2 | Build 2 roads for free |
| Science | Armory | 2 | Promote up to 2 knights for free (Citadel rule applies) |
| Trade | Caravan | 6 | Put the caravan on a tile next to your building: 2:1 for that resource and 1 VP while you hold it |
| Trade | Harbor Levy | 2 | Offer each opponent 1 resource; each must return a commodity if they have one |
| Trade | Monsoon Winds | 2 | Pick one card type; trade it 2:1 with the bank this turn |
| Trade | Tribute | 2 | Pick a player with more VP, see their hand, take 2 cards |
| Trade | Market Corner | 4 | Name a resource; each opponent gives you up to 2 |
| Trade | Guild Charter | 2 | Name a commodity; each opponent gives you 1 |
| Politics | High Priest | 2 | Move the robber; take 1 random card from each player on that tile |
| Politics | Law Code | 1 | 1 VP, revealed immediately |
| Politics | Turncoat | 2 | An opponent removes a knight of their choice; you may place one of the same level free |
| Politics | Envoy | 2 | Remove any open-ended road; if it was yours you may rebuild it free |
| Politics | Plot | 2 | Displace an opponent knight standing on an intersection your roads reach |
| Politics | Unrest | 2 | Every player with VP ≥ yours discards half their cards |
| Politics | Informant | 3 | Look at an opponent's progress cards and take one |
| Politics | War Horn | 2 | Activate all your knights for free |
| Politics | Dynastic Marriage | 2 | Each player with more VP gives you 2 cards of their choice |

### Scoring

Settlement 1, city 2, metropolis 4, longest road (5+ connected roads) 2, Shield of
Pangea 1 each, Writing/Law Code 1 each, caravan 1. **13 VP on your own turn wins.**

## Civilizations and art

The civ sets the player color pair (main + accent) and building silhouettes. All 8 colors
are distinct, so any 4 drafted are distinguishable; silhouettes and two-tone trim back
up color for colorblind players.

| Civ | Main | Accent | Building motif |
|---|---|---|---|
| Rome | crimson `#B3202A` | gold `#E3B23C` | columned temple, pediment |
| Egypt | sun gold `#D99A1E` | Egyptian blue `#1F5FAD` | obelisk / pylon gate |
| Han China | jade `#2E8B57` | cinnabar `#C4361C` | tiered curved roof |
| Maya | Maya blue `#3AA0B5` | jade `#6FB35A` | stepped pyramid with shrine |
| Mali | terracotta `#C8612C` | gold `#E8C15A` | mud tower with protruding beams |
| Norse | ivory `#EDE6D6` | iron `#4E555E` | longhouse with crossed gable |
| Japan | indigo `#26326B` | vermilion `#E0482F` | pagoda with upturned eaves |
| Persia | royal purple `#6B2D8C` | gold `#D9B44A` | columned audience hall |

- Every owned piece (settlement, city, metropolis, wall, knight levels 1–3, road)
  is drawn in the owner's civ style, main color body with accent trim and a dark outline.
- Tiles are shared and neutral: muted earthy fills with simple glyphs so pieces pop.
- Barbarians: a neutral dark Viking-style longship (dark hull, charcoal/oxblood sail),
  deliberately unlike the Norse player's ivory pieces.

## Screens

- **Home:** create a game (gets a 4-letter code) or join by code; enter a name.
- **Lobby:** seats, civ draft (unique per player), host starts at 3–4 players.
- **Game:** board center; barbarian track across the top; player panels on the right
  (VP, card counts, knights, improvements); own hand, progress cards and improvement
  tracks along the bottom; action bar; waiting-on panel; game log; undo.

## Left to the builder

- Exact SVG drawings, layout dimensions, log wording.
- Calls made where the source rules were silent or editions differ (marked "call" in
  code comments): unlimited supply; starting resources from the city only (no
  commodities); Unrest hits VP ≥ yours (newer edition) rather than > yours; High Priest
  and knight robber-chasing unavailable before the first raid; Turncoat's replacement
  keeps the removed knight's active status; Harbor Levy skips opponents with no
  commodities.

## Backlog

1. **Territory tile art.** Tiles start neutral and take on the civ art of whoever
   dominates them, so you can see each civ spreading. Same view for everyone. Undecided:
   whole tile to the player with the most building weight on its corners (settlement 1,
   city 2, metropolis 3; ties stay neutral) vs. split wedges per corner. ~40 tile
   variants.
2. **Randomized barbarian themes** per game (pirates, Huns, Vikings, conquistadors, …),
   possibly skipping a theme that matches a civ in play.
3. Optional civ perks (small asymmetric abilities), only after balance testing.
