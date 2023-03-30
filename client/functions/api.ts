interface Env {
  //   KV: KVNamespace;
  HELLO_DURABLE: DurableObjectNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  //   const value = await context.env.KV.get("example");
  //   return new Response("hello from api");
  const env = context.env;
  console.log(env.HELLO_DURABLE);
  if (!env.HELLO_DURABLE) {
    return new Response("HELLO_DURABLE not found");
  }
  const id = env.HELLO_DURABLE.idFromName("miyamonz");
  const stub = env.HELLO_DURABLE.get(id);
  const response = await stub.fetch("http://do.fake/");
  const text = await response.text();
  return new Response(text);
};
