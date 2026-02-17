import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A2AClient } from "../a2a-client";
import { A2ATaskDelegator } from "../a2a-delegator";
import type { A2AMessage } from "../types/a2a-types";

const API_URL = "http://localhost:9300";
const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getHeader(init: RequestInit | undefined, key: string): string | null {
  return new Headers(init?.headers).get(key);
}

function sampleMessage(text: string): A2AMessage {
  return {
    role: "user",
    parts: [{ type: "text", text }],
  };
}

describe("A2A token resolution and retry behavior", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("prefers tokenResolver over static runtime token", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { taskId: "task_1", agentId: "agent_google" }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "sk_test_key",
      tokenResolver: () => "srt_dynamic",
    });
    client.setRuntimeToken("srt_static");

    await client.sendBySkill({
      skill: "google:docs:create",
      message: sampleMessage("create doc"),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(getHeader(init, "Authorization")).toBe("Bearer srt_dynamic");
  });

  it("falls back to static runtime token when resolver returns undefined", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { taskId: "task_2", agentId: "agent_google" }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "sk_test_key",
      tokenResolver: () => undefined,
    });
    client.setRuntimeToken("srt_static");

    await client.sendBySkill({
      skill: "google:docs:create",
      message: sampleMessage("create doc"),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(getHeader(init, "Authorization")).toBe("Bearer srt_static");
  });

  it("uses API-key headers when authToken is non-JWT and no runtime token is present", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "task_db_1" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "sk_test_key",
    });

    await client.registerTask({
      targetCapability: "google:docs:create",
      input: { title: "test" },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(getHeader(init, "X-API-Key")).toBe("sk_test_key");
    expect(getHeader(init, "X-Device-Fingerprint")).toBe("sekuire-typescript-sdk");
    expect(getHeader(init, "Authorization")).toBeNull();
  });

  it("uses bearer Authorization when authToken looks like a JWT", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "task_db_2" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "aaa.bbb.ccc",
    });

    await client.registerTask({
      targetCapability: "google:docs:create",
      input: { title: "test" },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(getHeader(init, "Authorization")).toBe("Bearer aaa.bbb.ccc");
    expect(getHeader(init, "X-API-Key")).toBeNull();
  });

  it("refreshes and retries once when runtime token gets 401", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: "Unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "task_db_3" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    let runtimeToken = "srt_old";
    const onUnauthorized = vi.fn(async () => {
      runtimeToken = "srt_new";
    });

    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "sk_test_key",
      tokenResolver: () => runtimeToken,
      onUnauthorized,
    });

    const result = await client.registerTask({
      targetCapability: "google:docs:create",
      input: { title: "test" },
    });

    expect(result).toEqual({ id: "task_db_3" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(getHeader(firstInit, "Authorization")).toBe("Bearer srt_old");
    expect(getHeader(secondInit, "Authorization")).toBe("Bearer srt_new");
  });

  it("returns original 401 result when no onUnauthorized handler is set", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: "Unauthorized" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "sk_test_key",
      tokenResolver: () => "srt_old",
    });

    const result = await client.registerTask({
      targetCapability: "google:docs:create",
      input: { title: "test" },
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns original 401 result when onUnauthorized fails", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: "Unauthorized" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const onUnauthorized = vi.fn(async () => {
      throw new Error("refresh failed");
    });
    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "sk_test_key",
      tokenResolver: () => "srt_old",
      onUnauthorized,
    });

    const result = await client.registerTask({
      targetCapability: "google:docs:create",
      input: { title: "test" },
    });

    expect(result).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call onUnauthorized when request did not use a runtime token", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: "Unauthorized" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const onUnauthorized = vi.fn(async () => {});
    const client = new A2AClient({
      baseUrl: API_URL,
      authToken: "sk_test_key",
      onUnauthorized,
    });

    const result = await client.registerTask({
      targetCapability: "google:docs:create",
      input: { title: "test" },
    });

    expect(result).toBeNull();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards tokenResolver and onUnauthorized through A2ATaskDelegator", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { message: "Unauthorized", error: "request_failed" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(500, { message: "Route failed", error: "request_failed" }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    let runtimeToken = "srt_old";
    const onUnauthorized = vi.fn(async () => {
      runtimeToken = "srt_new";
    });

    const delegator = new A2ATaskDelegator({
      apiUrl: API_URL,
      authToken: "sk_test_key",
      workspaceId: "ws_local",
      agentId: "agent_slack",
      tokenResolver: () => runtimeToken,
      onUnauthorized,
    });

    const result = await delegator.delegate({
      skill: "google:docs:create",
      message: "create doc",
    });

    expect(result.status).toBe("failed");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(getHeader(firstInit, "Authorization")).toBe("Bearer srt_old");
    expect(getHeader(secondInit, "Authorization")).toBe("Bearer srt_new");
  });
});
