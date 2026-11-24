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

1. `[ready]` **Show what just happened.** When dice produce, briefly float "+1 Ore"
   style labels from the producing tiles toward the players who got them. Highlight
   the most recently placed piece for a few seconds. Group the Chronicle log by turn,
   with the roller's name as a header.
2. `[ready]` **Better trading.**
   - Let players edit a counter-offer in place.
   - Show next to each offer which players could afford it.
   - Add a "repeat last trade" button.
   - Make it clear when an offer is waiting on the current player's confirmation.
3. `[ready]` **End-of-game screen.** Final scores with a VP breakdown, plus per-player
   stats: resources produced, cards stolen, raids defended, progress cards played.
   Add a "Play again with the same table" button that keeps names and civs.
4. `[ready]` **Random barbarian themes.** Each game picks a raider theme (Vikings,
   pirates, Huns, conquistadors, Mongols…) with its own ship or horde art on the
   barbarian track. Skip a theme that matches a civ in play (e.g. no Vikings when
   someone is Norse). Purely visual.
5. `[ready]` **Hover details.** Tooltips on pieces (owner, knight level and whether it
   can act this turn), tiles (number, what it produces, who's there), and harbors.
6. `[ready]` **Lobby options.** Victory point target (10–15, default 13), plus the
   rulebook's alternative number-token placement (random tokens with no red numbers
   next to each other). The host picks; everyone sees the choice.
7. `[needs decision]` **Easier hosting.** A permanent link (named Cloudflare tunnel,
   needs a domain) or cloud hosting so the host PC can be off. Only if the changing
   tunnel link is a real annoyance.
8. `[needs decision]` **Civ perks.** Small asymmetric abilities per civilization. Only
   after a few real games, and balance-tested.

## Done

- `[done]` Territory art: tiles take on the civ style of whoever spreads onto them;
  shared tiles are split between civs.
- `[done]` "Report a problem" button that saves the game state and a note on the host.
- `[done]` Turn alerts (tab title and chime) and the browser test suite.
