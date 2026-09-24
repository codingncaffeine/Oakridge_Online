import type { ContextMenu } from "./menu.ts";

/**
 * The friends tab (PLAN Phase 10): the friends list, green for those in the world and red for those
 * not, a line to add a name, and beneath it the ignored. Clicking a friend starts a private message
 * to them; right-clicking offers that, or taking them off the list.
 */
export class FriendsPanel {
  onAdd: (name: string) => void = () => {};
  onRemove: (name: string) => void = () => {};
  onIgnore: (name: string) => void = () => {};
  onUnignore: (name: string) => void = () => {};
  onMessage: (name: string) => void = () => {};
  private friends: Array<{ name: string; online: boolean }> = [];
  private ignores: string[] = [];
  private readonly list = document.getElementById("friends-list") as HTMLElement;
  private readonly ignored = document.getElementById("ignores-list") as HTMLElement;
  private readonly menu: ContextMenu;

  constructor(menu: ContextMenu) {
    this.menu = menu;
    const wire = (inputId: string, buttonId: string, add: (name: string) => void) => {
      const input = document.getElementById(inputId) as HTMLInputElement;
      const go = () => {
        const name = input.value.trim();
        if (!name) return;
        add(name);
        input.value = "";
      };
      document.getElementById(buttonId)!.addEventListener("click", go);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") go();
        e.stopPropagation();
      });
    };
    wire("friends-add", "friends-add-button", (name) => this.onAdd(name));
    wire("ignores-add", "ignores-add-button", (name) => this.onIgnore(name));
    this.render();
  }

  /** Both lists, as the server sends them on entering and whenever one changes. */
  set(friends: Array<{ name: string; online: boolean }>, ignores: string[]): void {
    this.friends = friends;
    this.ignores = ignores;
    this.render();
  }

  private render(): void {
    this.list.replaceChildren(...this.friends.map((f) => {
      const row = Object.assign(document.createElement("button"), { type: "button", className: `friend ${f.online ? "online" : "offline"}` });
      row.append(Object.assign(document.createElement("span"), { textContent: f.name }), Object.assign(document.createElement("small"), { textContent: f.online ? "in the world" : "away" }));
      row.title = f.online ? `Message ${f.name}` : `${f.name} is not in the world`;
      row.addEventListener("click", () => { if (f.online) this.onMessage(f.name); });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.menu.show(e.clientX, e.clientY, [
          ...(f.online ? [{ verb: "Message", target: f.name, kind: "player" as const, run: () => this.onMessage(f.name) }] : []),
          { verb: "Remove", target: f.name, kind: "player" as const, run: () => this.onRemove(f.name) },
        ]);
      });
      return row;
    }));
    if (this.friends.length === 0) this.list.append(Object.assign(document.createElement("p"), { className: "note", textContent: "Nobody yet. Add a name above." }));
    this.ignored.replaceChildren(...this.ignores.map((name) => {
      const row = Object.assign(document.createElement("button"), { type: "button", className: "friend ignored" });
      row.append(Object.assign(document.createElement("span"), { textContent: name }));
      row.title = `Stop ignoring ${name}`;
      row.addEventListener("click", () => this.onUnignore(name));
      return row;
    }));
    if (this.ignores.length === 0) this.ignored.append(Object.assign(document.createElement("p"), { className: "note", textContent: "Nobody ignored." }));
  }
}
