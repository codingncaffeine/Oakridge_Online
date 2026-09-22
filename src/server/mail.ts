import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

const FROM = "Oakridge Online <noreply@emutastic.com>";
const ENVELOPE_FROM = "noreply@emutastic.com";

/** Hands mail to the host's sendmail, with the envelope sender on our own domain so SPF and DKIM line up. */
export function sendmailMailer(binary = "/usr/sbin/sendmail"): Mailer {
  return (mail) => new Promise((resolve, reject) => {
    if (/[\r\n]/.test(mail.to) || /[\r\n]/.test(mail.subject)) {
      reject(new Error("header injection"));
      return;
    }
    const child = spawn(binary, ["-t", "-i", "-f", ENVELOPE_FROM], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`sendmail exited ${code}: ${err.trim()}`))));
    child.stdin.end(
      `From: ${FROM}\nTo: ${mail.to}\nSubject: ${mail.subject}\nMIME-Version: 1.0\n`
      + `Content-Type: text/plain; charset=utf-8\nAuto-Submitted: auto-generated\n\n${mail.text}\n`,
    );
  });
}

/** Development and tests: appends each mail to a file as one JSON line instead of sending it. */
export function fileMailer(path: string): Mailer {
  mkdirSync(dirname(path), { recursive: true });
  return async (mail) => {
    appendFileSync(path, `${JSON.stringify({ ...mail, at: Date.now() })}\n`);
  };
}
