import { afterEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("example", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("submit and listByUser", async () => {
    const t = initConvexTest();

    const eventId = await t.mutation(api.example.submit, {
      name: "post.created",
      userId: "user1",
      payload: { userId: "user1", postId: "post1" },
    });
    expect(eventId).toBeDefined();

    const events = await t.query(api.example.listByUser, {
      userId: "user1",
    });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("post.created");
    expect(events[0].payload).toEqual({ userId: "user1", postId: "post1" });
  });

  test("submits HTTP events from event-specific routes", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/events/post.created", {
      method: "POST",
      body: JSON.stringify({
        userId: "user1",
        postId: "post1",
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.created).toBe(true);

    const events = await t.query(api.example.listByUser, {
      userId: "user1",
    });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("post.created");
    expect(events[0].payload).toEqual({
      userId: "user1",
      postId: "post1",
    });
  });

  test("submits HTTP events without registered handlers", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/events/user.signup", {
      method: "POST",
      body: JSON.stringify({
        userId: "user1",
      }),
    });

    expect(response.status).toBe(202);

    const events = await t.query(api.example.listByUser, {
      userId: "user1",
    });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("user.signup");
  });

  test("runs scheduled runAfter action from signup handler", async () => {
    vi.useFakeTimers();
    const t = initConvexTest();

    await t.mutation(api.example.submit, {
      name: "user.signup",
      userId: "user1",
      payload: {
        userId: "user1",
        email: "user1@example.com",
        source: "test",
      },
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

    await t.mutation(api.example.submit, {
      name: "profile.completed",
      userId: "user1",
      payload: {
        userId: "user1",
        fields: ["name", "avatar", "timezone"],
      },
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
