# Pangea backlog

The owner reorders this list. Scheduled improvement runs take the **highest item marked
`[ready]`** that doesn't already have an open pull request.

Status tags:
- `[ready]`: clear enough to build without asking.
- `[needs decision]`: needs the owner's input first. Runs skip these, but may add a short
  proposal with options under the item, in a PR.
- `[in review: <PR link>]`: a PR is open.
- `[done]`: merged.

## Rules for automated runs

1. Bugs first: open GitHub issues (especially ones with a problem report from a game
   night) beat everything below. Reproduce the bug from the report's saved `game` state
   in an engine test before fixing it.
2. One item per run, on a branch named `auto/<short-name>`, opened as a PR against
   `main`. Never push to `main`, never merge.
3. Keep `npm run typecheck`, `npm test` and `npm run e2e` green. Add engine tests for
   rule changes and an `e2e/run.ts` scenario for new screens.
4. For anything visual, include a screenshot in the PR (`e2e/preview.ts` renders a
   mid-game board).
5. Don't change the game's rules, name or art direction unless the item says to. Card
   names and rule text stay Pangea's own (see the design spec).
6. Update this file in the same PR: mark the item `[in review: <PR link>]`.

## Up next

1. `[ready]` **Rejoin from another device.** Seats are tied to the browser that joined,
   so a friend who switches laptops or clears their browser can't get back in. Let the
   host generate a one-time "retake seat" link for any seat from the player list, which
   moves that seat to whoever opens it. Test it in `e2e/run.ts`.
2. `[ready]` **Raid announcement.** When raiders land, show everyone a short banner on
   the board: raider strength vs. defense, who earned the Shield or which cities fell.
   Right now it's only in the Chronicle, which is easy to miss.
3. `[ready]` **Steal and discard feedback.** A toast to the victim ("Ana stole 1 Wool
   from you"), and a brief highlight on the robber's new tile for everyone.
4. `[ready]` **Subtle sound effects** for dice, building, and raids, using the existing
   Sound on/off toggle (WebAudio, no audio files).
5. `[ready]` **More civ tile art.** Territory tiles use civ-specific trees, crops and
   animals, but hills, mountains and desert still use the shared drawings. Give each civ
   its own take (e.g. Roman terracotta kilns, Japanese Fuji-style peaks, Persian
   qanats in the desert), keeping the art's current flat style and palette.
6. `[needs decision]` **Easier hosting.** A permanent link (named Cloudflare tunnel,
   needs a domain) or cloud hosting so the host PC can be off. Only if the changing
   tunnel link is a real annoyance.
7. `[needs decision]` **Civ perks.** Small asymmetric abilities per civilization. Only
   after a few real games, and balance-tested.

## Not doing

- Showing which players can afford a trade offer: it would reveal hidden hands.

## Done

- `[done]` What just happened: floating "+N card" labels on production, glow on newly
  placed pieces, Chronicle grouped by turn.
- `[done]` Better trading: everyone's accept/decline status, Counter button,
  "Again" button for the last offer, clear "ready to confirm" state.
- `[done]` End-of-game screen with VP breakdown, stats and "Play again with the same table".
- `[done]` Random raider themes (Vikings, pirates, conquistadors, Hunnic horde, Sea
  Peoples), never Vikings when a Norse player is at the table.
- `[done]` Hover details on tiles, pieces and harbors.
- `[done]` Lobby options: victory target 10–15, and the balanced number layout.
- `[done]` Territory art: tiles take on the civ style of whoever spreads onto them;
  shared tiles are split between civs.
- `[done]` "Report a problem" button that saves the game state and a note on the host.
- `[done]` Turn alerts (tab title and chime) and the browser test suite.
