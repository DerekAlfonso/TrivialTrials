// Keeps phones and TVs awake during a game, and wraps the Fullscreen API (incl. Safari's prefix).

type WakeLockSentinelLike = { release(): Promise<void> };

export function keepAwake(): () => void {
  let lock: WakeLockSentinelLike | null = null;
  let active = true;
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };
  const request = async () => {
    if (!active || !nav.wakeLock || document.visibilityState !== 'visible') return;
    try {
      lock = await nav.wakeLock.request('screen');
    } catch {
      /* denied or unsupported */
    }
  };
  const onVisible = () => void request();
  document.addEventListener('visibilitychange', onVisible);
  void request();
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => undefined);
  };
}

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export function fullscreenSupported(): boolean {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen ?? el.webkitRequestFullscreen);
}

export async function toggleFullscreen() {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  try {
    if (isFullscreen()) await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
    else await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
  } catch {
    /* user agent refused */
  }
}
