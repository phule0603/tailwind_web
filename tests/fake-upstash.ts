/*
 * A tiny in-memory stand-in for the Upstash Redis REST API, implementing exactly
 * the commands the project store uses, with Redis semantics. Used by the unit
 * tests as a fetch implementation.
 */

type Reply = string | number | null | Reply[];

export function createFakeRedis(token = "test-token") {
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, { value: string; expiresAt?: number }>();
  const commands: string[][] = [];

  const hash = (key: string) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    return hashes.get(key)!;
  };
  const liveString = (key: string) => {
    const s = strings.get(key);
    if (s?.expiresAt !== undefined && s.expiresAt <= Date.now()) {
      strings.delete(key);
      return undefined;
    }
    return s;
  };

  function exec(cmd: string[]): Reply {
    commands.push(cmd);
    const [rawName, ...args] = cmd;
    switch (rawName.toUpperCase()) {
      case "HSET": {
        const [key, ...pairs] = args;
        const h = hash(key);
        let created = 0;
        for (let i = 0; i + 1 < pairs.length; i += 2) {
          if (!h.has(pairs[i])) created++;
          h.set(pairs[i], pairs[i + 1]);
        }
        return created;
      }
      case "HGET":
        return hash(args[0]).get(args[1]) ?? null;
      case "HGETALL":
        return [...hash(args[0]).entries()].flat();
      case "HDEL": {
        const [key, ...fields] = args;
        const h = hash(key);
        let removed = 0;
        for (const f of fields) if (h.delete(f)) removed++;
        return removed;
      }
      case "SET": {
        const [key, value, ...opts] = args;
        const upper = opts.map((o) => o.toUpperCase());
        if (upper.includes("NX") && liveString(key)) return null;
        const ex = upper.indexOf("EX");
        const px = upper.indexOf("PX");
        strings.set(key, {
          value,
          expiresAt:
            ex >= 0 ? Date.now() + Number(opts[ex + 1]) * 1000 : px >= 0 ? Date.now() + Number(opts[px + 1]) : undefined,
        });
        return "OK";
      }
      case "DEL": {
        let removed = 0;
        for (const k of args) if (strings.delete(k) || hashes.delete(k)) removed++;
        return removed;
      }
      default:
        throw new Error(`ERR unknown command '${rawName}'`);
    }
  }

  /** Handles one HTTP request body the way Upstash's /pipeline endpoint does. */
  function handlePipeline(auth: string | null, body: unknown): { status: number; json: unknown } {
    if (auth !== `Bearer ${token}`) return { status: 401, json: { error: "Unauthorized" } };
    if (!Array.isArray(body)) return { status: 400, json: { error: "ERR invalid body" } };
    return {
      status: 200,
      json: body.map((cmd: string[]) => {
        try {
          return { result: exec(cmd.map(String)) };
        } catch (err) {
          return { error: (err as Error).message };
        }
      }),
    };
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith("/pipeline")) return new Response("not found", { status: 404 });
    const headers = new Headers(init?.headers);
    const { status, json } = handlePipeline(headers.get("authorization"), JSON.parse(String(init?.body)));
    return Response.json(json, { status });
  }) as typeof fetch;

  return { exec, handlePipeline, fetch: fetchImpl, commands, hashes, strings };
}
