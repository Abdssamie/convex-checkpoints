import { afterEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

type Rule = { name: string };

describe("example", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("configures rules and tracks progress", async () => {
    const t = initConvexTest();

    await t.mutation(api.example.configureRules, {});
    const rules = await t.query(api.example.listRules, {});
    expect(rules.map((rule: Rule) => rule.name).sort()).toEqual([
      "badge-after-profile-completion",
      "credits-after-five-posts",
      "welcome-after-signup",
    ]);

    await t.mutation(api.example.submitPostCreated, {
      userId: "user1",
      postId: "post1",
      title: "Test post",
    });

    const progress = await t.query(api.example.getProgress, {
      userId: "user1",
      factor: "create_post",
    });
    expect(progress?.value).toBe(1);
  });

  test("submits HTTP checkpoint events from factor-specific routes", async () => {
    const t = initConvexTest();
    await t.mutation(api.example.configureRules, {});

    const response = await t.fetch("/checkpoints/create_post", {
      method: "POST",
      headers: { authorization: "Bearer checkpoint-secret" },
      body: JSON.stringify({
        userId: "user1",
        postId: "post1",
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.value).toBe(1);

    const progress = await t.query(api.example.getProgress, {
      userId: "user1",
      factor: "create_post",
    });
    expect(progress?.value).toBe(1);
  });

  test("rejects HTTP checkpoint events without authorization", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/checkpoints/create_post", {
      method: "POST",
      body: JSON.stringify({
        userId: "user1",
      }),
    });

    expect(response.status).toBe(401);

    const progress = await t.query(api.example.getProgress, {
      userId: "user1",
      factor: "create_post",
    });
    expect(progress).toBeNull();
  });

  test("allows Authorization header in HTTP checkpoint preflight", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/checkpoints/create_post", {
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );
  });

  test("runs delayed welcome callback after signup", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();

    await t.mutation(api.example.submitSignup, {
      userId: "user1",
      email: "user1@example.com",
      source: "test",
    });

    let actions = await t.query(api.example.listDebugActions, {
      userId: "user1",
    });
    expect(actions.map((action) => action.action)).not.toContain(
      "welcome_email_sent",
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    actions = await t.query(api.example.listDebugActions, {
      userId: "user1",
    });
    expect(actions.map((action) => action.action)).toContain(
      "welcome_email_sent",
    );
  });

  test("grants credits after creating five posts", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();

    for (let i = 0; i < 5; i += 1) {
      await t.mutation(api.example.submitPostCreated, {
        userId: "user1",
        postId: `post${i}`,
        title: "Test post",
      });
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const stats = await t.query(api.example.getStats, {
      userId: "user1",
    });
    expect(stats?.postsCreated).toBe(5);
    expect(stats?.credits).toBe(100);

    const actions = await t.query(api.example.listDebugActions, {
      userId: "user1",
    });
    expect(actions.map((action) => action.action)).toContain(
      "credits_awarded",
    );
  });
});
