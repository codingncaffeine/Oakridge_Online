import { INVENTORY_SIZE, ITEM_BY_ID, stackLabel, type Stack } from "../../shared/items.ts";
import type { C2S, MakeOptionView, ShopSlotView } from "../../shared/protocol.ts";
import { itemIcon } from "../render/items.ts";
import { bindPress } from "./press.ts";
import { hoverHtml, type ContextMenu, type MenuOption } from "./menu.ts";
import { Portraits } from "./portraits.ts";

/**
 * The screens that open over the world: the bank, a shop, a conversation and a "make X" list. The
 * classic allows exactly one at a time and closes it the moment you walk away, so this is one element
 * that shows whichever the server says is open, and nothing when none is.
 */
export class Screens {
  /** Sets the hover text while the cursor is over a screen. */
  onHover: (html: string | null) => void = () => {};
  private readonly root = document.getElementById("screen") as HTMLDivElement;
  private readonly send: (msg: C2S) => void;
  private readonly menu: ContextMenu;
  /** The player's own pack, mirrored here so the bank and the shop can show it beside their own. */
  private pack: Array<Stack | null> = new Array<Stack | null>(INVENTORY_SIZE).fill(null);
  private open: "bank" | "shop" | "say" | "make" | "trade" | null = null;
  /** The speakers' heads, rendered once each (PLAN Phase 9). */
  private readonly portraits = new Portraits();

  constructor(send: (msg: C2S) => void, menu: ContextMenu) {
    this.send = send;
    this.menu = menu;
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.open !== null) this.close();
    });
  }

  /** Whether any screen is open: the world's click handling steps aside while one is. */
  get isOpen(): boolean {
    return this.open !== null;
  }

  /** The pack, kept current so the bank's and the shop's own copy of it stays right. */
  setPack(items: Array<Stack | null>): void {
    this.pack = items;
    if (this.open === "bank" || this.open === "shop" || this.open === "trade") this.redraw();
  }

  private redraw(): void {
    if (this.open === "bank") this.showBank(this.bankItems);
    else if (this.open === "shop") this.showShop(this.shopName, this.shopItems);
    else if (this.open === "trade" && this.trade) this.showTrade(this.trade.with, this.trade.mine, this.trade.theirs, this.trade.stage, this.trade.accepted);
  }

  // --- A trade (PLAN Phase 10) ----------------------------------------------------------------------

  private trade: { with: string; mine: Stack[]; theirs: Stack[]; stage: "offer" | "confirm"; accepted: [boolean, boolean] } | null = null;

  /**
   * Trading with another player: the offer screen, with what each side has put on the table and the
   * pack beneath to offer from; then the confirmation, where nothing can be changed and both must say
   * yes again. `null` closes it.
   */
  showTrade(withName: string | null, mine: Stack[] = [], theirs: Stack[] = [], stage: "offer" | "confirm" = "offer", accepted: [boolean, boolean] = [false, false]): void {
    if (!withName) {
      if (this.open === "trade") this.hide();
      this.trade = null;
      return;
    }
    this.trade = { with: withName, mine, theirs, stage, accepted };
    this.open = "trade";
    const body = frame(stage === "offer" ? `Trading with ${withName}` : "Are you sure?", () => this.close());
    const table = div("trade-table");
    const side = (title: string, items: Stack[], own: boolean) => {
      const col = div("trade-side");
      col.append(Object.assign(document.createElement("h4"), { textContent: title }));
      const grid = div("bank-grid trade-grid");
      items.forEach((s, index) => {
        if (own && stage === "offer") {
          grid.append(this.slot(s, {
            first: { verb: "Take back", count: 1 },
            options: [
              { verb: "Take back", count: 1 },
              { verb: "Take back 5", count: 5 },
              { verb: "Take back 10", count: 10 },
              { verb: "Take back all", count: -1 },
            ],
            run: (count) => this.send({ t: "trade_take", slot: index, count }),
          }));
        } else {
          grid.append(this.slot(s, { first: { verb: "Examine", count: 0 }, options: [], run: () => {} }));
        }
      });
      for (let n = items.length; n < 8; n++) grid.append(div("bank-slot empty"));
      col.append(grid);
      return col;
    };
    table.append(side("Your offer", mine, true), side(`${withName}'s offer`, theirs, false));
    body.append(table);
    const status = accepted[0] && accepted[1] ? "Both accepted." : accepted[0] ? "You have accepted. Waiting for the other player…" : accepted[1] ? "The other player has accepted." : stage === "offer" ? "Put things on the table from your pack, then accept." : "Nothing can change now. Accept to make the trade, or decline.";
    body.append(note(status));
    const buttons = div("trade-buttons");
    const accept = Object.assign(document.createElement("button"), { type: "button", className: "stone", textContent: accepted[0] ? "Accepted" : "Accept" });
    accept.disabled = accepted[0];
    accept.addEventListener("click", () => this.send({ t: "trade_accept" }));
    const decline = Object.assign(document.createElement("button"), { type: "button", className: "stone", textContent: "Decline" });
    decline.addEventListener("click", () => this.close());
    buttons.append(accept, decline);
    body.append(buttons);
    if (stage === "offer") body.append(this.packRow("offer"));
    this.mount(body);
  }

  close(): void {
    if (this.open === null) return;
    this.open = null;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.onHover(null);
    this.send({ t: "close" });
  }

  /** Shuts the screen without telling the server, for when the server is the one that shut it. */
  private hide(): void {
    this.open = null;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.onHover(null);
  }

  // --- The bank --------------------------------------------------------------------------------

  private bankItems: Array<Stack | null> = [];

  showBank(items: Array<Stack | null> | null): void {
    if (!items) {
      if (this.open === "bank") this.hide();
      return;
    }
    this.bankItems = items;
    this.open = "bank";
    const held = items.filter((s): s is Stack => s !== null);
    const body = frame("Bank of Oakridge", () => this.close());
    const grid = div("bank-grid");
    held.forEach((s, slot) => grid.append(this.slot(s, {
      first: { verb: "Withdraw", count: 1 },
      options: [
        { verb: "Withdraw", count: 1 },
        { verb: "Withdraw 5", count: 5 },
        { verb: "Withdraw 10", count: 10 },
        { verb: "Withdraw all", count: -1 },
      ],
      run: (count) => this.send({ t: "withdraw", slot, count }),
    })));
    for (let n = held.length; n < 40; n++) grid.append(div("bank-slot empty"));
    body.append(note(`${held.length} of ${items.length} kinds of thing kept.`), grid, this.packRow("deposit"));
    this.mount(body);
  }

  // --- A shop ----------------------------------------------------------------------------------

  private shopName = "";
  private shopItems: ShopSlotView[] = [];

  showShop(name: string | null, items: ShopSlotView[] = []): void {
    if (!name) {
      if (this.open === "shop") this.hide();
      return;
    }
    this.shopName = name;
    this.shopItems = items;
    this.open = "shop";
    const body = frame(name, () => this.close());
    const grid = div("bank-grid");
    items.forEach((line, slot) => {
      const def = ITEM_BY_ID.get(line.id);
      if (!def) return;
      grid.append(this.slot({ id: line.id, count: line.count }, {
        first: { verb: "Buy", count: 1 },
        options: [
          { verb: "Buy", count: 1 },
          { verb: "Buy 5", count: 5 },
          { verb: "Buy 10", count: 10 },
        ],
        run: (count) => this.send({ t: "buy", slot, count }),
        extra: `${line.buy} coins each; they pay ${line.sell}.`,
      }));
    });
    for (let n = items.length; n < 24; n++) grid.append(div("bank-slot empty"));
    body.append(note("Left-click to buy one, right-click for more. Your own things sell from below."), grid, this.packRow("sell"));
    this.mount(body);
  }

  // --- A conversation ---------------------------------------------------------------------------

  showSay(speaker: string | null, lines: string[] = [], options: string[] = [], npc?: string): void {
    if (!speaker) {
      if (this.open === "say") this.hide();
      return;
    }
    this.open = "say";
    const body = div("say-box");
    // The speaker's head beside their words, when they are a person the world can draw.
    const portrait = npc ? this.portraits.of(npc) : null;
    if (portrait) body.append(Object.assign(document.createElement("img"), { className: "say-portrait", alt: "", draggable: false, src: portrait }));
    body.append(Object.assign(document.createElement("h3"), { className: "say-name", textContent: speaker }));
    for (const line of lines) body.append(Object.assign(document.createElement("p"), { className: "say-line", textContent: line }));
    const list = div("say-options");
    options.forEach((text, i) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "say-option", textContent: text });
      b.addEventListener("click", () => this.send({ t: "say", option: i }));
      list.append(b);
    });
    if (options.length === 0) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "say-option", textContent: "Click to continue" });
      b.addEventListener("click", () => this.close());
      list.append(b);
    }
    body.append(list);
    this.mount(body, "say");
  }

  // --- The "make X" list -------------------------------------------------------------------------

  showMake(title: string | null, options: MakeOptionView[] = []): void {
    if (!title) {
      if (this.open === "make") this.hide();
      return;
    }
    this.open = "make";
    const body = frame(title, () => this.close());
    const grid = div("make-grid");
    options.forEach((option, i) => {
      const def = ITEM_BY_ID.get(option.id);
      if (!def) return;
      const cell = div(`make-cell${option.can > 0 ? "" : " cant"}`);
      const img = Object.assign(document.createElement("img"), { alt: "", draggable: false, src: itemIcon(def.id) });
      const name = Object.assign(document.createElement("span"), {
        className: "make-name",
        textContent: option.each > 1 ? `${def.name} (${option.each})` : def.name,
      });
      const can = Object.assign(document.createElement("span"), {
        className: "make-can",
        textContent: option.can > 0 ? `${option.can}` : "",
      });
      cell.append(img, name, can);
      cell.title = option.can > 0 ? `Make up to ${option.can}.` : option.note ?? "";
      if (option.can > 0) {
        bindPress(cell, {
          primary: () => this.send({ t: "make", index: i, count: 1 }),
          menu: (x, y) => this.menu.show(x, y, [
            { verb: "Make", target: def.name, kind: "item", run: () => this.send({ t: "make", index: i, count: 1 }) },
            { verb: "Make 5", target: def.name, kind: "item", run: () => this.send({ t: "make", index: i, count: 5 }) },
            { verb: "Make 10", target: def.name, kind: "item", run: () => this.send({ t: "make", index: i, count: 10 }) },
            { verb: "Make all", target: def.name, kind: "item", run: () => this.send({ t: "make", index: i, count: -1 }) },
          ]),
        });
      }
      grid.append(cell);
    });
    body.append(note("Left-click makes one; right-click for more. Anything greyed out says why."), grid);
    this.mount(body);
  }

  // --- Shared parts ------------------------------------------------------------------------------

  /** The player's own pack under a bank, a shop or a trade, with the move that screen offers on each item. */
  private packRow(action: "deposit" | "sell" | "offer"): HTMLElement {
    const wrap = div("pack-row");
    wrap.append(note(action === "deposit" ? "Your pack — click to put things in." : action === "sell" ? "Your pack — click to sell." : "Your pack — click to put things on the table."));
    const grid = div("bank-grid pack");
    this.pack.forEach((s, slot) => {
      if (!s) {
        grid.append(div("bank-slot empty"));
        return;
      }
      const verb = action === "deposit" ? "Deposit" : action === "sell" ? "Sell" : "Offer";
      grid.append(this.slot(s, {
        first: { verb, count: 1 },
        options: [
          { verb, count: 1 },
          { verb: `${verb} 5`, count: 5 },
          { verb: `${verb} 10`, count: 10 },
          { verb: `${verb} all`, count: -1 },
        ],
        run: (count) => this.send(action === "deposit" ? { t: "deposit", slot, count } : action === "sell" ? { t: "sell", slot, count } : { t: "trade_offer", slot, count }),
      }));
    });
    wrap.append(grid);
    return wrap;
  }

  /** One item slot in a screen: its picture, its count, and the moves it offers. */
  private slot(
    stack: Stack,
    spec: { first: { verb: string; count: number }; options: Array<{ verb: string; count: number }>; run: (count: number) => void; extra?: string },
  ): HTMLElement {
    const def = ITEM_BY_ID.get(stack.id);
    const cell = div("bank-slot");
    if (!def) return cell;
    cell.append(Object.assign(document.createElement("img"), { alt: "", draggable: false, src: itemIcon(def.id) }));
    if (stack.count > 1) {
      const label = stackLabel(stack.count);
      cell.append(Object.assign(document.createElement("span"), {
        className: `count ${label.color === "yellow" ? "" : label.color}`.trim(),
        textContent: label.text,
      }));
    }
    const options: MenuOption[] = spec.options.map((o) => ({
      verb: o.verb, target: def.name, kind: "item", run: () => spec.run(o.count),
    }));
    options.push({ verb: "Examine", target: def.name, kind: "item", run: () => {} });
    bindPress(cell, {
      primary: () => { if (spec.options.length > 0) spec.run(spec.first.count); },
      menu: (x, y) => this.menu.show(x, y, options),
    });
    cell.addEventListener("pointerenter", () => this.onHover(hoverHtml(options)));
    cell.addEventListener("pointerleave", () => this.onHover(null));
    cell.title = spec.extra ?? def.examine;
    return cell;
  }

  private mount(body: HTMLElement, kind: "box" | "say" = "box"): void {
    this.root.replaceChildren(body);
    this.root.dataset.kind = kind;
    this.root.hidden = false;
  }
}

function div(className: string): HTMLDivElement {
  return Object.assign(document.createElement("div"), { className });
}

function note(text: string): HTMLElement {
  return Object.assign(document.createElement("p"), { className: "screen-note", textContent: text });
}

/** A screen's stone frame: a title bar with its close button, and a body under it. */
function frame(title: string, onClose: () => void): HTMLElement {
  const box = div("screen-box stone-frame");
  const bar = div("screen-bar");
  bar.append(Object.assign(document.createElement("h3"), { textContent: title }));
  const close = Object.assign(document.createElement("button"), { type: "button", className: "screen-close", textContent: "×" });
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", onClose);
  bar.append(close);
  box.append(bar);
  return box;
}
