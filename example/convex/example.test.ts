import { afterEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("example", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("submit and listByUser", async () => {
    const t = initConvexTest();

    const checkpointId = await t.mutation(api.example.submitPostCreated, {
      userId: "user1",
      postId: "post1",
      title: "Test post",
    });
    expect(checkpointId).toBeDefined();

    const checkpoints = await t.query(api.example.listByUser, {
      userId: "user1",
    });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe("post.created");
    expect(checkpoints[0].payload).toEqual({
      userId: "user1",
      postId: "post1",
      title: "Test post",
    });
  });

  test("submits HTTP checkpoints from checkpoint-specific routes", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/checkpoints/post.created", {
      method: "POST",
      body: JSON.stringify({
        userId: "user1",
        postId: "post1",
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.created).toBe(true);

    const checkpoints = await t.query(api.example.listByUser, {
      userId: "user1",
    });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe("post.created");
    expect(checkpoints[0].payload).toEqual({
      userId: "user1",
      postId: "post1",
    });
  });

  test("submits HTTP checkpoints without registered handlers", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/checkpoints/user.signup", {
      method: "POST",
      body: JSON.stringify({
        userId: "user1",
      }),
    });

    expect(response.status).toBe(202);

    const checkpoints = await t.query(api.example.listByUser, {
      userId: "user1",
    });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe("user.signup");
  });

  test("runs scheduled runAfter action from signup handler", async () => {
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
    expect(actions.map((action) => action.action)).toContain("welcome_email");
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

  test("runs scheduled runAt action from profile completion handler", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();

    await t.mutation(api.example.submitProfileCompleted, {
      userId: "user1",
      fields: ["name", "avatar", "timezone"],
    });

    let actions = await t.query(api.example.listDebugActions, {
      userId: "user1",
    });
    expect(actions.map((action) => action.action)).toContain("profile_badge");
    expect(actions.map((action) => action.action)).not.toContain(
      "profile_audit",
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    actions = await t.query(api.example.listDebugActions, {
      userId: "user1",
    });
    expect(actions.map((action) => action.action)).toContain("profile_audit");
  });
});
