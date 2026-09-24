import { MAX_CHAT } from "../../shared/protocol.ts";

const MAX_LINES = 100;

/**
 * The chatbox: public chat and game messages on parchment, and the line you type into. Typing anywhere
 * starts a message. The tabs underneath show everything, only game messages, or only public chat.
 */
export class Chatbox {
  onSend: (text: string) => void = () => {};
  /** A private message typed for someone (PLAN Phase 10). */
  onPm: (to: string, text: string) => void = () => {};
  private readonly lines = document.getElementById("chat-lines") as HTMLOListElement;
  private readonly input = document.getElementById("chat-input") as HTMLInputElement;
  private readonly label = document.getElementById("chat-name") as HTMLElement;
  private name = "";
  /** Who the line is being typed to, when it is not the world. */
  private to: string | null = null;

  constructor() {
    this.input.maxLength = MAX_CHAT;
    const tabs = [...document.querySelectorAll<HTMLButtonElement>(".chat-tab")];
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        for (const t of tabs) t.setAttribute("aria-pressed", String(t === tab));
        this.lines.dataset.filter = tab.dataset.filter!;
        this.lines.scrollTop = this.lines.scrollHeight;
      });
    }
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const text = this.input.value.trim();
        if (text) {
          if (this.to) this.onPm(this.to, text);
          else this.onSend(text);
        }
        this.input.value = "";
        // One private message at a time, as the classic has it: the line goes back to the world after each.
        if (this.to) this.messageTo(null);
      } else if (e.key === "Escape") {
        if (this.to) {
          this.messageTo(null);
          return;
        }
        this.input.value = "";
        this.input.blur();
      }
    });
    // Like the classic client, a printable key pressed while nothing else has focus goes to the chat line.
    window.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (!typing && document.body.classList.contains("playing") && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.input.focus();
      }
    });
  }

  setName(name: string): void {
    this.name = name;
    this.relabel();
  }

  /** The line is now for this player (a private message), or for the world again with null. */
  messageTo(name: string | null): void {
    this.to = name;
    this.relabel();
    if (name) this.input.focus();
  }

  private relabel(): void {
    this.label.textContent = this.to ? `To ${this.to}:` : `${this.name}:`;
    this.label.classList.toggle("to", this.to !== null);
  }

  /** A private message, either way: "To X:" for one sent, "From X:" for one received. */
  pm(from: string, to: string, text: string): void {
    const mine = from === this.name;
    const li = Object.assign(document.createElement("li"), { className: "pm" });
    const who = Object.assign(document.createElement("span"), { className: "who", textContent: mine ? `To ${to}: ` : `From ${from}: ` });
    li.append(who, Object.assign(document.createElement("span"), { className: "said", textContent: text }));
    this.push(li);
  }

  /** A line of public chat. */
  said(name: string, text: string): void {
    const li = Object.assign(document.createElement("li"), { className: "public" });
    const who = Object.assign(document.createElement("span"), { className: "who", textContent: `${name}: ` });
    const said = Object.assign(document.createElement("span"), { className: "said", textContent: text });
    li.append(who, said);
    this.push(li);
  }

  /** A message from the game itself. */
  game(text: string): void {
    this.push(Object.assign(document.createElement("li"), { className: "game", textContent: text }));
  }

  private push(li: HTMLLIElement): void {
    const atBottom = this.lines.scrollTop + this.lines.clientHeight >= this.lines.scrollHeight - 4;
    this.lines.append(li);
    while (this.lines.childElementCount > MAX_LINES) this.lines.firstElementChild?.remove();
    if (atBottom) this.lines.scrollTop = this.lines.scrollHeight;
  }
}
