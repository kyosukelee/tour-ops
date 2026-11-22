// 本番ビルド(output: "standalone")を起動する
// standalone には画像・CSS などの静的ファイルが入らないので、起動前にコピーしてから server.js を動かす
// (Dockerfile と同じ並びにしている)
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("先に npm run build を実行してください(.next/standalone/server.js がありません)");
  process.exit(1);
}
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

const child = spawn(process.execPath, ["server.js"], { cwd: standalone, stdio: "inherit", env: process.env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
