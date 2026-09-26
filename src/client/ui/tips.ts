/**
 * Where a side-panel tooltip goes: to the left of the panel, level with the thing hovered, kept on screen. The
 * panel stands at the screen's right edge, so a tip placed under the thing ran off that edge whenever its text
 * was wider than the panel; out to the left there is room, and a line longer than the room wraps.
 */
export function besidePanel(tip: HTMLElement, over: HTMLElement): void {
  const panel = document.getElementById("sidebar")?.getBoundingClientRect();
  if (!panel) return;
  const r = over.getBoundingClientRect(), gap = 6;
  tip.style.maxWidth = `${Math.max(140, Math.min(340, panel.left - gap - 4))}px`;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.max(4, panel.left - w - gap)}px`;
  tip.style.top = `${Math.max(4, Math.min(window.innerHeight - h - 4, r.top))}px`;
}
