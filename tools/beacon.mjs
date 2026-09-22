// Collects the browser self-test's report lines: node tools/beacon.mjs <port> <logfile>
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const [port, log] = process.argv.slice(2);
createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    if (req.method === "POST" && body) appendFileSync(log, body.replace(/\n/g, " ") + "\n");
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
  });
}).listen(Number(port), "127.0.0.1");
