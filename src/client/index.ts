import {
  actionGeneric,
  httpActionGeneric,
  httpRouter,
  mutationGeneric,
  queryGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
} from "convex/server";
import { v, type ObjectType, type PropertyValidators } from "convex/values";
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

type HttpOptions = {
  token?: string;
  authorize?: (request: Request) => boolean | Promise<boolean>;
};

type CheckpointMeta<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
> = {
  checkpoint: TCheckpoint;
  checkpointId: string;
};

type CheckpointDefinition<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  TArgsValidator extends PropertyValidators,
  TCtx,
> = {
  args: TArgsValidator;
  handler: (
    ctx: TCtx,
    args: ObjectType<TArgsValidator>,
    meta: CheckpointMeta<TCheckpointRegistry, TCheckpoint>,
  ) => Promise<void> | void;
  payload?: (
    args: ObjectType<TArgsValidator>,
  ) => TCheckpointRegistry[TCheckpoint];
  userId?: (args: ObjectType<TArgsValidator>) => string | undefined;
  idempotencyKey?: (args: ObjectType<TArgsValidator>) => string | undefined;
  reachedAt?: (args: ObjectType<TArgsValidator>) => number | undefined;
};

export class ConvexCheckpoints<
  TCheckpointRegistry extends CheckpointRegistry,
  TDataModel extends GenericDataModel = GenericDataModel,
> extends CheckpointDispatcher<TCheckpointRegistry, TDataModel> {
  constructor(private component: ComponentApi) {
    super();
  }

  public async submit<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    ctx: GenericMutationCtx<TDataModel>,
    args: SubmitArgs<TCheckpointRegistry, TCheckpoint>,
  ) {
    const result = await ctx.runMutation(this.component.lib.record, args);
    if (result.created) {
      await this.triggerMutation(ctx, args.name, args.payload);
    }
    return result.checkpointId;
  }

  public mutation<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
    TArgsValidator extends PropertyValidators,
  >(
    checkpoint: TCheckpoint,
    definition: CheckpointDefinition<
      TCheckpointRegistry,
      TCheckpoint,
      TArgsValidator,
      GenericMutationCtx<TDataModel>
    >,
  ) {
    return mutationGeneric({
      args: definition.args,
      returns: v.string(),
      handler: async (
        ctx: GenericMutationCtx<TDataModel>,
        args: ObjectType<TArgsValidator>,
      ) => {
        return await this.recordAndRunMutation(ctx, checkpoint, args, definition);
      },
    });
  }

  public action<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
    TArgsValidator extends PropertyValidators,
  >(
    checkpoint: TCheckpoint,
    definition: CheckpointDefinition<
      TCheckpointRegistry,
      TCheckpoint,
      TArgsValidator,
      GenericActionCtx<TDataModel>
    >,
  ) {
    return actionGeneric({
      args: definition.args,
      returns: v.string(),
      handler: async (
        ctx: GenericActionCtx<TDataModel>,
        args: ObjectType<TArgsValidator>,
      ) => {
        return await this.recordAndRunAction(ctx, checkpoint, args, definition);
      },
    });
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

  public http(path = "/checkpoints", options: HttpOptions = {}) {
    const http = httpRouter();
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        if (!(await isAuthorized(request, options))) {
          return json({ error: "unauthorized" }, 401);
        }

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
        if (!(await isAuthorized(request, options))) {
          return json({ error: "unauthorized" }, 401);
        }

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
    ctx: GenericActionCtx<GenericDataModel>,
    args: UntypedSubmitArgs,
  ) {
    return await ctx.runMutation(this.component.lib.record, args);
  }

  private async recordAndRunMutation<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
    TArgsValidator extends PropertyValidators,
  >(
    ctx: GenericMutationCtx<TDataModel>,
    checkpoint: TCheckpoint,
    args: ObjectType<TArgsValidator>,
    definition: CheckpointDefinition<
      TCheckpointRegistry,
      TCheckpoint,
      TArgsValidator,
      GenericMutationCtx<TDataModel>
    >,
  ) {
    const result = await ctx.runMutation(
      this.component.lib.record,
      buildRecordArgs(checkpoint, args, definition),
    );

    if (result.created) {
      await definition.handler(ctx, args, {
        checkpoint,
        checkpointId: result.checkpointId,
      });
    }

    return result.checkpointId;
  }

  private async recordAndRunAction<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
    TArgsValidator extends PropertyValidators,
  >(
    ctx: GenericActionCtx<TDataModel>,
    checkpoint: TCheckpoint,
    args: ObjectType<TArgsValidator>,
    definition: CheckpointDefinition<
      TCheckpointRegistry,
      TCheckpoint,
      TArgsValidator,
      GenericActionCtx<TDataModel>
    >,
  ) {
    const result = await ctx.runMutation(
      this.component.lib.record,
      buildRecordArgs(checkpoint, args, definition),
    );

    if (result.created) {
      await definition.handler(ctx, args, {
        checkpoint,
        checkpointId: result.checkpointId,
      });
    }

    return result.checkpointId;
  }
}

export type { CheckpointHandler };

function buildRecordArgs<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  TArgsValidator extends PropertyValidators,
  TCtx,
>(
  name: TCheckpoint,
  args: ObjectType<TArgsValidator>,
  definition: CheckpointDefinition<
    TCheckpointRegistry,
    TCheckpoint,
    TArgsValidator,
    TCtx
  >,
): UntypedSubmitArgs {
  return {
    name,
    userId:
      definition.userId?.(args) ??
      readStringField(args, "userId"),
    payload:
      definition.payload?.(args) ??
      defaultPayload(args),
    idempotencyKey:
      definition.idempotencyKey?.(args) ??
      readStringField(args, "idempotencyKey"),
    reachedAt:
      definition.reachedAt?.(args) ??
      readNumberField(args, "reachedAt"),
  };
}

function defaultPayload<TArgs extends Record<string, unknown>>(args: TArgs) {
  const payload = { ...args };
  delete payload.idempotencyKey;
  delete payload.reachedAt;
  return payload;
}

function readStringField(args: Record<string, unknown>, field: string) {
  const value = args[field];
  return typeof value === "string" ? value : undefined;
}

function readNumberField(args: Record<string, unknown>, field: string) {
  const value = args[field];
  return typeof value === "number" ? value : undefined;
}

async function isAuthorized(request: Request, options: HttpOptions) {
  if ("token" in options) {
    if (typeof options.token !== "string" || options.token.length === 0) {
      return false;
    }
    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${options.token}`) {
      return false;
    }
  }

  if (options.authorize === undefined) {
    return true;
  }
  return await options.authorize(request.clone());
}

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

  if (!isRecord(body)) {
    return null;
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
