import type { C2S, S2C } from "../shared/protocol.ts";

/** One WebSocket to the world server. Reconnecting is the caller's job (it opens a new Connection). */
export class Connection {
  onOpen: () => void = () => {};
  onMessage: (msg: S2C) => void = () => {};
  onClose: (code: number) => void = () => {};
  private readonly ws: WebSocket;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.onOpen();
    this.ws.onmessage = (e) => {
      if (typeof e.data === "string") this.onMessage(JSON.parse(e.data) as S2C);
    };
    this.ws.onclose = (e) => this.onClose(e.code);
  }

  send(msg: C2S): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws.close();
  }
}
