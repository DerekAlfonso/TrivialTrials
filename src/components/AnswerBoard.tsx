import { motion } from 'framer-motion';
import type { BoardSlot, SurveyAnswer, TeamId } from '../shared/types';

interface Props {
  board: BoardSlot[];
  /** Host only: the answer key, shown faintly on hidden tiles. */
  answers?: SurveyAnswer[];
  /** Makes hidden tiles tappable (host). */
  onPick?: (index: number) => void;
  pickable?: (index: number) => boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Always render 8 slots like the classic board, blanking unused ones. */
  fixedSlots?: boolean;
}

const SIZES = {
  sm: { h: 'h-10', text: 'text-base', num: 'h-7 w-7 text-base', pts: 'w-10 text-lg', gap: 'gap-1.5' },
  md: { h: 'h-14', text: 'text-xl', num: 'h-9 w-9 text-xl', pts: 'w-14 text-2xl', gap: 'gap-2' },
  lg: { h: 'h-16 sm:h-20', text: 'text-2xl sm:text-3xl', num: 'h-11 w-11 text-2xl sm:h-14 sm:w-14 sm:text-3xl', pts: 'w-16 sm:w-20 text-3xl sm:text-4xl', gap: 'gap-2.5' },
  xl: { h: 'h-[9vh]', text: 'text-[4.2vh]', num: 'h-[6.5vh] w-[6.5vh] text-[4.2vh]', pts: 'w-[11vh] text-[5vh]', gap: 'gap-[1.4vh]' },
};

export function AnswerBoard({ board, answers, onPick, pickable, size = 'md', fixedSlots = true }: Props) {
  const s = SIZES[size];
  const slots = fixedSlots ? Math.max(8, board.length) : board.length;
  const rows = Math.ceil(slots / 2);
  // Fill column-wise like the TV board: 1-4 on the left, 5-8 on the right.
  const order = Array.from({ length: slots }, (_, i) => (i % 2 === 0 ? i / 2 : rows + (i - 1) / 2));
  return (
    <div className="board-frame">
      <div className={`board-inner grid grid-cols-2 ${s.gap}`}>
        {order.map((idx) => (
          <Tile
            key={idx}
            index={idx}
            slot={board[idx]}
            answer={answers?.[idx]}
            onPick={onPick && board[idx] && (!pickable || pickable(idx)) ? () => onPick(idx) : undefined}
            s={s}
          />
        ))}
      </div>
    </div>
  );
}

function Tile({
  index,
  slot,
  answer,
  onPick,
  s,
}: {
  index: number;
  slot?: BoardSlot;
  answer?: SurveyAnswer;
  onPick?: () => void;
  s: (typeof SIZES)[keyof typeof SIZES];
}) {
  const revealed = !!slot?.revealed;
  const teamColor = (t: TeamId | null) =>
    t === 'A' ? 'var(--color-team-a)' : t === 'B' ? 'var(--color-team-b)' : 'rgba(255,255,255,0.25)';
  const Wrapper = onPick ? 'button' : 'div';
  return (
    <Wrapper
      className={`tile relative block w-full ${s.h} ${onPick ? 'rounded-lg ring-gold/0 transition hover:ring-4 hover:ring-gold/60 focus-visible:ring-4 focus-visible:ring-gold' : ''}`}
      onClick={onPick}
      type={onPick ? 'button' : undefined}
      aria-label={slot ? (revealed ? `${slot.text}, ${slot.points}` : `Answer ${index + 1}${answer ? `: ${answer.text}` : ''}`) : undefined}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateX: revealed ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 16 }}
      >
        <div className={`tile-face tile-front ${slot ? '' : 'empty'} ${answer ? '!justify-start gap-2 px-1.5' : ''}`}>
          {slot && (
            <>
              <span className={`tile-num shrink-0 ${s.num}`}>{index + 1}</span>
              {answer && (
                <>
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white/70">{answer.text}</span>
                  <span className="board-font pr-1 text-lg text-gold-light/80">{answer.count}</span>
                </>
              )}
            </>
          )}
        </div>
        <div className="tile-face tile-back">
          <span
            className={`board-font min-w-0 flex-1 truncate px-3 text-left uppercase text-white drop-shadow ${s.text}`}
            style={{ textShadow: '0 2px 0 rgba(0,0,0,.45)' }}
          >
            {slot?.text}
          </span>
          <span className={`tile-points ${s.pts}`} style={{ boxShadow: `inset 0 -4px 0 ${teamColor(slot?.by ?? null)}` }}>
            {slot?.points}
          </span>
        </div>
      </motion.div>
    </Wrapper>
  );
}
