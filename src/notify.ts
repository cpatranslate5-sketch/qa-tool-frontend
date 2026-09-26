// Sound + popup notification when a multi-check finishes running in the
// background — Александр's ask, 2026-09-26. Useful now that a check can
// take anywhere from a few seconds (live path) to up to an hour (batch
// queue) and he's often not watching the tab the whole time it runs.
//
// Both are strictly best-effort: a browser that blocks autoplay audio
// before any page interaction, or that has no Notification API at all (an
// older browser, some embedded webviews), should never break the actual
// check result from showing up — every failure here is swallowed silently.

let audioCtx: AudioContext | null = null;

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    // Two short, gently rising notes rather than one flat beep — easier to
    // tell apart from other notification sounds at a glance (well, an ear).
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch {
    /* best-effort only */
  }
}

// Call once, early (e.g. on app mount) — a bare requestPermission() call
// needs no user gesture in every browser that still supports it, but
// asking as early as possible means it's very likely already resolved (one
// way or the other) by the time a check actually finishes.
export function requestNotificationPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* Notification API unavailable — fine, notifyCheckFinished below just
       falls back to sound-only in that case */
  }
}

export function notifyCheckFinished(filename: string, ok: boolean) {
  beep();
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification(ok ? "✅ Проверка завершена" : "⚠️ Проверка не выполнена", {
        body: filename || undefined,
        tag: "qa-tool-check-finished",
      });
      // Bring the tab into focus when clicked — most useful when the
      // notification popped up while the user was in a completely
      // different window/app.
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  } catch {
    /* best-effort only */
  }
}
