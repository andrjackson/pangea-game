import { useEffect, useMemo, useState } from 'react';
import {
  BARBARIAN_STEPS,
  CARD_NAMES,
  CARD_TYPES,
  CIVS,
  COMMODITIES,
  COSTS,
  KNIGHT_NAMES,
  PROGRESS,
  RESOURCES,
  TRACKS,
  TRACK_INFO,
  bankRate,
  describeCards,
  handSize,
  type Action,
  type CardType,
  type Decision,
  type Hand,
  type PlayerView,
  type ProgressId,
  type Track,
} from '@pangea/engine';
import { CivEmblem } from '../art/civ';
import { CARD_COLOR, CardIcon, Longship } from '../art/tiles';
import { BOARD_CARDS, type Mode } from './interaction';

type Send = (a: Action) => Promise<boolean>;

const nameOf = (view: PlayerView, p: number) => view.players[p].name;

// ---------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------

export function CardChip({ type, count, onClick, dim }: { type: CardType; count?: number; onClick?: () => void; dim?: boolean }) {
  return (
    <button
      className={`card-chip ${onClick ? 'clickable' : ''} ${dim ? 'dim' : ''}`}
      style={{ ['--chip' as string]: CARD_COLOR[type] }}
      onClick={onClick}
      disabled={!onClick}
      title={CARD_NAMES[type]}
    >
      <CardIcon type={type} size={22} />
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );
}

function CostLine({ cost }: { cost: Partial<Hand> }) {
  return (
    <span className="cost">
      {CARD_TYPES.filter((t) => cost[t]).map((t) => (
        <span key={t} className="cost-item">
          {cost[t]! > 1 && <b>{cost[t]}</b>}
          <CardIcon type={t} size={14} />
        </span>
      ))}
    </span>
  );
}

/** Pick an exact number of cards from a hand. */
export function CardPicker({ hand, count, onConfirm, label }: { hand: Hand; count: number; onConfirm: (cards: Partial<Hand>) => void; label: string }) {
  const [sel, setSel] = useState<Partial<Hand>>({});
  const total = handSize(sel);
  return (
    <div className="picker">
      <div className="picker-row">
        {CARD_TYPES.filter((t) => hand[t] > 0).map((t) => {
          const n = sel[t] ?? 0;
          return (
            <div key={t} className="picker-cell">
              <CardChip type={t} count={hand[t] - n} onClick={n < hand[t] && total < count ? () => setSel({ ...sel, [t]: n + 1 }) : undefined} />
              {n > 0 && (
                <button className="picked" onClick={() => setSel({ ...sel, [t]: n - 1 })} title="Put back">
                  −{n}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn primary" disabled={total !== count} onClick={() => onConfirm(sel)}>
        {label} ({total}/{count})
      </button>
    </div>
  );
}

function Stepper({ types, value, onChange, max }: { types: CardType[]; value: Partial<Hand>; onChange: (v: Partial<Hand>) => void; max?: Hand | null }) {
  return (
    <div className="stepper">
      {types.map((t) => {
        const n = value[t] ?? 0;
        const limit = max ? max[t] : 9;
        return (
          <div key={t} className="step-cell">
            <CardChip type={t} onClick={n < limit ? () => onChange({ ...value, [t]: n + 1 }) : undefined} dim={limit === 0} />
            <span className="step-n">{n || ''}</span>
            {n > 0 && (
              <button className="picked" onClick={() => onChange({ ...value, [t]: n - 1 })}>
                −
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// top bar
// ---------------------------------------------------------------------------

export function TopBar({ view }: { view: PlayerView }) {
  const strength = Object.values(view.buildings).filter((b) => b.kind === 'city').length;
  const defense = Object.values(view.knights).reduce((n, k) => n + (k.active ? k.level : 0), 0);
  const steps = Array.from({ length: BARBARIAN_STEPS + 1 }, (_, i) => i);
  return (
    <header className="topbar">
      <div className="brand">Pangea</div>
      <div className="raid" title="The barbarian ship advances on every ship roll of the event die. When it lands, active knights must match the number of cities.">
        <div className="raid-track">
          {steps.map((i) => (
            <div key={i} className={`raid-step ${i === BARBARIAN_STEPS ? 'shore' : ''} ${i === view.barbarian.position ? 'here' : ''}`}>
              {i === view.barbarian.position && <Longship width={54} />}
              {i === BARBARIAN_STEPS && <span className="watchfire" aria-hidden>▲</span>}
            </div>
          ))}
        </div>
        <div className="raid-stats">
          <span>
            Raiders <b>{strength}</b>
          </span>
          <span className={defense >= strength ? 'good' : 'bad'}>
            Defenders <b>{defense}</b>
          </span>
          <span className="muted">raids so far: {view.barbarian.attacks}</span>
        </div>
      </div>
      <Dice view={view} />
    </header>
  );
}

function Dice({ view }: { view: PlayerView }) {
  if (!view.dice) return <div className="dice muted">No roll yet</div>;
  const { red, yellow, event } = view.dice;
  return (
    <div className="dice" title="Last roll">
      <span className="die red">{red}</span>
      <span className="die yellow">{yellow}</span>
      <span className="die event" style={{ background: event === 'ship' ? '#2b2522' : TRACK_INFO[event].color }}>
        {event === 'ship' ? '⛵' : TRACK_INFO[event].name[0]}
      </span>
      <span className="dice-sum">{red + yellow}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// sidebar
// ---------------------------------------------------------------------------

export function TurnBanner({ view, hint }: { view: PlayerView; hint: string | null }) {
  let text: string;
  if (view.phase === 'ended') text = `${nameOf(view, view.winner!)} wins with ${view.players[view.winner!].vp} victory points!`;
  else if (view.phase === 'setup') text = 'Setup: place your starting pieces in turn.';
  else if (view.current === view.me) text = view.rolled ? 'Your turn.' : 'Your turn: roll the dice.';
  else text = `${nameOf(view, view.current)}'s turn.`;
  return (
    <div className={`turn-banner ${view.current === view.me || view.phase === 'ended' ? 'mine' : ''}`}>
      <div>{text}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function describeDecision(view: PlayerView, d: Decision): string {
  switch (d.kind) {
    case 'discard':
      return `discard ${d.count} cards${d.reason === 'unrest' ? ' (Unrest)' : ''}`;
    case 'moveRobber':
      return 'move the robber';
    case 'steal':
      return 'choose who to rob';
    case 'pickResource':
      return 'take a resource from the granaries';
    case 'loseCity':
      return 'choose a city to lose';
    case 'pickTrack':
      return 'choose a progress deck';
    case 'discardProgress':
      return 'discard down to 4 progress cards';
    case 'relocateKnight':
      return 'relocate a displaced knight';
    case 'giveCards':
      return `give ${d.count} cards to ${nameOf(view, d.to)}`;
    case 'harborLevyOffer':
      return `offer a resource to ${nameOf(view, d.target)}`;
    case 'harborLevyReturn':
      return `return a commodity to ${nameOf(view, d.to)}`;
    case 'tributeTake':
      return `take ${d.count} cards from ${nameOf(view, d.target)}`;
    case 'informantTake':
      return `take a progress card from ${nameOf(view, d.target)}`;
    case 'turncoatRemove':
      return 'give up a knight';
    case 'turncoatPlace':
      return 'place the turncoat knight';
    case 'envoyRebuild':
      return 'rebuild a road';
  }
}

export function WaitingOn({ view }: { view: PlayerView }) {
  if (!view.waitingOn.length) return null;
  return (
    <section className="panel waiting">
      <h3>Waiting on</h3>
      <ul>
        {view.waitingOn.map((d, i) => (
          <li key={i} className={d.player === view.me ? 'me' : ''}>
            <span className="dot" style={{ background: CIVS[view.players[d.player].civ].main }} />
            <b>{d.player === view.me ? 'You' : nameOf(view, d.player)}</b>: {describeDecision(view, d)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DecisionPanel({ view, decision, send }: { view: PlayerView; decision: Decision; send: Send }) {
  const me = view.players[view.me];
  const hand = me.hand!;
  const body = (() => {
    switch (decision.kind) {
      case 'discard':
        return <CardPicker key={decision.group} hand={hand} count={decision.count} label="Discard" onConfirm={(cards) => send({ type: 'discard', cards })} />;
      case 'giveCards':
        return <CardPicker key={decision.group} hand={hand} count={decision.count} label={`Give to ${nameOf(view, decision.to)}`} onConfirm={(cards) => send({ type: 'giveCards', cards })} />;
      case 'tributeTake':
        return view.reveal.hand ? (
          <CardPicker key={decision.group} hand={view.reveal.hand.hand} count={decision.count} label="Take" onConfirm={(cards) => send({ type: 'tributeTake', cards })} />
        ) : null;
      case 'steal':
        return (
          <div className="btn-row">
            {decision.candidates.map((p) => (
              <button key={p} className="btn" onClick={() => send({ type: 'steal', victim: p })}>
                Rob {nameOf(view, p)} ({view.players[p].handCount} cards)
              </button>
            ))}
          </div>
        );
      case 'pickResource':
        return (
          <div className="btn-row">
            {RESOURCES.map((r) => (
              <CardChip key={r} type={r} onClick={() => send({ type: 'pickResource', resource: r })} />
            ))}
          </div>
        );
      case 'pickTrack':
        return (
          <div className="btn-row">
            {TRACKS.map((t) => (
              <button key={t} className="btn" style={{ borderColor: TRACK_INFO[t].color }} disabled={view.decks[t] === 0} onClick={() => send({ type: 'pickTrack', track: t })}>
                {TRACK_INFO[t].name} ({view.decks[t]} left)
              </button>
            ))}
          </div>
        );
      case 'discardProgress':
        return (
          <div className="btn-row">
            {me.progress!.map((c, i) => (
              <button key={i} className="btn" onClick={() => send({ type: 'discardProgress', card: c })}>
                {PROGRESS[c].name}
              </button>
            ))}
          </div>
        );
      case 'harborLevyOffer': {
        const have = RESOURCES.filter((r) => hand[r] > 0);
        return (
          <div className="btn-row">
            {have.map((r) => (
              <CardChip key={r} type={r} count={hand[r]} onClick={() => send({ type: 'harborLevyOffer', resource: r })} />
            ))}
            {have.length === 0 && (
              <button className="btn" onClick={() => send({ type: 'harborLevyOffer', resource: null })}>
                I have no resources
              </button>
            )}
          </div>
        );
      }
      case 'harborLevyReturn':
        return (
          <div className="btn-row">
            {COMMODITIES.filter((c) => hand[c] > 0).map((c) => (
              <CardChip key={c} type={c} count={hand[c]} onClick={() => send({ type: 'harborLevyReturn', commodity: c })} />
            ))}
          </div>
        );
      case 'informantTake':
        return (
          <div className="btn-row">
            {view.reveal.progress?.cards.map((c, i) => (
              <button key={i} className="btn" onClick={() => send({ type: 'informantTake', card: c })} title={PROGRESS[c].text}>
                {PROGRESS[c].name}
              </button>
            ))}
          </div>
        );
      case 'turncoatPlace':
        return (
          <button className="btn ghost" onClick={() => send({ type: 'turncoatPlace', vertex: null })}>
            Skip
          </button>
        );
      case 'envoyRebuild':
        return (
          <button className="btn ghost" onClick={() => send({ type: 'envoyRebuild', edge: null })}>
            Skip
          </button>
        );
      default:
        return <div className="muted">Click on the board.</div>;
    }
  })();
  return (
    <section className="panel decision">
      <h3>You must {describeDecision(view, decision)}</h3>
      {body}
    </section>
  );
}

export function PlayerList({ view }: { view: PlayerView }) {
  return (
    <section className="panel players">
      {view.players.map((p) => {
        const c = CIVS[p.civ];
        const knights = Object.values(view.knights).filter((k) => k.owner === p.id);
        const strength = knights.reduce((n, k) => n + (k.active ? k.level : 0), 0);
        return (
          <div key={p.id} className={`player-row ${view.current === p.id && view.phase === 'play' ? 'current' : ''}`} style={{ ['--civ-main' as string]: c.main }}>
            <CivEmblem civ={p.civ} size={38} />
            <div className="player-main">
              <div className="player-name">
                {p.name}
                {p.id === view.me && <span className="tag">you</span>}
              </div>
              <div className="player-stats">
                <span title="Resource and commodity cards">Cards {p.handCount}</span>
                <span title="Progress cards">Progress {p.progressCount}</span>
                <span title="Active knight strength / number of knights">Knights {strength}/{knights.length}</span>
                <span title="Longest continuous road">Road {p.roadLength}</span>
              </div>
              <div className="player-badges">
                {TRACKS.map((t) => (
                  <span key={t} className="mini-track" style={{ ['--track' as string]: TRACK_INFO[t].color }} title={`${TRACK_INFO[t].name} level ${p.improvements[t]}`}>
                    {p.improvements[t]}
                  </span>
                ))}
                {view.longestRoad === p.id && <span className="badge">Longest road</span>}
                {view.caravan?.owner === p.id && <span className="badge">Caravan</span>}
                {p.shields > 0 && <span className="badge">Shield ×{p.shields}</span>}
                {p.vpCards.map((c, i) => (
                  <span key={i} className="badge">
                    {PROGRESS[c].name}
                  </span>
                ))}
              </div>
            </div>
            <div className="vp" title="Victory points (13 wins)">
              {p.vp}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function TradePanel({ view, send }: { view: PlayerView; send: Send }) {
  const me = view.players[view.me];
  const hand = me.hand!;
  const isCurrent = view.current === view.me;
  const [give, setGive] = useState<Partial<Hand>>({});
  const [get, setGet] = useState<Partial<Hand>>({});
  const [bankGive, setBankGive] = useState<CardType | null>(null);
  const canTrade = view.phase === 'play' && view.rolled && view.queue.length === 0;
  useEffect(() => {
    setGive({});
    setGet({});
    setBankGive(null);
  }, [view.turn]);
  if (!canTrade) return null;

  const offers = view.trades;
  return (
    <section className="panel trade">
      <h3>Trade</h3>
      {offers.length > 0 && (
        <ul className="offers">
          {offers.map((o) => {
            const mine = o.from === view.me;
            const toMe = o.to === view.me || (o.to === null && !mine);
            return (
              <li key={o.id}>
                <div>
                  <b>{mine ? 'You' : nameOf(view, o.from)}</b> give {describeCards(o.give)} for {describeCards(o.get)}
                  {o.to !== null && !mine && o.to !== view.me ? ` (to ${nameOf(view, o.to)})` : ''}
                </div>
                <div className="btn-row">
                  {mine && o.to === null &&
                    o.accepted.map((p) => (
                      <button key={p} className="btn tiny primary" onClick={() => send({ type: 'confirmTrade', offer: o.id, with: p })}>
                        Trade with {nameOf(view, p)}
                      </button>
                    ))}
                  {mine && o.to === null && o.accepted.length === 0 && <span className="muted">waiting for answers{o.declined.length ? ` (${o.declined.map((p) => nameOf(view, p)).join(', ')} declined)` : ''}</span>}
                  {mine && (
                    <button className="btn tiny ghost" onClick={() => send({ type: 'cancelTrade', offer: o.id })}>
                      Withdraw
                    </button>
                  )}
                  {toMe && (
                    <>
                      <button className="btn tiny primary" onClick={() => send({ type: 'respondTrade', offer: o.id, accept: true })} disabled={o.accepted.includes(view.me)}>
                        {o.accepted.includes(view.me) ? 'Accepted' : 'Accept'}
                      </button>
                      <button className="btn tiny ghost" onClick={() => send({ type: 'respondTrade', offer: o.id, accept: false })}>
                        Decline
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="trade-builder">
        <div className="muted small">{isCurrent ? 'Offer to everyone' : `Counter-offer to ${nameOf(view, view.current)}`}</div>
        <div className="trade-side">
          <span>You give</span>
          <Stepper types={CARD_TYPES.filter((t) => hand[t] > 0)} value={give} onChange={setGive} max={hand} />
        </div>
        <div className="trade-side">
          <span>You get</span>
          <Stepper types={CARD_TYPES} value={get} onChange={setGet} />
        </div>
        <button
          className="btn"
          disabled={!handSize(give) || !handSize(get)}
          onClick={async () => {
            if (await send({ type: 'offerTrade', give, get })) {
              setGive({});
              setGet({});
            }
          }}
        >
          Propose trade
        </button>
      </div>

      {isCurrent && (
        <div className="bank">
          <div className="muted small">Bank and harbors: pick what you give, then what you get</div>
          <div className="btn-row">
            {CARD_TYPES.map((t) => {
              const rate = bankRate(view, view.me, t, view.flags.monsoon);
              return (
                <div key={t} className={`bank-cell ${bankGive === t ? 'on' : ''}`}>
                  <CardChip type={t} onClick={hand[t] >= rate ? () => setBankGive(bankGive === t ? null : t) : undefined} dim={hand[t] < rate} />
                  <span className="rate">{rate}:1</span>
                </div>
              );
            })}
          </div>
          {bankGive && (
            <div className="btn-row">
              <span className="small">Get:</span>
              {CARD_TYPES.filter((t) => t !== bankGive).map((t) => (
                <CardChip key={t} type={t} onClick={() => send({ type: 'bankTrade', give: bankGive, get: t })} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function LogPanel({ view }: { view: PlayerView }) {
  const entries = useMemo(() => view.log.slice(-80).reverse(), [view.log]);
  return (
    <section className="panel log">
      <h3>Chronicle</h3>
      <ol>
        {entries.map((e, i) => (
          <li key={i} className={e.only ? 'private' : ''}>
            {e.player !== null && <span className="dot" style={{ background: CIVS[view.players[e.player].civ].main }} />}
            {e.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// bottom bar
// ---------------------------------------------------------------------------

export function HandBar({ view }: { view: PlayerView }) {
  const hand = view.players[view.me].hand!;
  const limit = 7 + 2 * Object.values(view.buildings).filter((b) => b.owner === view.me && b.wall).length;
  const size = handSize(hand);
  return (
    <div className="hand">
      <div className="hand-cards">
        {CARD_TYPES.map((t) => (
          <div key={t} className={`hand-card ${hand[t] ? '' : 'empty'}`} style={{ ['--chip' as string]: CARD_COLOR[t] }} title={CARD_NAMES[t]}>
            <CardIcon type={t} size={30} />
            <span className="hand-n">{hand[t]}</span>
            <span className="hand-label">{CARD_NAMES[t]}</span>
          </div>
        ))}
      </div>
      <div className={`hand-limit ${size > limit ? 'over' : ''}`} title="On a 7, holding more than this means discarding half">
        {size}/{limit}
      </div>
    </div>
  );
}

export function Improvements({ view, send, setMode }: { view: PlayerView; send: Send; setMode: (m: Mode | null) => void }) {
  const me = view.players[view.me];
  const myTurn = view.phase === 'play' && view.current === view.me && view.rolled && view.queue.length === 0;
  const improve = (t: Track) => {
    const level = me.improvements[t];
    const next = level + 1;
    const needsCity = next >= 4 && view.metropolis[t] !== view.me;
    const holder = view.metropolis[t];
    const takes = holder === null || (next === 5 && view.players[holder].improvements[t] < 5);
    const cands = Object.entries(view.buildings).filter(([, b]) => b.owner === view.me && b.kind === 'city' && !b.metropolis);
    if (needsCity && takes && cands.length > 1) setMode({ t: 'metropolis', track: t });
    else void send({ type: 'improve', track: t });
  };
  return (
    <div className="tracks">
      {TRACKS.map((t) => {
        const info = TRACK_INFO[t];
        const level = me.improvements[t];
        const cost = Math.max(0, level + 1 - (view.flags.scaffolding ? 1 : 0));
        const afford = me.hand![info.commodity] >= cost;
        return (
          <div key={t} className="track" style={{ ['--track' as string]: info.color }}>
            <div className="track-head">
              <b>{info.name}</b>
              <span className="muted small">
                {level >= 3 ? info.ability : `L3: ${info.ability}`}
                {view.metropolis[t] !== null && ` · Metropolis: ${nameOf(view, view.metropolis[t]!)}`}
              </span>
            </div>
            <div className="track-pips">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`pip ${i <= level ? 'on' : ''} ${i === 3 ? 'ability' : ''} ${i >= 4 ? 'metro' : ''}`} />
              ))}
              {level < 5 && (
                <button className="btn tiny" disabled={!myTurn || !afford} onClick={() => improve(t)} title={info.abilityText}>
                  +1 for {cost} <CardIcon type={info.commodity} size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressHand({ view, send, setMode }: { view: PlayerView; send: Send; setMode: (m: Mode | null) => void }) {
  const cards = view.players[view.me].progress!;
  const [open, setOpen] = useState<number | null>(null);
  if (!cards.length) return <div className="progress-hand muted small">No progress cards</div>;
  return (
    <div className="progress-hand">
      {cards.map((c, i) => (
        <button key={i} className={`progress-card ${open === i ? 'open' : ''}`} style={{ ['--track' as string]: TRACK_INFO[PROGRESS[c].track].color }} onClick={() => setOpen(open === i ? null : i)}>
          {PROGRESS[c].name}
        </button>
      ))}
      {open !== null && cards[open] && (
        <CardPlayer
          key={`${open}-${cards[open]}`}
          view={view}
          card={cards[open]}
          send={async (a) => {
            const ok = await send(a);
            if (ok) setOpen(null);
            return ok;
          }}
          setMode={(m) => {
            setMode(m);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function CardPlayer({ view, card, send, setMode, onClose }: { view: PlayerView; card: ProgressId; send: Send; setMode: (m: Mode | null) => void; onClose: () => void }) {
  const def = PROGRESS[card];
  const [red, setRed] = useState(3);
  const [yellow, setYellow] = useState(4);
  const myTurn = view.phase === 'play' && view.current === view.me && view.queue.length === 0;
  const timingOk = def.beforeRoll ? !view.rolled : view.rolled;
  const opponents = view.players.filter((p) => p.id !== view.me);
  const play = (params: object = {}) => send({ type: 'playProgress', card, params });

  let controls;
  if (!myTurn) controls = <div className="muted small">Play this on your turn.</div>;
  else if (!timingOk) controls = <div className="muted small">{def.beforeRoll ? 'Only before you roll.' : 'Roll first.'}</div>;
  else if (BOARD_CARDS.has(card))
    controls = (
      <button className="btn primary" onClick={() => setMode({ t: 'card', card, picks: [] })}>
        Choose on the board
      </button>
    );
  else
    switch (card) {
      case 'augury':
        controls = (
          <div className="btn-row">
            <label>
              Red <input type="number" min={1} max={6} value={red} onChange={(e) => setRed(Number(e.target.value))} />
            </label>
            <label>
              Yellow <input type="number" min={1} max={6} value={yellow} onChange={(e) => setYellow(Number(e.target.value))} />
            </label>
            <button className="btn primary" onClick={() => play({ red, yellow })}>
              Play
            </button>
          </div>
        );
        break;
      case 'monsoonWinds':
        controls = (
          <div className="btn-row">
            {CARD_TYPES.map((t) => (
              <CardChip key={t} type={t} onClick={() => play({ card: t })} />
            ))}
          </div>
        );
        break;
      case 'marketCorner':
        controls = (
          <div className="btn-row">
            {RESOURCES.map((t) => (
              <CardChip key={t} type={t} onClick={() => play({ resource: t })} />
            ))}
          </div>
        );
        break;
      case 'guildCharter':
        controls = (
          <div className="btn-row">
            {COMMODITIES.map((t) => (
              <CardChip key={t} type={t} onClick={() => play({ commodity: t })} />
            ))}
          </div>
        );
        break;
      case 'tribute':
      case 'turncoat':
      case 'informant':
        controls = (
          <div className="btn-row">
            {opponents.map((p) => (
              <button key={p.id} className="btn" onClick={() => play({ target: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
        );
        break;
      default:
        controls = (
          <button className="btn primary" onClick={() => play()}>
            Play {def.name}
          </button>
        );
    }

  return (
    <div className="card-player panel" style={{ ['--track' as string]: TRACK_INFO[def.track].color }}>
      <div className="card-player-head">
        <b>{def.name}</b>
        <span className="muted small">{TRACK_INFO[def.track].name}</span>
        <button className="btn tiny ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p>{def.text}</p>
      {controls}
    </div>
  );
}

export function ActionBar({ view, send, mode, setMode, armoryPicks }: { view: PlayerView; send: Send; mode: Mode | null; setMode: (m: Mode | null) => void; armoryPicks: number[] }) {
  const me = view.players[view.me];
  const hand = me.hand!;
  const myTurn = view.phase === 'play' && view.current === view.me && view.queue.length === 0;
  const can = (cost: Partial<Hand>) => CARD_TYPES.every((t) => hand[t] >= (cost[t] ?? 0));
  if (!myTurn) return <div className="actions" />;
  if (!view.rolled)
    return (
      <div className="actions">
        <button className="btn primary big" onClick={() => send({ type: 'roll' })}>
          Roll dice
        </button>
      </div>
    );
  const builds: { m: Mode['t']; label: string; cost: Partial<Hand>; free?: boolean }[] = [
    { m: 'road', label: 'Road', cost: COSTS.road, free: view.flags.freeRoads > 0 },
    { m: 'settlement', label: 'Settlement', cost: COSTS.settlement },
    { m: 'city', label: 'City', cost: COSTS.city },
    { m: 'wall', label: 'Wall', cost: COSTS.wall },
    { m: 'knight', label: 'Knight', cost: COSTS.knight },
    { m: 'activate', label: 'Activate', cost: COSTS.activate },
    { m: 'promote', label: 'Promote', cost: COSTS.promote },
  ];
  return (
    <div className="actions">
      <div className="build-grid">
        {builds.map((b) => (
          <button key={b.m} className={`btn build ${mode?.t === b.m ? 'on' : ''}`} disabled={!b.free && !can(b.cost)} onClick={() => setMode(mode?.t === b.m ? null : ({ t: b.m } as Mode))}>
            <span>{b.free ? `${b.label} (free)` : b.label}</span>
            <CostLine cost={b.free ? {} : b.cost} />
          </button>
        ))}
        <button className={`btn build ${mode?.t === 'move' ? 'on' : ''}`} onClick={() => setMode(mode?.t === 'move' ? null : { t: 'move' })}>
          <span>Move knight</span>
          <span className="cost muted">or displace</span>
        </button>
        <button className={`btn build ${mode?.t === 'chase' ? 'on' : ''}`} disabled={!view.robberActive} onClick={() => setMode(mode?.t === 'chase' ? null : { t: 'chase' })}>
          <span>Chase robber</span>
          <span className="cost muted">active knight</span>
        </button>
      </div>
      <div className="turn-buttons">
        {mode?.t === 'card' && mode.card === 'armory' && (
          <button className="btn primary" disabled={!armoryPicks.length} onClick={() => send({ type: 'playProgress', card: 'armory', params: { knights: armoryPicks } })}>
            Promote {armoryPicks.length}
          </button>
        )}
        {mode && (
          <button className="btn ghost" onClick={() => setMode(null)}>
            Cancel
          </button>
        )}
        <button className="btn ghost" disabled={!view.canUndo} onClick={() => send({ type: 'undo' })} title="Take back your last build or bank trade">
          Undo
        </button>
        <button className="btn primary" onClick={() => send({ type: 'endTurn' })}>
          End turn
        </button>
      </div>
    </div>
  );
}

export { KNIGHT_NAMES };
