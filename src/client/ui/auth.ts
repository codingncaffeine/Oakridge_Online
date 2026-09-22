import qrcode from "qrcode-generator";

export type View = "login" | "signup" | "totp" | "email" | "backup";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The start screen: log in, create an account, confirm a code, save backup codes. */
export class AuthScreen {
  onLogin: (name: string, code: string) => void = () => {};
  onEmailMe: (name: string) => void = () => {};
  onSignup: (name: string, method: "totp" | "email", email: string) => void = () => {};
  onConfirm: (code: string) => void = () => {};
  onBackupDone: () => void = () => {};

  private readonly msg = byId<HTMLParagraphElement>("start-msg");
  private readonly online = byId<HTMLParagraphElement>("start-online");
  private readonly tabs = { login: byId<HTMLButtonElement>("tab-login"), signup: byId<HTMLButtonElement>("tab-signup") };
  private readonly views: Record<View, HTMLElement> = {
    login: byId("view-login"), signup: byId("view-signup"), totp: byId("view-totp"), email: byId("view-email"), backup: byId("view-backup"),
  };
  private backupText = "";

  constructor() {
    this.tabs.login.addEventListener("click", () => this.show("login"));
    this.tabs.signup.addEventListener("click", () => this.show("signup"));
    const val = (id: string) => byId<HTMLInputElement>(id).value;

    this.views.login.addEventListener("submit", (e) => {
      e.preventDefault();
      this.onLogin(val("login-name"), val("login-code"));
    });
    byId("email-me").addEventListener("click", () => {
      if (!val("login-name").trim()) return this.message("Type your character name first.", true);
      this.onEmailMe(val("login-name"));
    });

    const emailField = byId("email-field"), emailInput = byId<HTMLInputElement>("signup-email");
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="method"]')) {
      radio.addEventListener("change", () => {
        const email = this.method() === "email";
        emailField.hidden = !email;
        emailInput.required = email;
      });
    }
    this.views.signup.addEventListener("submit", (e) => {
      e.preventDefault();
      this.onSignup(val("signup-name"), this.method(), val("signup-email"));
    });
    for (const id of ["totp", "email"] as const) {
      this.views[id].addEventListener("submit", (e) => {
        e.preventDefault();
        this.onConfirm(val(`${id}-code`));
      });
    }

    const saved = byId<HTMLInputElement>("backup-saved"), go = byId<HTMLButtonElement>("backup-continue");
    saved.addEventListener("change", () => { go.disabled = !saved.checked; });
    go.addEventListener("click", () => this.onBackupDone());
    byId("backup-copy").addEventListener("click", () => {
      navigator.clipboard?.writeText(this.backupText).then(() => this.message("Copied."), () => this.message("Copy didn't work here; use Save as file.", true));
    });
    byId("backup-save").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([this.backupText], { type: "text/plain" }));
      a.download = "oakridge-backup-codes.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  private method(): "totp" | "email" {
    return document.querySelector<HTMLInputElement>('input[name="method"]:checked')?.value === "email" ? "email" : "totp";
  }

  show(view: View): void {
    for (const [name, el] of Object.entries(this.views)) el.hidden = name !== view;
    const tab = view === "login" ? "login" : "signup";
    this.tabs.login.setAttribute("aria-selected", String(tab === "login"));
    this.tabs.signup.setAttribute("aria-selected", String(tab === "signup"));
    this.message("");
    this.views[view].querySelector<HTMLInputElement>("input:not([type=radio]):not([type=checkbox])")?.focus();
  }

  message(text: string, error = false): void {
    this.msg.textContent = text;
    this.msg.classList.toggle("error", error);
  }

  setOnline(n: number): void {
    this.online.textContent = n === 1 ? "1 adventurer is out there now" : `${n} adventurers are out there now`;
  }

  showTotp(secret: string, uri: string): void {
    const qr = qrcode(0, "M");
    qr.addData(uri);
    qr.make();
    const canvas = byId<HTMLCanvasElement>("qr"), g = canvas.getContext("2d")!;
    const n = qr.getModuleCount(), quiet = 4, cell = Math.floor(canvas.width / (n + quiet * 2));
    const offset = Math.floor((canvas.width - cell * n) / 2);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(offset + c * cell, offset + r * cell, cell, cell);
    byId("totp-key").textContent = secret.replace(/(.{4})/g, "$1 ").trim();
    byId<HTMLInputElement>("totp-code").value = "";
    this.show("totp");
  }

  showEmailSent(to: string): void {
    byId("email-to").textContent = to;
    byId<HTMLInputElement>("email-code").value = "";
    this.show("email");
  }

  showBackup(codes: string[], name: string): void {
    const list = byId("backup-list");
    list.replaceChildren(...codes.map((c) => Object.assign(document.createElement("li"), { textContent: c })));
    this.backupText = `Oakridge Online backup codes for ${name}\nEach code works once, in place of a login code.\n\n${codes.join("\n")}\n`;
    byId<HTMLInputElement>("backup-saved").checked = false;
    byId<HTMLButtonElement>("backup-continue").disabled = true;
    this.show("backup");
  }
}
