import { Bindings as Env } from ".";

export class HelloDurable implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    return new Response("Hello Durable Objects!");
  }
}
