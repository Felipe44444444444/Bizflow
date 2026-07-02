// Returns true if the YouTube player supports variable playback rate.
// iOS Safari blocks setPlaybackRate via IFrame API — detect early and fall back gracefully.
export function isIOSSafari() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    /WebKit/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent)
  );
}

export function testPlaybackRateSupport(player) {
  if (isIOSSafari()) return false;
  try {
    const rates = player.getAvailablePlaybackRates?.();
    return Array.isArray(rates) && rates.length > 1;
  } catch {
    return false;
  }
}
