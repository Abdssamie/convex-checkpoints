/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  test("stores submitted events in the audit log", async () => {
    const t = initConvexTest();
    const eventId = await t.mutation(api.lib.submit, {
      name: "post.created",
      userId: "user1",
      payload: { postId: "post1" },
      occurredAt: 123,
    });

    expect(eventId).toBeDefined();

    const events = await t.query(api.lib.listByUser, { userId: "user1" });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("post.created");
    expect(events[0].payload).toEqual({ postId: "post1" });
  });

  test("deduplicates events by idempotency key", async () => {
    const t = initConvexTest();
    const firstId = await t.mutation(api.lib.submit, {
      name: "user.signup",
      userId: "user1",
      idempotencyKey: "signup:user1",
    });
    const secondId = await t.mutation(api.lib.submit, {
      name: "user.signup",
      userId: "user1",
      idempotencyKey: "signup:user1",
    });

    expect(secondId).toBe(firstId);

    const events = await t.query(api.lib.listByName, { name: "user.signup" });
    expect(events).toHaveLength(1);
  });

  test("reports whether an idempotent event was newly created", async () => {
    const t = initConvexTest();
    const first = await t.mutation(api.lib.submitOnce, {
      name: "user.signup",
      userId: "user1",
      idempotencyKey: "signup:user1",
    });
    const second = await t.mutation(api.lib.submitOnce, {
      name: "user.signup",
      userId: "user1",
      idempotencyKey: "signup:user1",
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({
      eventId: first.eventId,
      created: false,
    });
  });
});
