import type { C2S, S2C } from "../shared/protocol.ts";

/** How a connection ended, as the browser saw it. */
export interface Closed {
  code: number;
  clean: boolean;
  reason: string;
  /** How long the server had been silent when it ended (ms). */
  quiet: number;
}

/** One WebSocket to the world server. Reconnecting is the caller's job (it opens a new Connection). */
export class Connection {
  onOpen: () => void = () => {};
  onMessage: (msg: S2C) => void = () => {};
  onClose: (end: Closed) => void = () => {};
  private readonly ws: WebSocket;
  /** When the server was last heard from (Date.now). */
  private heard = Date.now();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.heard = Date.now();
      this.onOpen();
    };
    this.ws.onmessage = (e) => {
      this.heard = Date.now();
      if (typeof e.data === "string") this.onMessage(JSON.parse(e.data) as S2C);
    };
    this.ws.onclose = (e) => this.onClose({ code: e.code, clean: e.wasClean, reason: e.reason, quiet: Date.now() - this.heard });
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: C2S): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws.close();
  }
}
