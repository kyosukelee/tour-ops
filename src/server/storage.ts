// ファイルの保管場所。Cloudflare R2(S3 互換 API)を使い、未設定の手元ではフォルダ(.data/uploads)に置く
// S3 互換なので、AWS S3 などにも接続先を変えるだけで移せる
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";

export interface FileStorage {
  readonly kind: "r2" | "local";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}

type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; endpoint?: string };

export function createR2Storage(cfg: R2Config, fetchImpl: typeof fetch = fetch): FileStorage {
  const client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: "s3", region: "auto" });
  const base = `${cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`}/${cfg.bucket}`;
  const url = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const send = async (u: string, init: RequestInit) => {
    const signed = await client.sign(u, init);
    return fetchImpl(signed);
  };

  return {
    kind: "r2",
    async put(key, body, contentType) {
      const res = await send(url(key), { method: "PUT", body: body as BodyInit, headers: { "Content-Type": contentType } });
      if (!res.ok) throw new Error(`ファイルを保存できませんでした(R2: ${res.status})`);
    },
    async get(key) {
      const res = await send(url(key), { method: "GET" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`ファイルを読み込めませんでした(R2: ${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await send(url(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`ファイルを削除できませんでした(R2: ${res.status})`);
    },
    // 指定したフォルダ(接頭辞)の中身をすべて消す(デモの毎朝の作り直し用)
    async deletePrefix(prefix) {
      let deleted = 0;
      let token: string | undefined;
      do {
        const q = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
        if (token) q.set("continuation-token", token);
        const res = await send(`${base}?${q}`, { method: "GET" });
        if (!res.ok) throw new Error(`ファイルの一覧を取れませんでした(R2: ${res.status})`);
        const xml = await res.text();
        const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1]));
        for (const key of keys) {
          await this.delete(key);
          deleted++;
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] : undefined;
      } while (token);
      return deleted;
    },
  };
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function createLocalStorage(root = path.join(process.cwd(), ".data", "uploads")): FileStorage {
  // 実行時に決まる場所なので、本番の出力にファイルを含める対象(トレース)から外す
  const base = path.resolve(/*turbopackIgnore: true*/ root);
  // キーに ".." などが入っても root の外には出さない
  const file = (key: string) => {
    const p = path.resolve(/*turbopackIgnore: true*/ base, key);
    if (!p.startsWith(base + path.sep)) throw new Error("不正なファイルの場所です");
    return p;
  };
  return {
    kind: "local",
    async put(key, body) {
      const p = file(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(file(key)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      await rm(file(key), { force: true });
    },
    async deletePrefix(prefix) {
      await rm(file(prefix.replace(/\/$/, "")), { recursive: true, force: true });
      return 0;
    },
  };
}

// 環境変数から保管場所を決める。R2 の設定があれば R2、なければ手元のフォルダ
// Vercel 上では手元のフォルダに書けないので、R2 が未設定ならエラーにする
export function createStorage(env: Record<string, string | undefined> = process.env): FileStorage {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    return createR2Storage({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
  }
  if (env.VERCEL) throw new Error("添付ファイルの保存先(Cloudflare R2)が設定されていません");
  return createLocalStorage();
}
