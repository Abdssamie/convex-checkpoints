import { describe, expect, test, vi } from "vitest";
import { anyApi, mutationGeneric, type ApiFromModules } from "convex/server";
import { v } from "convex/values";
import { ConvexCheckpoints } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

const events = new ConvexCheckpoints<{
  "post.created": { postId: string };
}>(components.convexCheckpoints);

events.on("post.created", async () => {});

export const { listByUser } = events.api();
export const submitPostCreated = mutationGeneric({
  args: {
    userId: v.string(),
    postId: v.string(),
  },
  handler: async (ctx, args) => {
    return await events.submit(ctx, {
      name: "post.created",
      userId: args.userId,
      payload: { postId: args.postId },
    });
  },
});

const signupHandler = vi.fn();
const idempotentEvents = new ConvexCheckpoints<{
  "user.signup": { userId: string };
}>(components.convexCheckpoints);
idempotentEvents.on("user.signup", signupHandler);
export const submitSignup = mutationGeneric({
  args: {
    userId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await idempotentEvents.submit(ctx, {
      name: "user.signup",
      userId: args.userId,
      payload: { userId: args.userId },
      idempotencyKey: args.idempotencyKey,
    });
  },
});

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "index.test": {
      submitPostCreated: typeof submitPostCreated;
      submitSignup: typeof submitSignup;
      listByUser: typeof listByUser;
    };
  }>
)["index.test"];

function assertSubmitTypes(
  ctx: Parameters<ConvexCheckpoints<{ "post.created": { postId: string } }>["submit"]>[0],
) {
  void events.submit(ctx, {
    name: "post.created",
    payload: { postId: "post1" },
  });

  void events.submit(ctx, {
    // @ts-expect-error event names must exist in the event registry
    name: "user.signup",
    payload: { postId: "post1" },
  });

  void events.submit(ctx, {
    name: "post.created",
    // @ts-expect-error payload must match the event name
    payload: { userId: "user1" },
  });
}

void assertSubmitTypes;

describe("client tests", () => {
  test("exports submit and list functions from event definitions", async () => {
    const t = initConvexTest();
    await t.mutation(testApi.submitPostCreated, {
      userId: "user1",
      postId: "post1",
    });

    const eventsForUser = await t.query(testApi.listByUser, { userId: "user1" });
    expect(eventsForUser).toHaveLength(1);
    expect(eventsForUser[0].name).toBe("post.created");
  });

  test("does not re-run handlers for duplicate idempotency keys", async () => {
    signupHandler.mockClear();
    const t = initConvexTest();
    await t.mutation(testApi.submitSignup, {
      userId: "user1",
      idempotencyKey: "signup:user1",
    });
    await t.mutation(testApi.submitSignup, {
      userId: "user1",
      idempotencyKey: "signup:user1",
    });

    expect(signupHandler).toHaveBeenCalledOnce();
  });
});
