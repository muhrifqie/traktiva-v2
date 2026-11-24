// play() returns a promise that rejects when playback is cut short: pause() or a new src before it starts
// (AbortError), or the browser blocking autoplay (NotAllowedError). Unhandled, that shows up as a runtime
// error (the Next.js dev overlay), so every play() goes through here.

/** A play() that was interrupted by pause()/a new source: normal, never worth an error message. */
export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Start playback without ever leaving a rejected promise behind. Resolves true when it actually plays. */
export function playMedia(m: HTMLMediaElement): Promise<boolean> {
  return m.play().then(
    () => true,
    (e) => {
      if (!isAbortError(e)) console.warn("Media tidak bisa diputar:", e);
      return false;
    },
  );
}
