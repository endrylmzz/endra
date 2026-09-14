// ADR-007: a tiny localhost-only endpoint so ENDRA Core can start a
// conversation turn on its own (reminders, future proactive
// notifications) without knowing Telegram's Bot API itself.

import { createServer, type Server } from "node:http";

export interface PushServerDeps {
  secret: string;
  sendMessage: (chatId: number, text: string) => Promise<void>;
}

export interface PushRequest {
  method: string | undefined;
  url: string | undefined;
  secretHeader: string | undefined;
  body: string;
}

export interface PushResult {
  status: number;
  body?: string;
}

export async function processPushRequest(
  request: PushRequest,
  deps: PushServerDeps,
): Promise<PushResult> {
  if (request.method !== "POST" || request.url !== "/push") return { status: 404 };
  if (request.secretHeader !== deps.secret) return { status: 401 };

  let parsed: { conversationId?: unknown; message?: unknown };
  try {
    parsed = JSON.parse(request.body);
  } catch {
    return { status: 400 };
  }
  if (typeof parsed.conversationId !== "string" || typeof parsed.message !== "string") {
    return { status: 400 };
  }

  try {
    await deps.sendMessage(Number(parsed.conversationId), parsed.message);
    return { status: 200, body: JSON.stringify({ ok: true }) };
  } catch {
    return { status: 502 };
  }
}

export function startPushServer(port: number, deps: PushServerDeps): Server {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
    });
    req.on("end", () => {
      const secretHeader = req.headers["x-endra-internal-secret"];
      processPushRequest(
        {
          method: req.method,
          url: req.url,
          secretHeader: typeof secretHeader === "string" ? secretHeader : undefined,
          body,
        },
        deps,
      )
        .then((result) => {
          res.writeHead(result.status, result.body ? { "Content-Type": "application/json" } : {});
          res.end(result.body);
        })
        .catch(() => {
          res.writeHead(500).end();
        });
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}
