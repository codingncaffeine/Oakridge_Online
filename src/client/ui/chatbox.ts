import { MAX_CHAT } from "../../shared/protocol.ts";

const MAX_LINES = 100;

/**
 * The chatbox: public chat and game messages on parchment, and the line you type into. Typing anywhere
 * starts a message. The tabs underneath show everything, only game messages, or only public chat.
 */
export class Chatbox {
  onSend: (text: string) => void = () => {};
  private readonly lines = document.getElementById("chat-lines") as HTMLOListElement;
  private readonly input = document.getElementById("chat-input") as HTMLInputElement;

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
        if (text) this.onSend(text);
        this.input.value = "";
      } else if (e.key === "Escape") {
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
    (document.getElementById("chat-name") as HTMLElement).textContent = `${name}:`;
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
