import { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export const websocketHandler = async (c: Context) => {
  if (c.req.header("Upgrade") !== "websocket") {
    throw new HTTPException(400, { message: "expected websocket" });
  }
  const ip = c.req.header("CF-Connecting-IP");
  if (!ip) {
    throw new HTTPException(400, {
      message: "missing CF-Connecting-IP header",
    });
  }
  const [client, server] = Object.values(new WebSocketPair());
  // await handle(server, ip);
  const res = c.json(null, { status: 101, webSocket: client });
  return { server, ip, res };
};
