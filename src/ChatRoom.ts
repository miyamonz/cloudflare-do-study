import { Hono } from "hono";
import { Bindings as Env } from ".";
import { websocketHandler } from "./websocketHandler";
// import { RateLimiterClient } from "./RateLimiter";

const app = new Hono();

type UserSession = {
  webSocket: WebSocket;
  // 接続確立後に送る。storageのlistや、name確定後などに送る。
  blockedMessages: string[];
  name?: string;
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

    const handleSession = this.handleSession.bind(this);
    app.get("/websocket", websocketHandler(handleSession));
  }

  async fetch(request: Request) {
    return app.fetch(request);
  }

  // handleSession() implements our WebSocket-based chat protocol.
  async handleSession(webSocket: WebSocket, ip: string) {
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
    // We don't send any messages to the client until it has sent us the initial user info
    // message. Until then, we will queue messages in `session.blockedMessages`.
    const session: UserSession = { webSocket, blockedMessages: [] };
    this.sessions.push(session);

    // Queue "join" messages for all online users, to populate the client's roster.
    this.sessions.forEach((otherSession) => {
      if (otherSession.name) {
        session.blockedMessages.push(
          JSON.stringify({ joined: otherSession.name })
        );
      }
    });

    // Load the last 100 messages from the chat history stored on disk, and send them to the
    // client.
    let storage = await this.storage.list({ reverse: true });
    console.log("length", [...storage.values()].length);

    // [...storage.entries()].forEach(([key, value]) => {
    //   console.log(value);
    // });

    let backlog = [...storage.values()] as string[];
    backlog.reverse();
    backlog.forEach((value) => {
      session.blockedMessages.push(value);
      // webSocket.send(value);
    });

    // Set event handlers to receive messages.
    let receivedUserInfo = false;
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

    // name resolve
    wsApp.use(async (c, next) => {
      const name = c.req.query("name");

      if (name && !receivedUserInfo) {
        session.name = name;
        receivedUserInfo = true;
        session.blockedMessages.forEach((message) => webSocket.send(message));
        this.broadcast({ joined: name });
        session.blockedMessages = [];
        webSocket.send(JSON.stringify({ ready: true }));
      }
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
      if (session.name) {
        this.broadcast({ quit: session.name });
      }
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
      if (session.name) {
        try {
          session.webSocket.send(message);
          return true;
        } catch (err) {
          // Whoops, this connection is dead. Remove it from the list and arrange to notify
          // everyone below.
          session.quit = true;
          quitters.push(session);
          return false;
        }
      } else {
        // This session hasn't sent the initial user info message yet, so we're not sending them
        // messages yet (no secret lurking!). Queue the message to be sent later.
        session.blockedMessages.push(message);
        return true;
      }
    });

    quitters.forEach((quitter) => {
      if (quitter.name) {
        this.broadcast({ quit: quitter.name });
      }
    });
  }
}
