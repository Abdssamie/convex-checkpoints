import { describe, expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { ConvexCheckpoints } from "./checkpointDispatcher.js";

type Checkpoints = {
  "user.signup": { userId: string };
  "post.created": { userId: string; postId: string };
};

function createCtx() {
  return {
    scheduler: {
      runAfter: vi.fn(async () => "scheduled"),
      runAt: vi.fn(async () => "scheduled"),
      cancel: vi.fn(async () => undefined),
    },
  } as unknown as Parameters<ConvexCheckpoints<Checkpoints>["trigger"]>[0];
}

describe("ConvexCheckpoints checkpoint dispatcher", () => {
  test("runs the matching checkpoint", async () => {
    const checkpoints = new ConvexCheckpoints<Checkpoints>();
    const sendWelcome = makeFunctionReference<"action">("emails:welcome");
    const ctx = createCtx();

    checkpoints.on("user.signup", async (ctx, payload) => {
      await ctx.scheduler.runAfter(30 * 60 * 1000, sendWelcome, {
        userId: payload.userId,
      });
    });

    await checkpoints.trigger(ctx, "user.signup", {
      userId: "user1",
    });

    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(
      30 * 60 * 1000,
      sendWelcome,
      { userId: "user1" },
    );
  });

  test("does nothing when no handler is registered", async () => {
    const checkpoints = new ConvexCheckpoints<Checkpoints>();
    const ctx = createCtx();

    await checkpoints.trigger(ctx, "post.created", {
      userId: "user1",
      postId: "post1",
    });

    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  test("runs every handler registered for the same checkpoint", async () => {
    const checkpoints = new ConvexCheckpoints<Checkpoints>();
    const first = vi.fn();
    const second = vi.fn();
    const ctx = createCtx();

    checkpoints.on("post.created", first);
    checkpoints.on("post.created", second);

    await checkpoints.trigger(ctx, "post.created", {
      userId: "user1",
      postId: "post1",
    });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
