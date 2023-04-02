import type { Handler } from "hono";

type HandleServerSocket = (webSocket: WebSocket, ip: string) => Promise<void>;
export const websocketHandler = (handle: HandleServerSocket): Handler => {
  return async (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.text("expected websocket", { status: 400 });
    }
    const ip = c.req.header("CF-Connecting-IP");
    if (!ip) {
      return c.text("missing CF-Connecting-IP header", { status: 400 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    await handle(server, ip);
    return c.json(null, { status: 101, webSocket: client });
  };
};
