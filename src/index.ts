export { HelloDurable } from "./HelloDurable";
export { ChatRoom } from "./ChatRoom";

import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";

export type Bindings = {
  // DB: D1Database;
  rooms: DurableObjectNamespace;
  HELLO_DURABLE: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app
  .get("/", serveStatic({ root: "../dist/" }))
  .post("/api/room", async (c) => {
    // The request is for just "/api/room", with no ID.
    // POST to /api/room creates a private room.
    let id = c.env.rooms.newUniqueId();
    c.header("Access-Control-Allow-Origin", "*");
    return c.text(id.toString());
  })
  .get("/api/room/:id/*", async (c) => {
    const roomName = c.req.param("id");

    // Each Durable Object has a 256-bit unique ID. IDs can be derived from string names, or
    // chosen randomly by the system.
    let id;
    if (roomName.match(/^[0-9a-f]{64}$/)) {
      // The name is 64 hex digits, so let's assume it actually just encodes an ID. We use this
      // for private rooms. `idFromString()` simply parses the text as a hex encoding of the raw
      // ID (and verifies that this is a valid ID for this namespace).
      id = c.env.rooms.idFromString(roomName);
    } else if (roomName.length <= 32) {
      // Treat as a string room name (limited to 32 characters). `idFromName()` consistently
      // derives an ID from a string.
      id = c.env.rooms.idFromName(roomName);
    } else {
      return c.text("Name too long", { status: 404 });
    }

    const roomObject = c.env.rooms.get(id);

    // Compute a new URL with `/api/room/<name>` removed. We'll forward the rest of the path
    // to the Durable Object.
    const newUrl = new URL(c.req.url);
    const paths = c.req.path.split("/");
    newUrl.pathname = "/" + paths.slice(4).join("/");
    // Send the request to the object. The `fetch()` method of a Durable Object stub has the
    // same signature as the global `fetch()` function, but the request is always sent to the
    // object, regardless of the request's URL.
    return roomObject.fetch(newUrl.toString(), c.req.raw);
  });

export default app;
