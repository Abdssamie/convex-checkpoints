/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  test("registers rules and tracks factor progress", async () => {
    const t = initConvexTest();
    const rule = await t.mutation(api.lib.registerRule, {
      name: "credits-after-five-posts",
      factor: "create_post",
      threshold: 5,
      actionName: "add_credits",
    });

    expect(rule.ruleId).toBeDefined();
    expect(rule.created).toBe(true);

    const progress = await t.mutation(api.lib.trackEvent, {
      userId: "user1",
      factor: "create_post",
      increment: 2,
    });

    expect(progress.value).toBe(2);
    expect(progress.completed).toHaveLength(0);

    const stored = await t.query(api.lib.getProgress, {
      userId: "user1",
      factor: "create_post",
    });
    expect(stored?.value).toBe(2);
  });

  test("schedules a completion only when progress crosses the threshold", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.registerRule, {
      name: "credits-after-five-posts",
      factor: "create_post",
      threshold: 5,
      actionName: "add_credits",
    });

    const first = await t.mutation(api.lib.trackEvent, {
      userId: "user1",
      factor: "create_post",
      increment: 4,
    });
    const second = await t.mutation(api.lib.trackEvent, {
      userId: "user1",
      factor: "create_post",
    });
    const third = await t.mutation(api.lib.trackEvent, {
      userId: "user1",
      factor: "create_post",
    });

    expect(first.completed).toHaveLength(0);
    expect(second.completed).toMatchObject([
      {
        ruleName: "credits-after-five-posts",
        actionName: "add_credits",
        threshold: 5,
      },
    ]);
    expect(third.completed).toHaveLength(0);
  });

  test("upserts rules by name", async () => {
    const t = initConvexTest();
    const first = await t.mutation(api.lib.registerRule, {
      name: "welcome-after-signup",
      factor: "signup",
      threshold: 1,
      actionName: "welcome_email",
    });
    const second = await t.mutation(api.lib.registerRule, {
      name: "welcome-after-signup",
      factor: "signup",
      threshold: 2,
      actionName: "welcome_email",
    });

    expect(second).toEqual({
      ruleId: first.ruleId,
      created: false,
    });

    const rules = await t.query(api.lib.listRules, { factor: "signup" });
    expect(rules).toHaveLength(1);
    expect(rules[0].threshold).toBe(2);
  });

  test("enforces user rate limit", async () => {
    const t = initConvexTest();
    for (let i = 0; i < 60; i++) {
      await t.mutation(api.lib.trackEvent, {
        userId: "limited_user",
        factor: "some_factor",
      });
    }

    await expect(
      t.mutation(api.lib.trackEvent, {
        userId: "limited_user",
        factor: "some_factor",
      })
    ).rejects.toThrow("Rate limit exceeded for this user");
  });
});
