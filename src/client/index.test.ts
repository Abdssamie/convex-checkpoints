import { describe, expect, test, vi } from "vitest";
import { anyApi, type ApiFromModules } from "convex/server";
import { v } from "convex/values";
import { ConvexCheckpoints } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

const checkpoints = new ConvexCheckpoints<{
  "post.created": { userId: string; postId: string };
}>(components.convexCheckpoints);

export const { listByUser } = checkpoints.api();
const postCreatedHandler = vi.fn();
export const submitPostCreated = checkpoints.mutation("post.created", {
  args: {
    userId: v.string(),
    postId: v.string(),
  },
  handler: postCreatedHandler,
});

const signupHandler = vi.fn();
const idempotentCheckpoints = new ConvexCheckpoints<{
  "user.signup": { userId: string };
}>(components.convexCheckpoints);
export const submitSignup = idempotentCheckpoints.mutation("user.signup", {
  args: {
    userId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: signupHandler,
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
    ConvexCheckpoints<{ "post.created": { userId: string; postId: string } }>["submit"]
  >[0],
) {
  void checkpoints.submit(ctx, {
    name: "post.created",
    payload: { userId: "user1", postId: "post1" },
  });

  void checkpoints.submit(ctx, {
    // @ts-expect-error checkpoint names must exist in the checkpoint registry
    name: "user.signup",
    payload: { userId: "user1", postId: "post1" },
  });

  void checkpoints.submit(ctx, {
    name: "post.created",
    // @ts-expect-error payload must match the checkpoint name
    payload: { userId: "user1" },
  });
}

checkpoints.mutation("post.created", {
  args: {
    userId: v.string(),
    postId: v.string(),
  },
  handler: async (_ctx, args) => {
    args.userId satisfies string;
    args.postId satisfies string;
  },
});

checkpoints.mutation("post.created", {
  args: {
    userId: v.string(),
    postId: v.string(),
  },
  // @ts-expect-error checkpoint mutation args are inferred from validators
  handler: async (_ctx, args: { userId: number }) => {
    void args;
  },
});

void assertSubmitTypes;

describe("client tests", () => {
  test("exports submit and list functions from checkpoint definitions", async () => {
    postCreatedHandler.mockClear();
    const t = initConvexTest();
    await t.mutation(testApi.submitPostCreated, {
      userId: "user1",
      postId: "post1",
    });

    expect(postCreatedHandler).toHaveBeenCalledOnce();
    expect(postCreatedHandler.mock.calls[0][1]).toMatchObject({
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
