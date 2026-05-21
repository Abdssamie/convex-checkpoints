import {
  httpActionGeneric,
  httpRouter,
  queryGeneric,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  type AnyComponents,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";

export type CheckpointCompletion = {
  userId: string;
  factor: string;
  ruleName: string;
  actionName: string;
  value: number;
  threshold: number;
  completedAt: number;
  occurredAt?: number;
  payload?: unknown;
};

type CompletionCallback = FunctionReference<
  "mutation" | "action",
  "public" | "internal",
  CheckpointCompletion,
  null
>;

type RegisterRuleArgs = {
  name: string;
  factor: string;
  threshold: number;
  actionName: string;
};

type TrackEventArgs = {
  userId: string;
  factor: string;
  increment?: number;
  payload?: unknown;
  occurredAt?: number;
};

type HttpOptions = {
  token?: string;
  authorize?: (request: Request) => boolean | Promise<boolean>;
};

type ConvexCheckpointsOptions = {
  onComplete: CompletionCallback;
};

export class ConvexCheckpoints<
  TDataModel extends GenericDataModel = GenericDataModel,
> {
  constructor(
    component: ComponentApi,
    options: ConvexCheckpointsOptions,
  );
  constructor(
    component: AnyComponents[string],
    options: ConvexCheckpointsOptions,
  );
  constructor(
    private component: ComponentApi | AnyComponents[string],
    private options: ConvexCheckpointsOptions,
  ) {}

  public async registerRule(
    ctx: GenericMutationCtx<TDataModel>,
    args: RegisterRuleArgs,
  ) {
    return await ctx.runMutation(this.component.lib.registerRule, {
      name: args.name,
      factor: args.factor,
      threshold: args.threshold,
      actionName: args.actionName,
    });
  }

  public async trackEvent(
    ctx: GenericMutationCtx<TDataModel>,
    args: TrackEventArgs,
  ) {
    const result = await ctx.runMutation(this.component.lib.trackEvent, args);
    await this.scheduleCompletions(ctx, args, result.completed, result.value);
    return result;
  }

  public api() {
    return {
      listRules: queryGeneric({
        args: { factor: v.optional(v.string()), limit: v.optional(v.number()) },
        handler: async (ctx, args) => {
          return await ctx.runQuery(this.component.lib.listRules, args);
        },
      }),
      getProgress: queryGeneric({
        args: { userId: v.string(), factor: v.string() },
        handler: async (ctx, args) => {
          return await ctx.runQuery(this.component.lib.getProgress, args);
        },
      }),
      listProgressForUser: queryGeneric({
        args: { userId: v.string(), limit: v.optional(v.number()) },
        handler: async (ctx, args) => {
          return await ctx.runQuery(
            this.component.lib.listProgressForUser,
            args,
          );
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

        const args = await readTrackEventArgsFromBody(request);
        if (args === null) {
          return json({ error: "invalid_checkpoint_event" }, 400);
        }

        const result = await this.trackEventFromAction(ctx, args);
        return json(result, 202);
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

        const factor = readFactorFromPath(request, pathPrefix);
        if (factor === null) {
          return json({ error: "invalid_checkpoint_path" }, 400);
        }

        const args = await readTrackEventArgsFromPath(request, factor);
        if (args === null) {
          return json({ error: "invalid_checkpoint_event" }, 400);
        }

        const result = await this.trackEventFromAction(ctx, args);
        return json(result, 202);
      }),
    });
    http.route({
      pathPrefix,
      method: "OPTIONS",
      handler: httpActionGeneric(async () => corsResponse()),
    });
    return http;
  }

  private async trackEventFromAction(
    ctx: GenericActionCtx<GenericDataModel>,
    args: TrackEventArgs,
  ) {
    const result = await ctx.runMutation(this.component.lib.trackEvent, args);
    await this.scheduleCompletions(ctx, args, result.completed, result.value);
    return result;
  }

  private async scheduleCompletions(
    ctx: Pick<
      GenericMutationCtx<TDataModel> | GenericActionCtx<GenericDataModel>,
      "scheduler"
    >,
    event: TrackEventArgs,
    completed: Array<{
      ruleName: string;
      actionName: string;
      threshold: number;
    }>,
    value: number,
  ) {
    const completedAt = Date.now();
    for (const completion of completed) {
      await ctx.scheduler.runAfter(
        0,
        this.options.onComplete,
        {
          userId: event.userId,
          factor: event.factor,
          ruleName: completion.ruleName,
          actionName: completion.actionName,
          value,
          threshold: completion.threshold,
          completedAt,
          occurredAt: event.occurredAt,
          payload: event.payload,
        },
      );
    }
  }
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

async function readTrackEventArgsFromBody(
  request: Request,
): Promise<TrackEventArgs | null> {
  const checkpoint = await readJsonObject(request);
  if (checkpoint === null || typeof checkpoint.factor !== "string") {
    return null;
  }
  return readTrackEventArgs(checkpoint.factor, checkpoint, checkpoint.payload);
}

async function readTrackEventArgsFromPath(
  request: Request,
  factor: string,
): Promise<TrackEventArgs | null> {
  const checkpoint = await readJsonObject(request);
  if (checkpoint === null) {
    return null;
  }

  return readTrackEventArgs(factor, checkpoint, checkpoint);
}

function readTrackEventArgs(
  factor: string,
  checkpoint: Record<string, unknown>,
  payload: unknown,
): TrackEventArgs | null {
  if (typeof checkpoint.userId !== "string") {
    return null;
  }
  if (
    checkpoint.increment !== undefined &&
    typeof checkpoint.increment !== "number"
  ) {
    return null;
  }
  if (
    checkpoint.occurredAt !== undefined &&
    typeof checkpoint.occurredAt !== "number"
  ) {
    return null;
  }

  return {
    userId: checkpoint.userId,
    factor,
    increment: checkpoint.increment,
    occurredAt: checkpoint.occurredAt,
    payload,
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

function readFactorFromPath(request: Request, pathPrefix: string) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(pathPrefix)) {
    return null;
  }
  const encodedFactor = path.slice(pathPrefix.length);
  if (encodedFactor.length === 0 || encodedFactor.includes("/")) {
    return null;
  }

  try {
    return decodeURIComponent(encodedFactor);
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
