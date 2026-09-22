// Builds dist/public (the client: index.html + hashed bundle) and dist/app (the one-file world server).
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import * as esbuild from "esbuild";

const fail = (result) => {
  for (const w of result.warnings) console.error(`warning: ${w.text} (${w.location?.file}:${w.location?.line})`);
  if (result.warnings.length) process.exit(1);
};

await rm("dist", { recursive: true, force: true });

const client = await esbuild.build({
  entryPoints: ["src/client/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: "linked",
  outdir: "dist/public/assets",
  entryNames: "client-[hash]",
  metafile: true,
  logLevel: "error",
});
fail(client);
const bundle = Object.keys(client.metafile.outputs).find((f) => f.endsWith(".js"));
const html = await readFile("public/index.html", "utf8");
if (!html.includes("<!--CLIENT-->")) throw new Error("public/index.html is missing the <!--CLIENT--> marker");
await writeFile("dist/public/index.html",
  html.replace("<!--CLIENT-->", `<script type="module" src="assets/${basename(bundle)}"></script>`));

const server = await esbuild.build({
  entryPoints: ["src/server/main.ts"],
  bundle: true,
  platform: "node",
  target: "node22.13",
  format: "cjs",
  outfile: "dist/app/server.js",
  // Optional native speed-ups that ws falls back from when they are absent.
  external: ["bufferutil", "utf-8-validate"],
  logLevel: "error",
});
fail(server);
await mkdir("dist/app", { recursive: true });
await writeFile("dist/app/package.json",
  JSON.stringify({ name: "oakridge-online-server", private: true, main: "server.js" }, null, 2) + "\n");

const kb = async (f) => ((await stat(f)).size / 1024).toFixed(0) + " KB";
console.log(`client ${bundle} ${await kb(bundle)} · server dist/app/server.js ${await kb("dist/app/server.js")}`);
