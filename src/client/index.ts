import { httpActionGeneric, httpRouter, queryGeneric } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import {
  ConvexCheckpoints as CheckpointDispatcher,
  type CheckpointHandler,
} from "../component/checkpointDispatcher.js";

type CheckpointRegistry = Record<string, unknown>;
type CheckpointName<TCheckpointRegistry extends CheckpointRegistry> = Extract<
  keyof TCheckpointRegistry,
  string
>;

type BaseSubmitArgs = {
  userId?: string;
  idempotencyKey?: string;
  reachedAt?: number;
};

type UntypedSubmitArgs = BaseSubmitArgs & {
  name: string;
  payload?: unknown;
};

type SubmitArgs<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
> = BaseSubmitArgs & {
  name: TCheckpoint;
  payload: TCheckpointRegistry[TCheckpoint];
};

export class ConvexCheckpoints<
  TCheckpointRegistry extends CheckpointRegistry,
> extends CheckpointDispatcher<TCheckpointRegistry> {
  constructor(private component: ComponentApi) {
    super();
  }

  public async submit<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    ctx: Parameters<ConvexCheckpoints<TCheckpointRegistry>["trigger"]>[0],
    args: SubmitArgs<TCheckpointRegistry, TCheckpoint>,
  ) {
    const result = await ctx.runMutation(this.component.lib.record, args);
    if (result.created) {
      await this.trigger(ctx, args.name, args.payload);
    }
    return result.checkpointId;
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

  public http(path = "/checkpoints") {
    const http = httpRouter();
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const args = await readSubmitArgsFromBody(request);
        if (args === null) {
          return json({ error: "invalid_checkpoint" }, 400);
        }

        const result = await this.submitFromArgs(ctx, args);

        return json(
          { checkpointId: result.checkpointId, created: result.created },
          202,
        );
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
        const checkpointName = readCheckpointNameFromPath(request, pathPrefix);
        if (checkpointName === null) {
          return json({ error: "invalid_checkpoint_path" }, 400);
        }

        const args = await readSubmitArgsFromPath(request, checkpointName);
        if (args === null) {
          return json({ error: "invalid_checkpoint" }, 400);
        }

        const result = await this.submitFromArgs(ctx, args);

        return json(
          { checkpointId: result.checkpointId, created: result.created },
          202,
        );
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
    ctx: Parameters<ConvexCheckpoints<TCheckpointRegistry>["trigger"]>[0],
    args: UntypedSubmitArgs,
  ) {
    const result = await ctx.runMutation(this.component.lib.record, args);
    if (result.created) {
      await this.trigger(
        ctx,
        args.name as CheckpointName<TCheckpointRegistry>,
        args.payload as TCheckpointRegistry[CheckpointName<TCheckpointRegistry>],
      );
    }
    return result;
  }
}

export type { CheckpointHandler };

async function readSubmitArgsFromBody(
  request: Request,
): Promise<UntypedSubmitArgs | null> {
  const checkpoint = await readJsonObject(request);
  if (checkpoint === null || typeof checkpoint.name !== "string") {
    return null;
  }
  return readSubmitArgs(checkpoint.name, checkpoint, checkpoint.payload);
}

async function readSubmitArgsFromPath(
  request: Request,
  name: string,
): Promise<UntypedSubmitArgs | null> {
  const checkpoint = await readJsonObject(request);
  if (checkpoint === null) {
    return null;
  }

  return readSubmitArgs(name, checkpoint, checkpoint);
}

function readSubmitArgs(
  name: string,
  checkpoint: Record<string, unknown>,
  payload: unknown,
): UntypedSubmitArgs | null {
  if (
    checkpoint.userId !== undefined &&
    typeof checkpoint.userId !== "string"
  ) {
    return null;
  }
  if (
    checkpoint.idempotencyKey !== undefined &&
    typeof checkpoint.idempotencyKey !== "string"
  ) {
    return null;
  }
  if (
    checkpoint.reachedAt !== undefined &&
    typeof checkpoint.reachedAt !== "number"
  ) {
    return null;
  }

  return {
    name,
    userId: checkpoint.userId,
    payload,
    idempotencyKey: checkpoint.idempotencyKey,
    reachedAt: checkpoint.reachedAt,
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

function readCheckpointNameFromPath(request: Request, pathPrefix: string) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(pathPrefix)) {
    return null;
  }
  const encodedCheckpointName = path.slice(pathPrefix.length);
  if (
    encodedCheckpointName.length === 0 ||
    encodedCheckpointName.includes("/")
  ) {
    return null;
  }

  try {
    return decodeURIComponent(encodedCheckpointName);
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
