import confetti from 'canvas-confetti';
import { useEffect, useRef, useState } from 'react';
import { play, vibrate, type SoundName } from '../lib/sound';
import type { GameEvent, GameState, Role, TeamId } from '../shared/types';

export function celebrate(colors = ['#f7c843', '#ffe58a', '#ff5a36', '#2fa8ff', '#ffffff']) {
  const end = performance.now() + 1600;
  const frame = () => {
    confetti({ particleCount: 7, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 7, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
    if (performance.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

const SOUNDS: Partial<Record<GameEvent['type'], SoundName>> = {
  joined: 'join',
  buzzersOpen: 'open',
  buzz: 'buzz',
  reveal: 'reveal',
  strike: 'strike',
  faceoffWrong: 'strike',
  stealFail: 'strike',
  steal: 'fanfare',
  award: 'ding',
  gameOver: 'fanfare',
  fmDuplicate: 'buzz',
  fmWin: 'fanfare',
  fmLose: 'sad',
};

/**
 * Plays sounds, haptics and confetti for game events and returns the latest "flash" event
 * (strikes etc.) for overlays. Room-wide sounds come from the host and board devices;
 * player phones only make personal sounds so a room full of phones isn't a cacophony.
 */
export function useGameEffects(state: GameState | null, role: Role, myId?: string) {
  const lastSeq = useRef<number | null>(null);
  const [flash, setFlash] = useState<GameEvent | null>(null);

  useEffect(() => {
    if (!state) return;
    const ev = state.event;
    if (lastSeq.current === null) {
      lastSeq.current = ev.seq; // don't replay the event we joined on
      return;
    }
    if (ev.seq === lastSeq.current) return;
    lastSeq.current = ev.seq;

    if (['strike', 'faceoffWrong', 'stealFail', 'fmDuplicate'].includes(ev.type)) setFlash(ev);

    const myTeam: TeamId | null = state.players.find((p) => p.id === myId)?.team ?? null;
    const roomSpeaker = role === 'host' || role === 'board';

    if (ev.type === 'fmReveal') {
      if (roomSpeaker) play(ev.data?.part === 'text' ? 'reveal' : (ev.data?.points as number) > 0 ? 'ding' : 'strike');
      return;
    }
    if (ev.type === 'joined' && role !== 'host' && role !== 'board') return;

    const sound = SOUNDS[ev.type];
    if (roomSpeaker && sound) play(sound);

    // Personal cues on player phones
    if (role === 'player') {
      if (ev.type === 'strike' && state.round?.control === myTeam) vibrate([80, 60, 80]);
      if (ev.type === 'fmDuplicate' && state.fastMoney?.players[1] === myId) {
        play('buzz');
        vibrate([150, 80, 150]);
      }
    }

    const winner = ev.type === 'gameOver' ? (ev.data?.team as TeamId) : null;
    if (winner && (roomSpeaker || myTeam === winner)) celebrate();
    if (ev.type === 'steal' && (roomSpeaker || myTeam === ev.data?.team)) celebrate();
    if (ev.type === 'fmWin' && (roomSpeaker || myTeam === state.winner)) celebrate();
  }, [state, role, myId]);

  return flash;
}
