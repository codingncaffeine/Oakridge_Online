// Collects the browser self-test's report lines: node tools/beacon.mjs <port> <logfile> [shots-dir]
// "SHOT <name> <png data URL>" lines are saved as <shots-dir>/<name>.png instead of being logged whole.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const [port, log, shots] = process.argv.slice(2);
createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    if (req.method === "POST") {
      const shot = /^SHOT (\w+) data:image\/png;base64,(.+)$/s.exec(body);
      if (shot && shots) {
        mkdirSync(shots, { recursive: true });
        const file = join(shots, `${shot[1]}.png`);
        writeFileSync(file, Buffer.from(shot[2], "base64"));
        appendFileSync(log, `SHOT ${shot[1]} ${file}\n`);
      } else if (body) {
        appendFileSync(log, body.replace(/\n/g, " ").slice(0, 4000) + "\n");
      } else {
        // A request carrying nothing is a lost report, not a quiet success: say so rather than drop it.
        appendFileSync(log, "BEACON empty body\n");
      }
    }
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
  });
}).listen(Number(port), "127.0.0.1");
