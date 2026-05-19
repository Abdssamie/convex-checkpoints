import {
  httpActionGeneric,
  httpRouter,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import {
  ConvexCheckpoints as EventDispatcher,
  type EventHandler,
} from "../component/eventDispatcher.js";

type EventRegistry = Record<string, unknown>;
type EventName<TEventRegistry extends EventRegistry> = Extract<
  keyof TEventRegistry,
  string
>;

type BaseSubmitArgs = {
  userId?: string;
  idempotencyKey?: string;
  occurredAt?: number;
};

type UntypedSubmitArgs = BaseSubmitArgs & {
  name: string;
  payload?: unknown;
};

type SubmitArgs<
  TEventRegistry extends EventRegistry,
  TEvent extends EventName<TEventRegistry>,
> = BaseSubmitArgs & {
  name: TEvent;
  payload: TEventRegistry[TEvent];
};

export class ConvexCheckpoints<
  TEventRegistry extends EventRegistry,
> extends EventDispatcher<TEventRegistry> {
  constructor(private component: ComponentApi) {
    super();
  }

  public async submit<TEvent extends EventName<TEventRegistry>>(
    ctx: Parameters<ConvexCheckpoints<TEventRegistry>["trigger"]>[0],
    args: SubmitArgs<TEventRegistry, TEvent>,
  ) {
    const result = await ctx.runMutation(this.component.lib.record, args);
    if (result.created) {
      await this.trigger(ctx, args.name, args.payload);
    }
    return result.eventId;
  }

  public api() {
    return {
      listRecent: queryGeneric({
        args: { limit: v.optional(v.number()) },
        handler: async (ctx, args) => {
          return await ctx.runQuery(this.component.lib.listRecent, args);
        },
      }),
      listByName: queryGeneric({
        args: { name: v.string(), limit: v.optional(v.number()) },
        handler: async (ctx, args) => {
          return await ctx.runQuery(this.component.lib.listByName, args);
        },
      }),
      listByUser: queryGeneric({
        args: { userId: v.string(), limit: v.optional(v.number()) },
        handler: async (ctx, args) => {
          return await ctx.runQuery(this.component.lib.listByUser, args);
        },
      }),
    };
  }

  public http(path = "/events") {
    const http = httpRouter();
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const args = await readSubmitArgsFromBody(request);
        if (args === null) {
          return json({ error: "invalid_event" }, 400);
        }

        const result = await this.submitFromArgs(ctx, args);

        return json({ eventId: result.eventId, created: result.created }, 202);
      }),
    });
    http.route({
      path,
      method: "OPTIONS",
      handler: httpActionGeneric(async () => corsResponse()),
    });

    const pathPrefix = path.endsWith("/") ? path : `${path}/`;
    http.route({
      pathPrefix,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const eventName = readEventNameFromPath(request, pathPrefix);
        if (eventName === null) {
          return json({ error: "invalid_event_path" }, 400);
        }

        const args = await readSubmitArgsFromPath(request, eventName);
        if (args === null) {
          return json({ error: "invalid_event" }, 400);
        }

        const result = await this.submitFromArgs(ctx, args);

        return json({ eventId: result.eventId, created: result.created }, 202);
      }),
    });
    http.route({
      pathPrefix,
      method: "OPTIONS",
      handler: httpActionGeneric(async () => corsResponse()),
    });
    return http;
  }

  private async submitFromArgs(
    ctx: Parameters<ConvexCheckpoints<TEventRegistry>["trigger"]>[0],
    args: UntypedSubmitArgs,
  ) {
    const result = await ctx.runMutation(this.component.lib.record, args);
    if (result.created) {
      await this.trigger(
        ctx,
        args.name as EventName<TEventRegistry>,
        args.payload as TEventRegistry[EventName<TEventRegistry>],
      );
    }
    return result;
  }
}

export type { EventHandler };

async function readSubmitArgsFromBody(
  request: Request,
): Promise<UntypedSubmitArgs | null> {
  const event = await readJsonObject(request);
  if (event === null || typeof event.name !== "string") {
    return null;
  }
  return readSubmitArgs(event.name, event, event.payload);
}

async function readSubmitArgsFromPath(
  request: Request,
  name: string,
): Promise<UntypedSubmitArgs | null> {
  const event = await readJsonObject(request);
  if (event === null) {
    return null;
  }

  return readSubmitArgs(name, event, event);
}

function readSubmitArgs(
  name: string,
  event: Record<string, unknown>,
  payload: unknown,
): UntypedSubmitArgs | null {
  if (event.userId !== undefined && typeof event.userId !== "string") {
    return null;
  }
  if (
    event.idempotencyKey !== undefined &&
    typeof event.idempotencyKey !== "string"
  ) {
    return null;
  }
  if (event.occurredAt !== undefined && typeof event.occurredAt !== "number") {
    return null;
  }

  return {
    name,
    userId: event.userId,
    payload,
    idempotencyKey: event.idempotencyKey,
    occurredAt: event.occurredAt,
  };
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  return body as Record<string, unknown>;
}

function readEventNameFromPath(request: Request, pathPrefix: string) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(pathPrefix)) {
    return null;
  }
  const encodedEventName = path.slice(pathPrefix.length);
  if (encodedEventName.length === 0 || encodedEventName.includes("/")) {
    return null;
  }

  try {
    return decodeURIComponent(encodedEventName);
  } catch {
    return null;
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
