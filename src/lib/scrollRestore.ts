// A page that has already put the scroll where it belongs (e.g. Orders scrolling
// back to the order just opened) marks its path, so the dashboard shell skips
// its usual jump to the top for that navigation. Pages' layout effects run
// before the shell's, so the mark is in place when the shell checks it.
let restoredPath: string | null = null;

export function markScrollRestored(path: string) {
  restoredPath = path;
}

/** True once if the page at this path restored its own scroll; always clears the mark. */
export function consumeScrollRestored(path: string): boolean {
  const restored = restoredPath === path;
  restoredPath = null;
  return restored;
}
