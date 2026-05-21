/// <reference types="vite/client" />

import { describe, expect, test, vi } from "vitest";
import {
  internalMutationGeneric,
  makeFunctionReference,
  mutationGeneric,
} from "convex/server";
import { v } from "convex/values";
import { ConvexCheckpoints, type CheckpointCompletion } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

const onCompleteRef = makeFunctionReference<
  "mutation",
  CheckpointCompletion,
  null
>("index.test:onComplete");
const checkpoints = new ConvexCheckpoints(components.convexCheckpoints, {
  onComplete: onCompleteRef,
});

export const { getProgress, listRules } = checkpoints.api();

export const configureRules = mutationGeneric({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await checkpoints.registerRule(ctx, {
      name: "credits-after-five-posts",
      factor: "create_post",
      threshold: 5,
      actionName: "add_credits",
    });
    return null;
  },
});

export const trackPostCreated = mutationGeneric({
  args: {
    userId: v.string(),
    increment: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await checkpoints.trackEvent(ctx, {
      userId: args.userId,
      factor: "create_post",
      increment: args.increment,
    });
  },
});

const onCompleteHandler = vi.fn();
export const onComplete = internalMutationGeneric({
  args: {
    userId: v.string(),
    factor: v.string(),
    ruleName: v.string(),
    actionName: v.string(),
    value: v.number(),
    threshold: v.number(),
    completedAt: v.number(),
    occurredAt: v.optional(v.number()),
    payload: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    onCompleteHandler(args);
    return null;
  },
});

const configureRulesRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  null
>("index.test:configureRules");
const trackPostCreatedRef = makeFunctionReference<
  "mutation",
  { userId: string; increment?: number },
  { value: number }
>("index.test:trackPostCreated");
const listRulesRef = makeFunctionReference<
  "query",
  Record<string, never>,
  Array<{ name: string }>
>("index.test:listRules");
const getProgressRef = makeFunctionReference<
  "query",
  { userId: string; factor: string },
  { value: number } | null
>("index.test:getProgress");

describe("client wrapper", () => {
  test("registers callback-backed rules and tracks progress", async () => {
    const t = initConvexTest();
    await t.mutation(configureRulesRef, {});

    const rules = await t.query(listRulesRef, {});
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("credits-after-five-posts");

    const result = await t.mutation(trackPostCreatedRef, {
      userId: "user1",
      increment: 2,
    });
    expect(result.value).toBe(2);

    const progress = await t.query(getProgressRef, {
      userId: "user1",
      factor: "create_post",
    });
    expect(progress?.value).toBe(2);
  });

  test("runs the host callback after threshold completion", async () => {
    vi.useFakeTimers();
    onCompleteHandler.mockClear();
    const t = initConvexTest();
    await t.mutation(configureRulesRef, {});

    await t.mutation(trackPostCreatedRef, {
      userId: "user1",
      increment: 4,
    });
    expect(onCompleteHandler).not.toHaveBeenCalled();

    await t.mutation(trackPostCreatedRef, {
      userId: "user1",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(onCompleteHandler).toHaveBeenCalledOnce();
    expect(onCompleteHandler.mock.calls[0][0]).toMatchObject({
      userId: "user1",
      factor: "create_post",
      ruleName: "credits-after-five-posts",
      actionName: "add_credits",
      value: 5,
      threshold: 5,
    });

    vi.useRealTimers();
  });
});
