// アプリの動作ログ。1行1件の JSON で標準出力に出す(Vercel のログ画面や docker logs でそのまま検索できる)
// 例: {"time":"2026-11-22T00:00:00.000Z","level":"info","msg":"daily job","mailsSent":3}
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function write(level: Level, msg: string, fields?: Fields) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...serialize(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// Error はそのままだと JSON にならないので、名前・メッセージ・スタックを取り出す
function serialize(fields?: Fields) {
  if (!fields) return {};
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
  }
  return out;
}

export const logger = {
  debug: (msg: string, fields?: Fields) => process.env.LOG_LEVEL === "debug" && write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
