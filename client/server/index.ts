import { Hono } from "hono";

type Bindings = {
  // DB: D1Database;
  rooms: DurableObjectNamespace;
  HELLO_DURABLE: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();
const route = app
  .get("/", async (c) => {
    const env = c.env;
    console.log(env.HELLO_DURABLE);
    if (!env.HELLO_DURABLE) {
      return new Response("HELLO_DURABLE not found");
    }
    const id = env.HELLO_DURABLE.idFromName("miyamonz");
    const stub = env.HELLO_DURABLE.get(id);
    const response = await stub.fetch("http://example.com");
    const text = await response.text();
    return new Response(text);
  })
  .post("room", async (c) => {
    // The request is for just "/api/room", with no ID.
    // POST to /api/room creates a private room.
    let id = c.env.rooms.newUniqueId();
    c.header("Access-Control-Allow-Origin", "*");
    console.log("id", id.toString());
    return c.text(id.toString());
    // return new Response(id.toString(), {
    //   headers: { "Access-Control-Allow-Origin": "*" },
    // });
  })
  .get("room/:id/*", async (c) => {
    // OK, the request is for `/api/room/<name>/...`. It's time to route to the Durable Object
    // for the specific room.
    const name = c.req.param("id");
    console.log("name", name);

    // Each Durable Object has a 256-bit unique ID. IDs can be derived from string names, or
    // chosen randomly by the system.
    let id;
    if (name.match(/^[0-9a-f]{64}$/)) {
      // The name is 64 hex digits, so let's assume it actually just encodes an ID. We use this
      // for private rooms. `idFromString()` simply parses the text as a hex encoding of the raw
      // ID (and verifies that this is a valid ID for this namespace).
      id = c.env.rooms.idFromString(name);
    } else if (name.length <= 32) {
      // Treat as a string room name (limited to 32 characters). `idFromName()` consistently
      // derives an ID from a string.
      id = c.env.rooms.idFromName(name);
    } else {
      // return new Response("Name too long", { status: 404 });
      return c.text("Name too long", { status: 404 });
    }

    let roomObject = c.env.rooms.get(id);
    console.log({ id, roomObject });

    // Compute a new URL with `/api/room/<name>` removed. We'll forward the rest of the path
    // to the Durable Object.
    let newUrl = new URL(c.req.url);
    const path = c.req.path.split("/");
    newUrl.pathname = "/" + path.slice(4).join("/");

    // Send the request to the object. The `fetch()` method of a Durable Object stub has the
    // same signature as the global `fetch()` function, but the request is always sent to the
    // object, regardless of the request's URL.
    console.log(c.req.path, newUrl.toString());
    // return roomObject.fetch(newUrl.toString(), c.req.raw);

    const res = await roomObject.fetch(newUrl.toString(), c.req.raw);
    console.log(res);
    return res;
  });

export type AppType = typeof route;
export default app;
