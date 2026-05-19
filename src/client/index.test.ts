import { describe, expect, test, vi } from "vitest";
import { anyApi, mutationGeneric, type ApiFromModules } from "convex/server";
import { v } from "convex/values";
import { ConvexCheckpoints } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

const checkpoints = new ConvexCheckpoints<{
  "post.created": { postId: string };
}>(components.convexCheckpoints);

checkpoints.on("post.created", async () => {});

export const { listByUser } = checkpoints.api();
export const submitPostCreated = mutationGeneric({
  args: {
    userId: v.string(),
    postId: v.string(),
  },
  handler: async (ctx, args) => {
    return await checkpoints.submit(ctx, {
      name: "post.created",
      userId: args.userId,
      payload: { postId: args.postId },
    });
  },
});

const signupHandler = vi.fn();
const idempotentCheckpoints = new ConvexCheckpoints<{
  "user.signup": { userId: string };
}>(components.convexCheckpoints);
idempotentCheckpoints.on("user.signup", signupHandler);
export const submitSignup = mutationGeneric({
  args: {
    userId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await idempotentCheckpoints.submit(ctx, {
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
  ctx: Parameters<
    ConvexCheckpoints<{ "post.created": { postId: string } }>["submit"]
  >[0],
) {
  void checkpoints.submit(ctx, {
    name: "post.created",
    payload: { postId: "post1" },
  });

  void checkpoints.submit(ctx, {
    // @ts-expect-error checkpoint names must exist in the checkpoint registry
    name: "user.signup",
    payload: { postId: "post1" },
  });

  void checkpoints.submit(ctx, {
    name: "post.created",
    // @ts-expect-error payload must match the checkpoint name
    payload: { userId: "user1" },
  });
}

void assertSubmitTypes;

describe("client tests", () => {
  test("exports submit and list functions from checkpoint definitions", async () => {
    const t = initConvexTest();
    await t.mutation(testApi.submitPostCreated, {
      userId: "user1",
      postId: "post1",
    });

    const checkpointsForUser = await t.query(testApi.listByUser, {
      userId: "user1",
    });
    expect(checkpointsForUser).toHaveLength(1);
    expect(checkpointsForUser[0].name).toBe("post.created");
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
