import { describe, expect, test, vi } from "vitest";
import { anyApi, type ApiFromModules } from "convex/server";
import { ConvexCheckpoints } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

const events = new ConvexCheckpoints<{
  "post.created": { postId: string };
}>(components.convexCheckpoints);

events.on("post.created", async () => {});

export const { submit, listByUser } = events.api();

const signupHandler = vi.fn();
const idempotentEvents = new ConvexCheckpoints<{
  "user.signup": { userId: string };
}>(components.convexCheckpoints);
idempotentEvents.on("user.signup", signupHandler);
export const { submit: submitSignup } = idempotentEvents.api();

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "index.test": {
      submit: typeof submit;
      submitSignup: typeof submitSignup;
      listByUser: typeof listByUser;
    };
  }>
)["index.test"];

describe("client tests", () => {
  test("exports submit and list functions from event definitions", async () => {
    const t = initConvexTest();
    await t.mutation(testApi.submit, {
      name: "post.created",
      userId: "user1",
      payload: { postId: "post1" },
    });

    const events = await t.query(testApi.listByUser, { userId: "user1" });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("post.created");
  });

  test("does not re-run handlers for duplicate idempotency keys", async () => {
    signupHandler.mockClear();
    const t = initConvexTest();
    await t.mutation(testApi.submitSignup, {
      name: "user.signup",
      userId: "user1",
      payload: { userId: "user1" },
      idempotencyKey: "signup:user1",
    });
    await t.mutation(testApi.submitSignup, {
      name: "user.signup",
      userId: "user1",
      payload: { userId: "user1" },
      idempotencyKey: "signup:user1",
    });

    expect(signupHandler).toHaveBeenCalledOnce();
  });
});
