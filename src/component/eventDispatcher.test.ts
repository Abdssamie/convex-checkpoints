import { describe, expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { ConvexCheckpoints } from "./eventDispatcher.js";

type Events = {
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
  } as unknown as Parameters<ConvexCheckpoints<Events>["trigger"]>[0];
}

describe("ConvexCheckpoints event dispatcher", () => {
  test("runs the matching event", async () => {
    const checkpoints = new ConvexCheckpoints<Events>();
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
    const checkpoints = new ConvexCheckpoints<Events>();
    const ctx = createCtx();

    await checkpoints.trigger(ctx, "post.created", {
      userId: "user1",
      postId: "post1",
    });

    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  test("runs every handler registered for the same event", async () => {
    const checkpoints = new ConvexCheckpoints<Events>();
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
