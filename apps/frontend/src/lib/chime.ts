/**
 * playChime — generates a pleasant two-note chime using the Web Audio API.
 * No audio file needed. Gracefully silenced if the browser blocks audio.
 *
 * @param variant "in"  → rising tone  (new request received by manager)
 *                "out" → falling tone (request decided, notify requester)
 */
export function playChime(variant: "in" | "out" = "in") {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    const freqs = variant === "in"
      ? [880, 1100]   // rising: A5 → C#6  (new request)
      : [1100, 880];  // falling: C#6 → A5 (decided)

    let time = ctx.currentTime;

    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.18, time + 0.01);  // quick attack
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35); // decay

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.35);

      time += 0.18; // slight overlap between notes
    }

    // Clean up the audio context after the chime finishes
    setTimeout(() => ctx.close().catch(() => null), 1000);
  } catch {
    // Audio blocked by browser policy or unavailable — silently ignore
  }
}
