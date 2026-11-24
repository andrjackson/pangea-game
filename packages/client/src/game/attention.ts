import { useEffect, useRef, useState } from 'react';
import { setupSeat, type PlayerView } from '@pangea/engine';
import { describeDecision } from './Panels';

export interface Attention {
  /** Changes whenever there is a new reason to alert this player. */
  key: string;
  text: string;
}

/** What, if anything, the game is waiting on this player for. */
export function attentionFor(view: PlayerView): Attention | null {
  const me = view.me;
  if (view.phase === 'ended') {
    const w = view.players[view.winner!];
    return { key: 'ended', text: w.id === me ? 'You won!' : `${w.name} won` };
  }
  const d = view.waitingOn.find((x) => x.player === me);
  if (d) return { key: `d-${d.group}-${d.kind}`, text: `You must ${describeDecision(view, d)}` };
  if (view.phase === 'setup') {
    if (setupSeat(view) === me) return { key: `setup-${view.setup.index}`, text: 'Place your pieces' };
    return null;
  }
  const offers = view.trades.filter(
    (o) => o.from !== me && (o.to === me || (o.to === null && !o.accepted.includes(me) && !o.declined.includes(me))),
  );
  if (offers.length) return { key: `trade-${offers.map((o) => o.id).join(',')}`, text: 'Trade offer for you' };
  if (view.current === me && view.queue.length === 0) return { key: `turn-${view.turn}`, text: view.rolled ? 'Your turn' : 'Your turn: roll' };
  return null;
}

const MUTE_KEY = 'pangea:muted';
let audio: AudioContext | null = null;

function chime(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t0 = audio.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.13;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    /* audio unavailable: the title still changes */
  }
}

// Browsers only allow sound after the page has been interacted with; unlock on first click.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    () => {
      try {
        audio ??= new AudioContext();
        void audio.resume();
      } catch {
        /* ignore */
      }
    },
    { once: true },
  );
}

export function useMuted(): [boolean, () => void] {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !m;
    });
  return [muted, toggle];
}

/** Updates the tab title (blinking while the tab is hidden) and chimes when a new alert appears. */
export function useAttention(view: PlayerView, muted: boolean): Attention | null {
  const attention = attentionFor(view);
  const prevKey = useRef<string | null>(null);
  const key = attention?.key ?? null;
  const text = attention?.text ?? null;

  useEffect(() => {
    if (key && key !== prevKey.current && !muted) chime();
    prevKey.current = key;
  }, [key, muted]);

  useEffect(() => {
    const base = 'Pangea';
    if (!text) {
      document.title = base;
      return;
    }
    const alertTitle = `● ${text} · ${base}`;
    document.title = alertTitle;
    let on = true;
    const timer = setInterval(() => {
      if (!document.hidden) {
        document.title = alertTitle;
        return;
      }
      on = !on;
      document.title = on ? alertTitle : base;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = base;
    };
  }, [text]);

  return attention;
}
