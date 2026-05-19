/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  test("stores submitted checkpoints in the audit log", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.record, {
      name: "post.created",
      userId: "user1",
      payload: { postId: "post1" },
      reachedAt: 123,
    });

    expect(result.checkpointId).toBeDefined();
    expect(result.created).toBe(true);

    const checkpoints = await t.query(api.lib.listByUser, { userId: "user1" });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe("post.created");
    expect(checkpoints[0].payload).toEqual({ postId: "post1" });
  });

  test("deduplicates checkpoints by idempotency key", async () => {
    const t = initConvexTest();
    const first = await t.mutation(api.lib.record, {
      name: "user.signup",
      userId: "user1",
      idempotencyKey: "signup:user1",
    });
    const second = await t.mutation(api.lib.record, {
      name: "user.signup",
      userId: "user1",
      idempotencyKey: "signup:user1",
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({
      checkpointId: first.checkpointId,
      created: false,
    });

    const checkpoints = await t.query(api.lib.listByName, {
      name: "user.signup",
    });
    expect(checkpoints).toHaveLength(1);
  });
});
