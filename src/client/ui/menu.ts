export interface MenuOption {
  verb: string;
  /** What the option acts on, shown in colour after the verb (empty for "Walk here"). */
  target: string;
  /** Colours the target: objects cyan, items orange, players white, creatures (and fishing spots) yellow. */
  kind?: "object" | "player" | "item" | "npc";
  run: () => void;
}

/** Hover-text form of the default option: "Walk here / 2 more options". */
export function hoverHtml(options: MenuOption[]): string {
  const first = options[0];
  if (!first) return "";
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const target = first.target ? ` <span class="target${first.kind && first.kind !== "object" ? ` ${first.kind}` : ""}">${esc(first.target)}</span>` : "";
  const more = options.length - 1;
  return `${esc(first.verb)}${target}${more > 0 ? `<span class="more"> / ${more} more option${more === 1 ? "" : "s"}</span>` : ""}`;
}

/** The right-click menu: every option for what is under the cursor, then Cancel. Moving well away closes it. */
export class ContextMenu {
  private readonly el = document.getElementById("context-menu") as HTMLDivElement;

  constructor() {
    window.addEventListener("pointermove", (e) => {
      if (this.el.hidden) return;
      const r = this.el.getBoundingClientRect();
      const margin = 12;
      if (e.clientX < r.left - margin || e.clientX > r.right + margin || e.clientY < r.top - margin || e.clientY > r.bottom + margin) this.close();
    });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") this.close(); });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(clientX: number, clientY: number, options: MenuOption[]): void {
    const head = Object.assign(document.createElement("div"), { className: "head", textContent: "Choose Option" });
    const items = [...options, { verb: "Cancel", target: "", run: () => {} }].map((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.append(o.verb);
      if (o.target) {
        b.append(" ");
        b.append(Object.assign(document.createElement("span"), { className: `target${o.kind && o.kind !== "object" ? ` ${o.kind}` : ""}`, textContent: o.target }));
      }
      b.addEventListener("click", () => {
        this.close();
        o.run();
      });
      return b;
    });
    this.el.replaceChildren(head, ...items);
    this.el.hidden = false;
    // Open centred under the cursor, kept on screen.
    const r = this.el.getBoundingClientRect();
    const x = Math.max(4, Math.min(window.innerWidth - r.width - 4, clientX - r.width / 2));
    const y = Math.max(4, Math.min(window.innerHeight - r.height - 4, clientY - 6));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  close(): void {
    this.el.hidden = true;
  }
}
