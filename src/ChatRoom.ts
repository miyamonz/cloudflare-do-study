import { Hono } from "hono";
import { Bindings as Env } from ".";
import { websocketHandler } from "./websocketHandler";
// import { RateLimiterClient } from "./RateLimiter";

const app = new Hono();

type UserSession = {
  name: string;
  webSocket: WebSocket;
  quit?: boolean;
};
export class ChatRoom {
  storage: DurableObjectStorage;
  env: Env;
  sessions: UserSession[];
  lastTimestamp: number;

  constructor(state: DurableObjectState, env: Env) {
    // `controller.storage` provides access to our durable storage. It provides a simple KV
    // get()/put() interface.
    this.storage = state.storage;

    // `env` is our environment bindings (discussed earlier).
    this.env = env;

    // We will put the WebSocket objects for each client, along with some metadata, into
    // `sessions`.
    this.sessions = [];

    // We keep track of the last-seen message's timestamp just so that we can assign monotonically
    // increasing timestamps even if multiple messages arrive simultaneously (see below). There's
    // no need to store this to disk since we assume if the object is destroyed and recreated, much
    // more than a millisecond will have gone by.
    this.lastTimestamp = 0;

    app.get("/websocket", async (c) => {
      const name = c.req.query("name");
      if (!name) {
        throw new Error("missing name");
      }
      const { server, res } = await websocketHandler(c);
      this.handleSession(server, name);
      return res;
    });
  }

  async fetch(request: Request) {
    return app.fetch(request);
  }

  // handleSession() implements our WebSocket-based chat protocol.
  async handleSession(webSocket: WebSocket, name: string) {
    // Accept our end of the WebSocket. This tells the runtime that we'll be terminating the
    // WebSocket in JavaScript, not sending it elsewhere.
    webSocket.accept();

    // Set up our rate limiter client.
    // const limiterId = this.env.limiters.idFromName(ip);
    // const limiter = new RateLimiterClient(
    //   // @ts-expect-error
    //   () => this.env.limiters.get(limiterId),
    //   (err) => webSocket.close(1011, err.stack)
    // );

    // Create our session and add it to the sessions list.
    const session: UserSession = { name, webSocket };
    this.sessions.push(session);

    // send "join" messages for all online users, to populate the client's roster.
    this.sessions.forEach((otherSession) => {
      session.webSocket.send(JSON.stringify({ joined: otherSession.name }));
    });

    // Load the last 100 messages from the chat history stored on disk, and send them to the
    // client.
    let storage = await this.storage.list({ reverse: true });
    console.log("length", [...storage.values()].length);

    [...storage.entries()].forEach(([key, value]) => {
      if (typeof value !== "string") return;
      const json = JSON.parse(value);

      if (!json.isDown) {
        console.log(json);
        this.storage.delete(key);
      }
    });

    let backlog = [...storage.values()] as string[];
    backlog.reverse();
    backlog.forEach((value) => {
      webSocket.send(value);
    });

    // Set event handlers to receive messages.
    const wsApp = new Hono();

    // restrict message length
    // wsApp.use(async (c, next) => {
    //   await next();
    //   const json = await c.res.json<any>();
    //   const message = json?.message;
    //   if (message?.length > 256) {
    //     c.res = c.json({ error: "Message too long." });
    //   }
    // });

    wsApp.use(async (c, next) => {
      if (session.quit) webSocket.close(1011, "WebSocket broken.");
      await next();
    });

    //broadcast
    wsApp.use(async (c, next) => {
      await next();

      const data = await c.res.json();
      c.res = c.json(data);

      const dataStr = JSON.stringify(data);
      this.broadcast(dataStr);
    });

    // save message
    wsApp.use(async (c, next) => {
      await next();

      const isDown = c.req.query("isDown") === "true" ?? false;
      if (isDown) {
        const data = await c.res.json();
        c.res = c.json(data);
        const dataStr = JSON.stringify(data);

        const timestamp = Number(c.req.header("timestamp"));
        const key = new Date(timestamp).toISOString();
        await this.storage.put(key, dataStr);
      }
    });

    // timestamp
    wsApp.use(async (c, next) => {
      await next();
      const json = await c.res.json<any>();
      const timestamp = Number(c.req.header("timestamp"));
      this.lastTimestamp = timestamp;
      c.res = c.json({ ...json, timestamp });
    });

    wsApp.all("/mousePos", async (c) => {
      const data = await c.req.json();
      const ret = {
        name: data.name,
        type: data.type,
        pos: data.pos,
        isDown: data.isDown,
        color: data.color,
      };
      return c.json(ret);
    });

    webSocket.addEventListener("message", async (msg) => {
      try {
        let data = JSON.parse(msg.data as string);
        if (data.type !== "mousePos") console.log(data);

        const params = new URLSearchParams(data);

        const path = (data.type[0] !== "/" ? "/" : "") + data.type;
        const timestamp = Math.max(Date.now(), this.lastTimestamp + 1);
        const res = await wsApp.request(path + "?" + params.toString(), {
          headers: {
            timestamp: timestamp.toString(),
          },
          method: "POST",
          body: JSON.stringify(data),
        });

        const resjson = await res.json();
        if (resjson) {
          webSocket.send(JSON.stringify(resjson));
        }
      } catch (err) {
        // Report any exceptions directly back to the client. As with our handleErrors() this
        // probably isn't what you'd want to do in production, but it's convenient when testing.
        // @ts-expect-error
        webSocket.send(JSON.stringify({ error: err.stack }));
      }
    });

    // On "close" and "error" events, remove the WebSocket from the sessions list and broadcast
    // a quit message.
    let closeOrErrorHandler = () => {
      session.quit = true;
      this.sessions = this.sessions.filter((member) => member !== session);
      this.broadcast({ quit: session.name });
    };
    webSocket.addEventListener("close", closeOrErrorHandler);
    webSocket.addEventListener("error", closeOrErrorHandler);
  }

  // broadcast() broadcasts a message to all clients.
  broadcast(_message: string | object) {
    // Apply JSON if we weren't given a string to start with.
    const message =
      typeof _message !== "string" ? JSON.stringify(_message) : _message;

    // Iterate over all the sessions sending them messages.
    let quitters: UserSession[] = [];
    this.sessions = this.sessions.filter((session) => {
      return sendMessage(session, message);
    });

    quitters.forEach((quitter) => {
      this.broadcast({ quit: quitter.name });
    });
  }
}
function sendMessage(session: UserSession, data: string) {
  try {
    session.webSocket.send(data);
    return true;
  } catch (err) {
    console.error(err);
  }
  return false;
}
