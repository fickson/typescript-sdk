'use strict';

var axios = require('axios');
var fs = require('fs');
var fs$1 = require('fs/promises');
var path = require('path');
var nacl$1 = require('tweetnacl');
var blake3 = require('blake3');
var fs$2 = require('node:fs');
var path$1 = require('node:path');
var uuid = require('uuid');
var EventSource = require('eventsource');
var crypto = require('crypto');
var yaml = require('js-yaml');
var fs$3 = require('node:fs/promises');
var node_module = require('node:module');
var https = require('https');
var http = require('http');
var url = require('url');
var os = require('os');
var zod = require('zod');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs);
var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);
var nacl__namespace = /*#__PURE__*/_interopNamespaceDefault(nacl$1);
var blake3__namespace = /*#__PURE__*/_interopNamespaceDefault(blake3);
var path__namespace$1 = /*#__PURE__*/_interopNamespaceDefault(path$1);
var crypto__namespace = /*#__PURE__*/_interopNamespaceDefault(crypto);
var yaml__namespace = /*#__PURE__*/_interopNamespaceDefault(yaml);
var fs__namespace$1 = /*#__PURE__*/_interopNamespaceDefault(fs$3);
var https__namespace = /*#__PURE__*/_interopNamespaceDefault(https);
var http__namespace = /*#__PURE__*/_interopNamespaceDefault(http);
var os__namespace = /*#__PURE__*/_interopNamespaceDefault(os);

/**
 * A2A Protocol Client
 *
 * Client for interacting with A2A-compliant agents via the Sekuire API.
 */
/**
 * A2A Protocol Client
 *
 * @example
 * ```typescript
 * const client = new A2AClient({
 *   baseUrl: "https://api.sekuire.ai",
 *   authToken: "your-token",
 * });
 *
 * // Auto-discover and send task by skill
 * const result = await client.sendBySkill({
 *   skill: "document:summarize",
 *   message: {
 *     role: "user",
 *     parts: [{ type: "text", text: "Summarize this document" }],
 *   },
 * });
 *
 * // Stream task updates
 * for await (const event of client.subscribe(result.taskId)) {
 *   console.log(event.status, event.artifacts);
 * }
 * ```
 */
class A2AClient {
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.authToken = options.authToken;
        this.timeout = options.timeout ?? 30000;
        this.deviceFingerprint =
            options.deviceFingerprint ||
                process.env.SEKUIRE_DEVICE_FINGERPRINT ||
                "sekuire-typescript-sdk";
        this.tokenResolver = options.tokenResolver;
        this.onUnauthorized = options.onUnauthorized;
    }
    setRuntimeToken(token) {
        this.runtimeToken = token;
    }
    /**
     * Send a task by skill using auto-discovery routing.
     * The API will find an agent with the matching skill and forward the task.
     */
    async sendBySkill(request) {
        const response = await this.fetchTask("/a2a/route", {
            method: "POST",
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new A2AError(error.message || `Request failed: ${response.status}`, error.error || "request_failed");
        }
        return response.json();
    }
    /**
     * Send a message directly to a specific agent.
     */
    async send(agentUrl, message, taskId) {
        const request = {
            jsonrpc: "2.0",
            method: "tasks/send",
            id: Date.now().toString(),
            params: {
                taskId,
                message,
            },
        };
        const response = await fetch(agentUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.authToken}`,
            },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(this.timeout),
        });
        if (!response.ok) {
            throw new A2AError(`Agent request failed: ${response.status}`, "agent_error");
        }
        const result = await response.json();
        if (result.error) {
            throw new A2AError(result.error.message, "jsonrpc_error", result.error.code);
        }
        return result.result;
    }
    /**
     * Send a task via JSON-RPC to the Sekuire API.
     */
    async sendTask(params) {
        return this.jsonRpc("tasks/send", params);
    }
    /**
     * Get task status and details.
     */
    async getTask(taskId) {
        return this.jsonRpc("tasks/get", { taskId });
    }
    /**
     * Cancel a running task.
     */
    async cancelTask(taskId) {
        return this.jsonRpc("tasks/cancel", {
            taskId,
        });
    }
    /**
     * Subscribe to task updates via SSE.
     *
     * @example
     * ```typescript
     * for await (const event of client.subscribe(taskId)) {
     *   console.log(event.status);
     *   if (event.status === "completed") break;
     * }
     * ```
     */
    async *subscribe(taskId) {
        const url = `${this.baseUrl}/a2a/subscribe/${taskId}`;
        const response = await fetch(url, {
            headers: {
                Accept: "text/event-stream",
                Authorization: `Bearer ${this.authToken}`,
            },
        });
        if (!response.ok) {
            throw new A2AError(`SSE connection failed: ${response.status}`, "sse_error");
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new A2AError("No response body", "sse_error");
        }
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (line.startsWith("data:")) {
                        const data = line.slice(5).trim();
                        if (data) {
                            try {
                                const event = JSON.parse(data);
                                yield event;
                                // Stop on terminal states
                                if (["completed", "failed", "canceled"].includes(event.status)) {
                                    return;
                                }
                            }
                            catch {
                                // Ignore parse errors
                            }
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    /**
     * Register a task with sekuire-core (fire-and-forget safe).
     * Used by the delegator to record tasks when falling back to direct mode.
     */
    async registerTask(params) {
        try {
            const response = await this.fetchTask("/api/v1/tasks", {
                method: "POST",
                body: JSON.stringify({
                    target_capability: params.targetCapability,
                    target_agent_id: params.targetAgentId,
                    input: params.input,
                    parent_task_id: params.parentTaskId,
                    trace_id: params.traceId,
                }),
            });
            if (!response.ok) {
                console.warn(`[A2AClient] registerTask failed with status ${response.status}`);
                return null;
            }
            return response.json();
        }
        catch {
            console.warn("[A2AClient] registerTask request failed");
            return null;
        }
    }
    /**
     * Mark a registered task as completed/failed (fire-and-forget safe).
     * Requires a runtime token (set via setRuntimeToken).
     */
    async completeRegisteredTask(taskId, status, output, error) {
        try {
            const response = await this.fetchTask(`/api/v1/tasks/${taskId}/complete`, {
                method: "POST",
                body: JSON.stringify({ status, output, error }),
            });
            if (!response.ok) {
                console.warn(`[A2AClient] completeRegisteredTask failed with status ${response.status}`);
            }
            return response.ok;
        }
        catch {
            console.warn("[A2AClient] completeRegisteredTask request failed");
            return false;
        }
    }
    /**
     * Get an agent's card (capabilities, skills).
     */
    async getAgentCard(agentId) {
        const response = await this.fetch(`/a2a/${agentId}/.well-known/agent.json`, { method: "GET" });
        if (!response.ok) {
            throw new A2AError(`Failed to get agent card: ${response.status}`, "not_found");
        }
        return response.json();
    }
    /**
     * Make a JSON-RPC call to the A2A endpoint.
     */
    async jsonRpc(method, params) {
        const request = {
            jsonrpc: "2.0",
            method,
            id: Date.now().toString(),
            params,
        };
        const response = await this.fetch("/a2a", {
            method: "POST",
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            throw new A2AError(`Request failed: ${response.status}`, "request_failed");
        }
        const result = await response.json();
        if (result.error) {
            throw new A2AError(result.error.message, "jsonrpc_error", result.error.code);
        }
        return result.result;
    }
    async fetch(path, init) {
        return fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.authToken}`,
                ...init.headers,
            },
            signal: AbortSignal.timeout(this.timeout),
        });
    }
    async fetchTask(path, init) {
        const runtimeToken = this.resolveRuntimeToken();
        const response = await this.doFetchTask(path, init, runtimeToken);
        const usedRuntimeToken = !!runtimeToken && runtimeToken.startsWith("srt_");
        if (response.status === 401 && usedRuntimeToken && this.onUnauthorized) {
            try {
                await this.onUnauthorized();
            }
            catch {
                return response;
            }
            return this.doFetchTask(path, init, this.resolveRuntimeToken());
        }
        return response;
    }
    async doFetchTask(path, init, runtimeToken) {
        return fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...this.taskAuthHeaders(runtimeToken),
                ...init.headers,
            },
            signal: AbortSignal.timeout(this.timeout),
        });
    }
    resolveRuntimeToken() {
        return this.tokenResolver?.() ?? this.runtimeToken;
    }
    taskAuthHeaders(runtimeToken) {
        if (runtimeToken) {
            return { Authorization: `Bearer ${runtimeToken}` };
        }
        if (this.isLikelyJwt(this.authToken)) {
            return { Authorization: `Bearer ${this.authToken}` };
        }
        if (this.authToken) {
            return {
                "X-API-Key": this.authToken,
                "X-Device-Fingerprint": this.deviceFingerprint,
            };
        }
        return {};
    }
    isLikelyJwt(token) {
        const parts = token.split(".");
        if (parts.length !== 3) {
            return false;
        }
        return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
    }
}
/**
 * A2A Protocol Error
 */
class A2AError extends Error {
    constructor(message, code, jsonRpcCode) {
        super(message);
        this.code = code;
        this.jsonRpcCode = jsonRpcCode;
        this.name = "A2AError";
    }
}

// --- Sekuire Identity Protocol Types ---
// --- Error Types ---
class SekuireError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'SekuireError';
    }
}
class NetworkError extends SekuireError {
    constructor(message, originalError) {
        super(message, 'NETWORK_ERROR', originalError);
        this.originalError = originalError;
        this.name = 'NetworkError';
    }
}
class ProtocolError extends SekuireError {
    constructor(message, statusCode) {
        super(message, 'PROTOCOL_ERROR', { statusCode });
        this.statusCode = statusCode;
        this.name = 'ProtocolError';
    }
}
class CryptoError extends SekuireError {
    constructor(message) {
        super(message, 'CRYPTO_ERROR');
        this.name = 'CryptoError';
    }
}
class PolicyViolationError extends SekuireError {
    constructor(message, rule) {
        super(message, 'POLICY_VIOLATION');
        this.rule = rule;
        this.name = 'PolicyViolationError';
    }
}

/**
 * A2A Task Delegator
 *
 * Enables agents to delegate tasks to other agents and receive completion callbacks.
 * Provides a complete feedback loop for multi-agent orchestration.
 */
class A2ATaskDelegator {
    constructor(config) {
        this.activeDelegations = new Map();
        this.config = {
            timeout: 60000,
            pollInterval: 1000,
            maxRetries: 0,
            retryDelayMs: 1000,
            retryBackoffMultiplier: 2,
            ...config,
        };
        this.policyGateway = config.policyGateway;
        this.client = new A2AClient({
            baseUrl: config.apiUrl,
            authToken: config.authToken,
            timeout: this.config.timeout,
            tokenResolver: config.tokenResolver,
            onUnauthorized: config.onUnauthorized,
        });
    }
    setRuntimeToken(token) {
        this.client.setRuntimeToken(token);
    }
    async delegate(request) {
        const maxRetries = this.config.maxRetries;
        if (maxRetries <= 0) {
            return this.delegateOnce(request);
        }
        let lastResult;
        let delay = this.config.retryDelayMs;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            lastResult = await this.delegateOnce(request);
            if (lastResult.status !== "failed" || !this.isRetryableError(lastResult.error)) {
                return lastResult;
            }
            if (attempt < maxRetries) {
                if (request.onProgress) {
                    request.onProgress({
                        taskId: lastResult.taskId || "",
                        status: "working",
                        updatedAt: new Date().toISOString(),
                        message: {
                            role: "agent",
                            parts: [{ type: "text", text: `Retry attempt ${attempt + 1}/${maxRetries} after error: ${lastResult.error}` }],
                        },
                    });
                }
                await this.sleep(delay);
                delay = Math.min(delay * this.config.retryBackoffMultiplier, 30000);
            }
        }
        return lastResult;
    }
    isRetryableError(error) {
        if (!error)
            return false;
        const retryablePatterns = [
            "fetch failed",
            "ECONNREFUSED",
            "ETIMEDOUT",
            "ECONNRESET",
            "network",
            "socket hang up",
            "503",
            "502",
            "500",
            "429",
            "rate limit",
            "timeout",
        ];
        const lower = error.toLowerCase();
        return retryablePatterns.some((p) => lower.includes(p.toLowerCase()));
    }
    async delegateOnce(request) {
        const startTime = Date.now();
        if (this.policyGateway) {
            const rateLimitDecision = this.policyGateway.checkRateLimit("request");
            if (!rateLimitDecision.allowed) {
                return {
                    taskId: "",
                    agentId: "",
                    status: "failed",
                    error: rateLimitDecision.violations[0]?.message || "Rate limit exceeded",
                    executionTimeMs: Date.now() - startTime,
                };
            }
        }
        const message = typeof request.message === "string"
            ? {
                role: "user",
                parts: [{ type: "text", text: request.message }],
            }
            : request.message;
        let routeResponse;
        try {
            routeResponse = await this.client.sendBySkill({
                skill: request.skill,
                message,
                contextId: request.contextId,
                parentTaskId: request.parentTaskId,
                traceId: request.traceId,
            });
        }
        catch (err) {
            if (err instanceof A2AError && err.code === "policy_violation") {
                throw new PolicyViolationError(err.message || "Task denied by workspace policy", "workspace_policy");
            }
            if (request.targetUrl) {
                return this.delegateDirect(request, message, startTime);
            }
            const errorMessage = err instanceof A2AError ? err.message : String(err);
            return {
                taskId: "",
                agentId: "",
                status: "failed",
                error: `Delegation failed: ${errorMessage}`,
                executionTimeMs: Date.now() - startTime,
            };
        }
        const { taskId, agentId, traceId } = routeResponse;
        const abortController = new AbortController();
        this.activeDelegations.set(taskId, abortController);
        try {
            const result = await this.waitForCompletion(taskId, request.timeout || this.config.timeout, request.onProgress, abortController.signal);
            return {
                taskId,
                agentId,
                traceId,
                status: result.status.state,
                result: result.history[result.history.length - 1],
                artifacts: result.artifacts,
                executionTimeMs: Date.now() - startTime,
            };
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return {
                taskId,
                agentId,
                traceId,
                status: "failed",
                error: errorMessage,
                executionTimeMs: Date.now() - startTime,
            };
        }
        finally {
            this.activeDelegations.delete(taskId);
        }
    }
    async *delegateWithStreaming(request) {
        const startTime = Date.now();
        const message = typeof request.message === "string"
            ? {
                role: "user",
                parts: [{ type: "text", text: request.message }],
            }
            : request.message;
        let routeResponse;
        try {
            routeResponse = await this.client.sendBySkill({
                skill: request.skill,
                message,
                contextId: request.contextId,
                parentTaskId: request.parentTaskId,
                traceId: request.traceId,
            });
        }
        catch (err) {
            if (err instanceof A2AError && err.code === "policy_violation") {
                throw new PolicyViolationError(err.message || "Task denied by workspace policy", "workspace_policy");
            }
            const errorMessage = err instanceof A2AError ? err.message : String(err);
            return {
                taskId: "",
                agentId: "",
                status: "failed",
                error: `Delegation failed: ${errorMessage}`,
                executionTimeMs: Date.now() - startTime,
            };
        }
        const { taskId, agentId, traceId } = routeResponse;
        yield {
            taskId,
            status: "working",
            updatedAt: new Date().toISOString(),
            message: {
                role: "agent",
                parts: [{ type: "text", text: `Delegated to agent ${agentId}` }],
            },
        };
        let finalTask;
        try {
            for await (const event of this.client.subscribe(taskId)) {
                yield event;
                if (["completed", "failed", "canceled"].includes(event.status)) {
                    finalTask = await this.client.getTask(taskId);
                    break;
                }
            }
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return {
                taskId,
                agentId,
                traceId,
                status: "failed",
                error: errorMessage,
                executionTimeMs: Date.now() - startTime,
            };
        }
        if (!finalTask) {
            finalTask = await this.client.getTask(taskId);
        }
        return {
            taskId,
            agentId,
            traceId,
            status: finalTask.status.state,
            result: finalTask.history[finalTask.history.length - 1],
            artifacts: finalTask.artifacts,
            executionTimeMs: Date.now() - startTime,
        };
    }
    async delegateDirect(request, message, startTime) {
        const targetUrl = request.targetUrl;
        const agentId = request.targetAgentId || "unknown";
        const registered = await this.client.registerTask({
            targetCapability: request.skill,
            targetAgentId: request.targetAgentId,
            parentTaskId: request.parentTaskId,
            traceId: request.traceId,
            input: { skill: request.skill, message },
        });
        const registeredTaskId = registered?.id;
        try {
            const taskId = `a2a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const jsonRpcRequest = {
                jsonrpc: "2.0",
                method: "tasks/send",
                id: taskId,
                params: { taskId, message },
            };
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(jsonRpcRequest),
                signal: AbortSignal.timeout(request.timeout || this.config.timeout),
            });
            if (!response.ok) {
                const errText = await response.text().catch(() => "");
                if (registeredTaskId) {
                    await this.completeRegisteredTaskAndWarn(registeredTaskId, "failed", undefined, { message: errText });
                }
                return {
                    taskId: registeredTaskId || taskId,
                    agentId,
                    status: "failed",
                    error: `Direct call failed: ${response.status} ${errText}`,
                    executionTimeMs: Date.now() - startTime,
                };
            }
            const result = (await response.json());
            if (result.error) {
                if (registeredTaskId) {
                    await this.completeRegisteredTaskAndWarn(registeredTaskId, "failed", undefined, result.error);
                }
                return {
                    taskId: registeredTaskId || taskId,
                    agentId,
                    status: "failed",
                    error: result.error.message,
                    executionTimeMs: Date.now() - startTime,
                };
            }
            const task = result.result;
            const finalStatus = task.status.state;
            const lastMessage = task.history?.[task.history.length - 1];
            if (registeredTaskId) {
                const completionStatus = finalStatus === "completed" ? "completed" : "failed";
                await this.completeRegisteredTaskAndWarn(registeredTaskId, completionStatus, finalStatus === "completed" ? { result: lastMessage } : undefined, finalStatus !== "completed" ? { message: "Task did not complete" } : undefined);
            }
            return {
                taskId: registeredTaskId || task.taskId,
                agentId,
                status: finalStatus,
                result: lastMessage,
                artifacts: task.artifacts,
                executionTimeMs: Date.now() - startTime,
            };
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (registeredTaskId) {
                await this.completeRegisteredTaskAndWarn(registeredTaskId, "failed", undefined, { message: errorMessage });
            }
            return {
                taskId: registeredTaskId || "",
                agentId,
                status: "failed",
                error: `Direct delegation failed: ${errorMessage}`,
                executionTimeMs: Date.now() - startTime,
            };
        }
    }
    async completeRegisteredTaskAndWarn(taskId, status, output, error) {
        const updated = await this.client.completeRegisteredTask(taskId, status, output, error);
        if (!updated) {
            console.warn(`[A2ATaskDelegator] Failed to mark task ${taskId} as ${status}`);
        }
    }
    cancelDelegation(taskId) {
        const controller = this.activeDelegations.get(taskId);
        if (controller) {
            controller.abort();
            this.activeDelegations.delete(taskId);
        }
        this.client.cancelTask(taskId).catch(() => { });
    }
    cancelAllDelegations() {
        for (const [taskId, controller] of this.activeDelegations) {
            controller.abort();
            this.client.cancelTask(taskId).catch(() => { });
        }
        this.activeDelegations.clear();
    }
    async discoverAgents(skill) {
        try {
            const card = await this.client.getAgentCard(skill);
            return [{ agentId: card.agentId, name: card.name }];
        }
        catch {
            return [];
        }
    }
    async waitForCompletion(taskId, timeout, onProgress, signal) {
        const deadline = Date.now() + timeout;
        try {
            for await (const event of this.client.subscribe(taskId)) {
                if (signal?.aborted) {
                    throw new Error("Delegation cancelled");
                }
                if (onProgress) {
                    onProgress(event);
                }
                if (["completed", "failed", "canceled"].includes(event.status)) {
                    return this.client.getTask(taskId);
                }
                if (Date.now() > deadline) {
                    throw new Error("Delegation timeout");
                }
            }
        }
        catch (err) {
            if (err instanceof Error && err.message === "Delegation cancelled") {
                throw err;
            }
            return this.pollForCompletion(taskId, deadline, onProgress, signal);
        }
        return this.client.getTask(taskId);
    }
    async pollForCompletion(taskId, deadline, onProgress, signal) {
        while (Date.now() < deadline) {
            if (signal?.aborted) {
                throw new Error("Delegation cancelled");
            }
            const task = await this.client.getTask(taskId);
            if (onProgress) {
                onProgress({
                    taskId,
                    status: task.status.state,
                    updatedAt: task.status.timestamp,
                    message: task.history[task.history.length - 1],
                    artifacts: task.artifacts,
                });
            }
            if (["completed", "failed", "canceled"].includes(task.status.state)) {
                return task;
            }
            await this.sleep(this.config.pollInterval);
        }
        throw new Error("Delegation timeout");
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
function createDelegator(config) {
    return new A2ATaskDelegator(config);
}

function detectDeploymentUrl() {
    if (typeof process === "undefined" || !process.env) {
        return undefined;
    }
    if (process.env.SEKUIRE_DEPLOYMENT_URL) {
        return process.env.SEKUIRE_DEPLOYMENT_URL;
    }
    if (process.env.FLY_APP_NAME) {
        return `https://${process.env.FLY_APP_NAME}.fly.dev`;
    }
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    if (process.env.HEROKU_APP_NAME) {
        return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
    }
    if (process.env.K_SERVICE && process.env.K_REVISION) {
        const region = process.env.GOOGLE_CLOUD_REGION || "us-central1";
        const project = process.env.GOOGLE_CLOUD_PROJECT;
        if (project) {
            return `https://${process.env.K_SERVICE}-${project}.${region}.run.app`;
        }
    }
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        if (process.env.AWS_LAMBDA_FUNCTION_URL) {
            return process.env.AWS_LAMBDA_FUNCTION_URL;
        }
    }
    if (process.env.WEBSITE_HOSTNAME) {
        return `https://${process.env.WEBSITE_HOSTNAME}`;
    }
    if (process.env.APP_URL) {
        return process.env.APP_URL;
    }
    return undefined;
}

function applyBootstrapResponse(target, data) {
    target.installationId = data.installation_id;
    target.runtimeToken = data.runtime_token;
    if (data.refresh_token) {
        target.refreshToken = data.refresh_token;
    }
    target.credentialsStore?.update({
        installationId: data.installation_id,
        runtimeToken: data.runtime_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
    });
}
class RuntimeCredentialsStore {
    constructor(initial) {
        this.inflightRefresh = null;
        if (initial) {
            this.update(initial);
        }
        if (initial?.apiBaseUrl) {
            this.apiBaseUrl = initial.apiBaseUrl;
        }
    }
    setApiBaseUrl(url) {
        this.apiBaseUrl = url;
    }
    update(partial) {
        if (partial.installationId) {
            this.installationId = partial.installationId;
        }
        if (partial.runtimeToken) {
            this.runtimeToken = partial.runtimeToken;
        }
        if (partial.refreshToken) {
            this.refreshToken = partial.refreshToken;
        }
        if (partial.expiresAt !== undefined) {
            this.expiresAt = partial.expiresAt;
        }
    }
    setRuntimeToken(runtimeToken, expiresAt) {
        this.runtimeToken = runtimeToken;
        if (expiresAt !== undefined) {
            this.expiresAt = expiresAt;
        }
    }
    setInstallationId(installationId) {
        this.installationId = installationId;
    }
    setRefreshToken(refreshToken) {
        this.refreshToken = refreshToken;
    }
    getInstallationId() {
        return this.installationId;
    }
    getRuntimeToken() {
        return this.runtimeToken;
    }
    getRefreshToken() {
        return this.refreshToken;
    }
    getExpiresAt() {
        return this.expiresAt;
    }
    getAll() {
        return {
            installationId: this.installationId,
            runtimeToken: this.runtimeToken,
            refreshToken: this.refreshToken,
            expiresAt: this.expiresAt,
        };
    }
    hasRecoveryCredentials() {
        return !!(this.installationId && this.refreshToken);
    }
    hasRuntimeToken() {
        return !!this.runtimeToken;
    }
    async refreshRuntimeToken(caller) {
        if (this.inflightRefresh) {
            return this.inflightRefresh;
        }
        this.inflightRefresh = this.doRefresh(caller).finally(() => {
            this.inflightRefresh = null;
        });
        return this.inflightRefresh;
    }
    async doRefresh(caller) {
        const installationId = this.installationId;
        const refreshToken = this.refreshToken;
        const apiBaseUrl = this.apiBaseUrl;
        if (!installationId || !refreshToken) {
            throw new Error("Cannot refresh token - missing installation ID or refresh token");
        }
        if (!apiBaseUrl) {
            throw new Error("Cannot refresh token - missing API base URL");
        }
        const response = await fetch(`${apiBaseUrl}/api/v1/installations/${installationId}/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Token refresh failed: ${response.status} - ${body}`);
        }
        const data = await response.json();
        this.runtimeToken = data.runtime_token;
        if (data.expires_at !== undefined) {
            this.expiresAt = data.expires_at;
        }
        console.log(`[${caller || "CredentialsStore"}] Runtime token refreshed successfully`);
    }
}

/**
 * Sekuire Beacon - Deployment Registration & Heartbeat
 *
 * Automatically registers the agent with Sekuire and sends periodic heartbeats
 * to show online status in the Dashboard.
 *
 * Supports two authentication modes:
 * 1. Install Token (recommended): Use an install token from the dashboard
 * 2. API Key: Use an API key for SDK-initiated bootstrap (requires workspace)
 */
// ============================================================================
// Beacon Class
// ============================================================================
class Beacon {
    constructor(config) {
        this.intervalId = null;
        this.installationId = null;
        this.runtimeToken = null;
        this.refreshToken = null;
        this.lastHeartbeat = null;
        this.failedHeartbeats = 0;
        this.degradedMode = false;
        this.recoveredFromEnv = false;
        this.expiresAt = null;
        const storeSnapshot = config.credentialsStore?.getAll() || {};
        const resolvedApiKey = config.apiKey || this.getEnvVar('SEKUIRE_API_KEY') || '';
        const resolvedInstallToken = config.installToken || this.getEnvVar('SEKUIRE_INSTALL_TOKEN');
        const resolvedInstallationId = config.installationId || storeSnapshot.installationId || this.getEnvVar('SEKUIRE_INSTALLATION_ID');
        const resolvedRefreshToken = config.refreshToken || storeSnapshot.refreshToken || this.getEnvVar('SEKUIRE_REFRESH_TOKEN');
        const resolvedRuntimeToken = config.runtimeToken || storeSnapshot.runtimeToken || this.getEnvVar('SEKUIRE_RUNTIME_TOKEN');
        this.config = {
            ...config,
            heartbeatIntervalSeconds: config.heartbeatIntervalSeconds ?? 60,
            apiKey: resolvedApiKey,
            installToken: resolvedInstallToken,
            installationId: resolvedInstallationId,
            refreshToken: resolvedRefreshToken,
            runtimeToken: resolvedRuntimeToken,
            capabilities: config.capabilities ?? [],
        };
        this.credentialsStore = config.credentialsStore;
        this.policyGateway = config.policyGateway;
        if (this.credentialsStore) {
            this.credentialsStore.setApiBaseUrl(this.config.apiBaseUrl);
            this.credentialsStore.update({
                installationId: resolvedInstallationId,
                refreshToken: resolvedRefreshToken,
                runtimeToken: resolvedRuntimeToken,
            });
        }
        const hasRecoveryCredentials = resolvedInstallationId && resolvedRefreshToken;
        if (!this.config.installToken && !this.config.apiKey && !hasRecoveryCredentials) {
            console.warn('[Beacon] No credentials provided. Set one of:');
            console.warn('[Beacon]   - SEKUIRE_INSTALL_TOKEN (for initial bootstrap)');
            console.warn('[Beacon]   - SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN (for recovery)');
        }
    }
    /**
     * Start the beacon - registers with Sekuire and begins heartbeat loop
     *
     * Authentication priority:
     * 1. If SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN are set, recover credentials
     * 2. If SEKUIRE_RUNTIME_TOKEN is also set and valid, use it directly
     * 3. Fall back to SEKUIRE_INSTALL_TOKEN for fresh bootstrap
     *
     * If all authentication methods fail, the agent continues running in degraded mode
     * without Sekuire features. This prevents auth failures from crashing agents.
     */
    async start() {
        if (this.intervalId) {
            console.warn('[Beacon] Already running');
            return;
        }
        const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();
        console.log(`[Beacon] Starting for agent ${this.config.agentId}`);
        if (deploymentUrl) {
            console.log(`[Beacon] Deployment URL: ${deploymentUrl}`);
        }
        let authenticated = false;
        // Priority 1: Try credential recovery from env vars
        if (this.config.installationId && this.config.refreshToken) {
            console.log('[Beacon] Found recovery credentials in environment');
            authenticated = await this.tryCredentialRecovery();
            if (authenticated) {
                this.recoveredFromEnv = true;
                console.log('[Beacon] Successfully recovered credentials from environment');
            }
        }
        // Priority 2: Fall back to fresh bootstrap with install token
        if (!authenticated) {
            authenticated = await this.bootstrapWithRetry(deploymentUrl);
        }
        if (!authenticated) {
            this.degradedMode = true;
            console.warn('[Beacon] Running in degraded mode - Sekuire features disabled');
            console.warn('[Beacon] To re-enable: generate a new install token from the dashboard');
            this.notifyStatusChange();
            return;
        }
        console.log(`[Beacon] Bootstrap successful, installation ID: ${this.installationId}`);
        if (this.recoveredFromEnv) {
            console.log('[Beacon] Credentials recovered via refresh token (no install token consumed)');
        }
        // Start heartbeat loop
        const intervalMs = this.config.heartbeatIntervalSeconds * 1000;
        this.intervalId = setInterval(() => {
            this.heartbeat().catch((err) => {
                console.error('[Beacon] Heartbeat failed:', err);
            });
        }, intervalMs);
        // Send first heartbeat immediately
        await this.heartbeat().catch(() => { });
        this.notifyStatusChange();
    }
    /**
     * Stop the beacon
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[Beacon] Stopped');
        }
    }
    setPolicyGateway(gateway) {
        this.policyGateway = gateway;
    }
    /**
     * Get current beacon status
     */
    getStatus() {
        return {
            isRunning: this.intervalId !== null || this.degradedMode,
            installationId: this.getInstallationId() || undefined,
            runtimeToken: this.getRuntimeToken() ? '***' + this.getRuntimeToken().slice(-4) : undefined,
            deploymentUrl: this.config.deploymentUrl || detectDeploymentUrl(),
            lastHeartbeat: this.lastHeartbeat || undefined,
            failedHeartbeats: this.failedHeartbeats,
            degradedMode: this.degradedMode,
            recoveredFromEnv: this.recoveredFromEnv,
        };
    }
    /**
     * Get runtime credentials after successful bootstrap.
     *
     * Use this to share credentials with other components (e.g., TaskWorker)
     * to avoid dual bootstrap token consumption.
     *
     * @returns Runtime credentials or null if not bootstrapped
     */
    getRuntimeCredentials() {
        const installationId = this.getInstallationId();
        const runtimeToken = this.getRuntimeToken();
        if (!installationId || !runtimeToken) {
            return null;
        }
        return {
            installationId,
            runtimeToken,
        };
    }
    /**
     * Get full installation credentials for persistence.
     *
     * Use this after successful bootstrap to extract credentials that can be
     * saved as environment variables or secrets for future container restarts.
     * These credentials allow recovery without consuming a new install token.
     *
     * Example usage:
     * ```ts
     * const creds = beacon.getInstallationCredentials();
     * if (creds) {
     *   // Save to your secrets manager (AWS Secrets Manager, K8s Secret, etc.)
     *   // SEKUIRE_INSTALLATION_ID = creds.installationId
     *   // SEKUIRE_REFRESH_TOKEN = creds.refreshToken
     *   // SEKUIRE_RUNTIME_TOKEN = creds.runtimeToken (optional, has expiry)
     * }
     * ```
     *
     * @returns Full installation credentials or null if not bootstrapped
     */
    getInstallationCredentials() {
        const installationId = this.getInstallationId();
        const runtimeToken = this.getRuntimeToken();
        const refreshToken = this.getRefreshToken();
        if (!installationId || !runtimeToken || !refreshToken) {
            return null;
        }
        return {
            installationId,
            runtimeToken,
            refreshToken,
            expiresAt: this.expiresAt || undefined,
        };
    }
    /**
     * Try to recover credentials using installation ID and refresh token from env.
     *
     * This allows agents to survive container restarts without needing a new
     * install token, which is especially important for ephemeral compute
     * environments like Cloud Run, Kubernetes, or serverless functions.
     *
     * @returns true if recovery succeeded, false otherwise
     */
    async tryCredentialRecovery() {
        const installationId = this.getInstallationId() || this.config.installationId;
        const refreshToken = this.getRefreshToken() || this.config.refreshToken;
        const existingRuntimeToken = this.getRuntimeToken() || this.config.runtimeToken;
        if (!installationId || !refreshToken) {
            return false;
        }
        // If we have an existing runtime token, try to use it first
        if (existingRuntimeToken) {
            console.log('[Beacon] Found existing runtime token, validating...');
            const isValid = await this.validateRuntimeToken(installationId, existingRuntimeToken);
            if (isValid) {
                this.installationId = installationId;
                this.runtimeToken = existingRuntimeToken;
                this.refreshToken = refreshToken;
                this.credentialsStore?.update({
                    installationId,
                    runtimeToken: existingRuntimeToken,
                    refreshToken,
                });
                console.log('[Beacon] Existing runtime token is valid');
                return true;
            }
            console.log('[Beacon] Existing runtime token is invalid or expired, refreshing...');
        }
        // Refresh to get a new runtime token
        try {
            if (this.credentialsStore) {
                this.credentialsStore.update({ installationId, refreshToken });
                await this.credentialsStore.refreshRuntimeToken("Beacon");
                this.installationId = installationId;
                this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
                this.refreshToken = refreshToken;
                this.expiresAt = this.credentialsStore.getExpiresAt() ?? null;
                console.log('[Beacon] Credentials recovered via refresh token');
                return true;
            }
            const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    refresh_token: refreshToken,
                }),
            });
            if (!response.ok) {
                const body = await response.text();
                console.error(`[Beacon] Credential recovery failed: ${response.status} - ${body}`);
                return false;
            }
            const data = await response.json();
            this.installationId = installationId;
            this.runtimeToken = data.runtime_token;
            this.refreshToken = refreshToken;
            this.expiresAt = data.expires_at || null;
            console.log('[Beacon] Credentials recovered via refresh token');
            return true;
        }
        catch (error) {
            console.error('[Beacon] Credential recovery error:', error);
            return false;
        }
    }
    /**
     * Validate a runtime token by making a lightweight API call.
     */
    async validateRuntimeToken(installationId, token) {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/${installationId}/lease`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    status: 'running',
                }),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Bootstrap with retry and exponential backoff
     *
     * Returns true if bootstrap succeeded, false if all retries exhausted.
     * Does NOT throw - allows agent to continue in degraded mode.
     */
    async bootstrapWithRetry(deploymentUrl, maxRetries = 3, initialDelayMs = 1000) {
        let delay = initialDelayMs;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.bootstrap(deploymentUrl);
                return true;
            }
            catch (error) {
                const isLastAttempt = attempt === maxRetries;
                const errorMsg = error instanceof Error ? error.message : String(error);
                // Check if error is permanent (expired/invalid token) vs transient (network)
                const isPermanentError = errorMsg.includes('401') ||
                    errorMsg.includes('expired') ||
                    errorMsg.includes('invalid') ||
                    errorMsg.includes('not found');
                if (isPermanentError) {
                    console.error(`[Beacon] Bootstrap failed (permanent error): ${errorMsg}`);
                    // Try recovery bootstrap if we have API key
                    if (this.config.apiKey && this.config.workspaceId) {
                        console.log('[Beacon] Attempting recovery bootstrap with API key...');
                        const recovered = await this.tryRecoveryBootstrap(deploymentUrl);
                        if (recovered) {
                            return true;
                        }
                    }
                    console.error('[Beacon] Install token expired or invalid - generate a new one from the dashboard');
                    return false;
                }
                if (isLastAttempt) {
                    console.error(`[Beacon] Bootstrap failed after ${maxRetries} attempts: ${errorMsg}`);
                    return false;
                }
                console.warn(`[Beacon] Bootstrap attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
                console.warn(`[Beacon] Retrying in ${delay}ms...`);
                await this.sleep(delay);
                delay *= 2; // Exponential backoff
            }
        }
        return false;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Attempt recovery bootstrap using API key when install token fails
     *
     * Recovery bootstrap allows re-issuing runtime credentials without
     * needing a new install token from the dashboard.
     */
    async tryRecoveryBootstrap(deploymentUrl) {
        if (!this.config.apiKey || !this.config.workspaceId) {
            return false;
        }
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/recovery`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.apiKey,
                },
                body: JSON.stringify({
                    agent_id: this.config.agentId,
                    workspace_id: this.config.workspaceId,
                    upstream_url: deploymentUrl,
                    capabilities: this.config.capabilities ?? [],
                    heartbeat_interval_seconds: this.config.heartbeatIntervalSeconds,
                }),
            });
            if (!response.ok) {
                const body = await response.text();
                console.error(`[Beacon] Recovery bootstrap failed: ${response.status} - ${body}`);
                return false;
            }
            const data = await response.json();
            applyBootstrapResponse(this, data);
            console.log(`[Beacon] Recovery bootstrap successful, installation ID: ${this.installationId}`);
            return true;
        }
        catch (error) {
            console.error('[Beacon] Recovery bootstrap error:', error);
            return false;
        }
    }
    /**
     * Bootstrap registration with Sekuire
     *
     * Exchanges an install token for runtime credentials (installation_id + runtime_token).
     * The install token is obtained from the dashboard or CLI.
     */
    async bootstrap(deploymentUrl) {
        if (!this.config.installToken) {
            throw new Error('Install token required for beacon registration. ' +
                'Generate one from the dashboard or use: sekuire install token --workspace <id>');
        }
        const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/bootstrap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                install_token: this.config.installToken,
                upstream_url: deploymentUrl,
                capabilities: this.config.capabilities ?? [],
                heartbeat_interval_seconds: this.config.heartbeatIntervalSeconds,
            }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Bootstrap failed: ${response.status} ${response.statusText} - ${body}`);
        }
        const data = await response.json();
        applyBootstrapResponse(this, data);
        this.expiresAt = data.expires_at || null;
    }
    /**
     * Send heartbeat (lease renewal) to Sekuire
     *
     * Uses the installation-based lease endpoint with runtime token authentication.
     */
    async heartbeat() {
        const installationId = this.getInstallationId();
        const runtimeToken = this.getRuntimeToken();
        if (!installationId || !runtimeToken) {
            console.warn('[Beacon] Cannot send heartbeat - not bootstrapped');
            return;
        }
        const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();
        const prevFailed = this.failedHeartbeats;
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/${installationId}/lease`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${runtimeToken}`,
                },
                body: JSON.stringify({
                    status: 'running',
                    heartbeat_interval_seconds: this.config.heartbeatIntervalSeconds,
                    upstream_url: deploymentUrl,
                }),
            });
            if (response.status === 401) {
                // Token expired - try to refresh using refresh token
                console.warn('[Beacon] Runtime token expired, attempting refresh...');
                await this.refreshRuntimeToken();
                // Retry heartbeat after refresh
                return this.heartbeat();
            }
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Heartbeat failed: ${response.status} - ${body}`);
            }
            // Check if server auto-refreshed our token (sliding expiration)
            const data = await response.json();
            if (data.refreshed_token) {
                this.runtimeToken = data.refreshed_token.runtime_token;
                this.credentialsStore?.setRuntimeToken(data.refreshed_token.runtime_token, data.refreshed_token.expires_at);
                console.log(`[Beacon] Token auto-refreshed by server (version ${data.refreshed_token.token_version})`);
            }
            if (this.policyGateway && "active_policy_hash" in data) {
                this.policyGateway.onHeartbeatResponse(data.active_policy_hash ?? null).catch((err) => {
                    console.warn("[Beacon] Policy sync failed:", err);
                });
            }
            this.lastHeartbeat = new Date();
            this.failedHeartbeats = 0;
            if (prevFailed > 0) {
                this.notifyStatusChange();
            }
        }
        catch (error) {
            this.failedHeartbeats++;
            this.notifyStatusChange();
            throw error;
        }
    }
    /**
     * Refresh the runtime token using the refresh token
     */
    async refreshRuntimeToken() {
        if (this.credentialsStore) {
            await this.credentialsStore.refreshRuntimeToken("Beacon");
            this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
            return;
        }
        const installationId = this.getInstallationId();
        const refreshToken = this.getRefreshToken();
        if (!installationId || !refreshToken) {
            throw new Error('Cannot refresh token - missing installation ID or refresh token');
        }
        const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refresh_token: refreshToken,
            }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Token refresh failed: ${response.status} - ${body}`);
        }
        const data = await response.json();
        this.runtimeToken = data.runtime_token;
        console.log('[Beacon] Runtime token refreshed successfully');
    }
    /**
     * Notify status change callback
     */
    notifyStatusChange() {
        if (this.config.onStatusChange) {
            this.config.onStatusChange(this.getStatus());
        }
    }
    /**
     * Get environment variable value (works in Node.js and browser)
     */
    getEnvVar(name) {
        if (typeof process !== 'undefined' && process.env) {
            return process.env[name];
        }
        return undefined;
    }
    getInstallationId() {
        const storeValue = this.credentialsStore?.getInstallationId();
        if (storeValue) {
            this.installationId = storeValue;
            return storeValue;
        }
        return this.installationId;
    }
    getRuntimeToken() {
        const storeValue = this.credentialsStore?.getRuntimeToken();
        if (storeValue) {
            this.runtimeToken = storeValue;
            return storeValue;
        }
        return this.runtimeToken;
    }
    getRefreshToken() {
        const storeValue = this.credentialsStore?.getRefreshToken();
        if (storeValue) {
            this.refreshToken = storeValue;
            return storeValue;
        }
        return this.refreshToken;
    }
}
// ============================================================================
// Convenience Export
// ============================================================================
/**
 * Create a new beacon instance
 */
function createBeacon(config) {
    return new Beacon(config);
}

const nacl = nacl$1 ?? nacl__namespace;
class SekuireCrypto {
    /**
     * Generate a new Ed25519 keypair
     */
    static generateKeyPair() {
        const keyPair = nacl.sign.keyPair();
        return {
            publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
            privateKey: Buffer.from(keyPair.secretKey).toString("hex"),
        };
    }
    /**
     * Sign a message with a private key
     */
    static sign(message, privateKeyHex) {
        try {
            const privateKey = SekuireCrypto.hexToBytes(privateKeyHex);
            const messageBytes = typeof message === "string" ? Buffer.from(message, "utf8") : message;
            // Accept both 32-byte Ed25519 seeds (CLI-generated) and 64-byte nacl secret keys.
            const secretKey = privateKey.length === 32
                ? nacl.sign.keyPair.fromSeed(privateKey).secretKey
                : privateKey;
            if (secretKey.length !== 64) {
                throw new CryptoError(`Invalid private key length: expected 32-byte seed or 64-byte secret key, got ${privateKey.length} bytes`);
            }
            const signature = nacl.sign.detached(messageBytes, secretKey);
            return Buffer.from(signature).toString("hex");
        }
        catch (error) {
            throw new CryptoError(`Failed to sign message: ${error.message}`);
        }
    }
    /**
     * Verify a signature
     */
    static verify(message, signatureHex, publicKeyHex) {
        try {
            const messageBytes = typeof message === "string" ? Buffer.from(message, "utf8") : message;
            const signature = SekuireCrypto.hexToBytes(signatureHex);
            const publicKey = SekuireCrypto.hexToBytes(publicKeyHex);
            return nacl.sign.detached.verify(messageBytes, signature, publicKey);
        }
        catch (error) {
            throw new CryptoError(`Failed to verify signature: ${error.message}`);
        }
    }
    /**
     * Calculate Blake3 hash of data
     */
    static hash(data) {
        try {
            const dataBytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
            const hash = blake3__namespace.hash(dataBytes);
            return hash.toString("hex");
        }
        catch (error) {
            throw new CryptoError(`Failed to hash data: ${error.message}`);
        }
    }
    /**
     * Calculate Sekuire ID using the canonical algorithm (V2).
     *
     * Matches the CLI reference implementation (auth.rs:243-250):
     *   fingerprint = "model:{model}|prompt:{BLAKE3(trim(prompt))}|tools:{BLAKE3(canonical_json(tools))}"
     *   sekuire_id  = BLAKE3(fingerprint)
     *
     * projectName and projectVersion are accepted for backwards compatibility
     * but are NOT used in the ID computation.
     */
    static calculateSekuireId(params) {
        return SekuireCrypto.calculateSekuireIdV2(params);
    }
    /**
     * Canonical identity algorithm aligned with CLI (auth.rs:243-250).
     *
     * 1. promptHash  = BLAKE3(trim(systemPrompt))
     * 2. toolsHash   = BLAKE3(JSON.stringify(JSON.parse(tools)))  // canonical JSON
     * 3. fingerprint = "model:{model}|prompt:{promptHash}|tools:{toolsHash}"
     * 4. sekuireId   = BLAKE3(fingerprint)
     */
    static calculateSekuireIdV2(params) {
        const promptHash = SekuireCrypto.hash(params.systemPrompt.trim());
        let canonicalTools;
        try {
            canonicalTools = JSON.stringify(JSON.parse(params.tools));
        }
        catch {
            canonicalTools = params.tools;
        }
        const toolsHash = SekuireCrypto.hash(canonicalTools);
        const fingerprint = `model:${params.model}|prompt:${promptHash}|tools:${toolsHash}`;
        return SekuireCrypto.hash(fingerprint);
    }
    /**
     * @deprecated Use calculateSekuireId (V2) instead. This legacy algorithm
     * concatenates all fields in a single pass and does not match the CLI.
     */
    static calculateSekuireIdLegacy(params) {
        const combined = [
            params.model,
            params.systemPrompt,
            params.tools,
            params.projectName,
            params.projectVersion,
        ].join("");
        return SekuireCrypto.hash(combined);
    }
    /**
     * Generate a cryptographically secure random nonce (32 bytes)
     */
    static generateNonce() {
        const bytes = nacl.randomBytes(32);
        return Buffer.from(bytes).toString("hex");
    }
    /**
     * Convert hex string to Uint8Array
     */
    static hexToBytes(hex) {
        // Remove 0x prefix if present
        const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
        // Ensure even length
        if (cleanHex.length % 2 !== 0) {
            throw new CryptoError("Invalid hex string: odd length");
        }
        const bytes = new Uint8Array(cleanHex.length / 2);
        for (let i = 0; i < cleanHex.length; i += 2) {
            bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
        }
        return bytes;
    }
    /**
     * Convert Uint8Array to hex string
     */
    static bytesToHex(bytes) {
        return Buffer.from(bytes).toString("hex");
    }
    /**
     * Validate hex string format
     */
    static isValidHex(hex) {
        const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
        return (/^[0-9a-fA-F]*$/.test(cleanHex) &&
            cleanHex.length > 0 &&
            cleanHex.length % 2 === 0);
    }
    /**
     * Validate Ed25519 public key format (32 bytes)
     */
    static isValidPublicKey(hex) {
        if (!SekuireCrypto.isValidHex(hex))
            return false;
        try {
            return SekuireCrypto.hexToBytes(hex).length === 32;
        }
        catch {
            return false;
        }
    }
    /**
     * Validate Ed25519 private key format (32-byte seed or 64-byte secret key)
     */
    static isValidPrivateKey(hex) {
        if (!SekuireCrypto.isValidHex(hex))
            return false;
        try {
            const len = SekuireCrypto.hexToBytes(hex).length;
            return len === 32 || len === 64;
        }
        catch {
            return false;
        }
    }
    /**
     * Validate nonce format (32 bytes)
     */
    static isValidNonce(hex) {
        if (!SekuireCrypto.isValidHex(hex))
            return false;
        try {
            return SekuireCrypto.hexToBytes(hex).length === 32;
        }
        catch {
            return false;
        }
    }
}

class AgentIdentity {
    constructor(name, sekuireId, privateKey, publicKey) {
        this.name = name;
        this.sekuireId = sekuireId;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
    }
    static async load(manifestPath = "sekuire.json") {
        // 1. Resolve Manifest
        const path$1 = path.resolve(process.cwd(), manifestPath);
        if (!fs.existsSync(path$1)) {
            // Check env vars as fallback
            if (process.env.SEKUIRE_AGENT_NAME) {
                return new AgentIdentity(process.env.SEKUIRE_AGENT_NAME, process.env.SEKUIRE_AGENT_ID || "unknown", process.env.SEKUIRE_PRIVATE_KEY, process.env.SEKUIRE_PUBLIC_KEY);
            }
            throw new Error(`Manifest not found at ${path$1}`);
        }
        const content = await fs$1.readFile(path$1, "utf-8");
        const manifest = JSON.parse(content);
        // 2. Load Keys
        let privateKey = process.env.SEKUIRE_PRIVATE_KEY;
        let publicKey = process.env.SEKUIRE_PUBLIC_KEY;
        if (!privateKey) {
            const keyPath = path.join(path.resolve(path$1, ".."), ".sekuire", "secret.key");
            if (fs.existsSync(keyPath)) {
                privateKey = (await fs$1.readFile(keyPath, "utf-8")).trim();
            }
        }
        // Derive public key from private key if not provided
        if (privateKey && !publicKey) {
            const privateKeyBytes = SekuireCrypto.hexToBytes(privateKey);
            // tweetnacl expects a 64-byte secret key (seed + public key)
            // or we generate a keypair from 32-byte seed
            if (privateKeyBytes.length === 32) {
                const keyPair = nacl$1.sign.keyPair.fromSeed(privateKeyBytes);
                publicKey = SekuireCrypto.bytesToHex(keyPair.publicKey);
            }
            else if (privateKeyBytes.length === 64) {
                // Full secret key includes public key in last 32 bytes
                publicKey = SekuireCrypto.bytesToHex(privateKeyBytes.slice(32));
            }
        }
        return new AgentIdentity(manifest.name || "Unknown", manifest.sekuire_id || process.env.SEKUIRE_AGENT_ID || "unknown", privateKey, publicKey);
    }
    /**
     * Sign a message using Ed25519
     * @param message The message string to sign
     * @returns Hex-encoded signature
     */
    async sign(message) {
        if (!this.privateKey) {
            throw new Error("No private key available for signing");
        }
        const privateKeyBytes = SekuireCrypto.hexToBytes(this.privateKey);
        const messageBytes = new TextEncoder().encode(message);
        let secretKey;
        if (privateKeyBytes.length === 32) {
            // 32-byte seed - derive full keypair
            const keyPair = nacl$1.sign.keyPair.fromSeed(privateKeyBytes);
            secretKey = keyPair.secretKey;
        }
        else if (privateKeyBytes.length === 64) {
            // Full 64-byte secret key
            secretKey = privateKeyBytes;
        }
        else {
            throw new Error(`Invalid private key length: ${privateKeyBytes.length}. Expected 32 or 64 bytes.`);
        }
        // Sign the message (returns signature + message, we extract just signature)
        const signedMessage = nacl$1.sign(messageBytes, secretKey);
        const signature = signedMessage.slice(0, nacl$1.sign.signatureLength);
        return SekuireCrypto.bytesToHex(signature);
    }
    /**
     * Verify a signature (useful for testing)
     */
    verify(message, signatureHex) {
        if (!this.publicKey) {
            throw new Error("No public key available for verification");
        }
        const publicKeyBytes = SekuireCrypto.hexToBytes(this.publicKey);
        const signatureBytes = SekuireCrypto.hexToBytes(signatureHex);
        const messageBytes = new TextEncoder().encode(message);
        // Reconstruct signed message format for verification
        const signedMessage = new Uint8Array(signatureBytes.length + messageBytes.length);
        signedMessage.set(signatureBytes);
        signedMessage.set(messageBytes, signatureBytes.length);
        const result = nacl$1.sign.open(signedMessage, publicKeyBytes);
        return result !== null;
    }
}

class SekuireLogger {
    constructor(config) {
        this.buffer = [];
        this.retryQueue = [];
        this.overflowEventsTotal = 0;
        this.isFlushing = false;
        this.sdkVersion = "typescript-sdk-0.1.0";
        this.config = {
            sessionId: config.sessionId || uuid.v4(),
            workspaceId: config.workspaceId || undefined,
            environment: config.environment || "development",
            enabled: config.enabled !== false,
            batchSize: config.batchSize || 50,
            flushInterval: config.flushInterval || 10000,
            maxRetries: config.maxRetries ?? 3,
            retryBaseDelay: config.retryBaseDelay ?? 1000,
            apiKey: config.apiKey || undefined,
            apiBaseUrl: config.apiBaseUrl || "",
            fallback: config.fallback ?? "console",
            fallbackFilePath: config.fallbackFilePath || "./sekuire-events.ndjson",
            maxBufferSize: config.maxBufferSize ?? 1000,
            ...config,
        };
        this.fallbackMode = this.config.fallback;
        this.maxBufferSize = this.config.maxBufferSize;
        this.maxRetries = this.config.maxRetries;
        this.retryBaseDelay = this.config.retryBaseDelay;
        this.apiAvailable = !!(this.config.apiBaseUrl);
        if (this.apiAvailable) {
            this.client = axios.create({
                baseURL: this.config.apiBaseUrl,
                timeout: 5000,
                headers: this.config.apiKey
                    ? { "X-API-Key": this.config.apiKey }
                    : {},
            });
        }
        else {
            this.client = null;
        }
        if (this.config.enabled) {
            this.startFlushTimer();
            if (this.apiAvailable) {
                this.startHeartbeatTimer();
                this.sendHealthHeartbeat();
            }
        }
    }
    logEvent(eventType, severity, eventData) {
        if (!this.config.enabled)
            return;
        const event = {
            sekuire_id: this.config.sekuireId,
            session_id: this.config.sessionId,
            workspace_id: this.config.workspaceId,
            event_type: eventType,
            severity,
            event_timestamp: new Date().toISOString(),
            event_data: eventData,
            metadata: {
                sdk_version: this.sdkVersion,
                environment: this.config.environment,
            },
        };
        if (this.buffer.length >= this.maxBufferSize) {
            const overflow = this.buffer.splice(0, Math.max(1, Math.floor(this.maxBufferSize * 0.1)));
            this.overflowEventsTotal += overflow.length;
            this.writeFallback(overflow);
        }
        this.buffer.push(event);
        if (this.buffer.length >= this.config.batchSize) {
            this.flush().catch(() => { });
        }
    }
    async flush() {
        if (this.isFlushing)
            return;
        if (this.buffer.length === 0 && this.retryQueue.length === 0)
            return;
        this.isFlushing = true;
        try {
            await this.processRetryQueue();
            if (this.buffer.length === 0)
                return;
            const eventsToSend = this.buffer.splice(0, 100);
            if (!this.apiAvailable || !this.client) {
                this.writeFallback(eventsToSend);
                return;
            }
            try {
                await this.sendBatch(eventsToSend);
            }
            catch {
                this.retryQueue.push({ events: eventsToSend, attempts: 1 });
            }
        }
        finally {
            this.isFlushing = false;
        }
    }
    async sendBatch(events) {
        if (!this.client)
            throw new Error("No client");
        const response = await this.client.post(`/api/v1/agents/${this.config.sekuireId}/logs/batch`, { events });
        if (response.data?.events_logged) {
            console.debug(`Logged ${response.data.events_logged}/${events.length} events to Sekuire API`);
        }
        if (response.data?.errors?.length > 0) {
            console.warn("Some events failed to log:", response.data.errors);
        }
    }
    async processRetryQueue() {
        if (this.retryQueue.length === 0)
            return;
        if (!this.client) {
            const pending = [...this.retryQueue];
            this.retryQueue = [];
            for (const batch of pending) {
                this.writeFallback(batch.events);
            }
            return;
        }
        const pending = [...this.retryQueue];
        this.retryQueue = [];
        for (const batch of pending) {
            try {
                await this.sendBatch(batch.events);
            }
            catch (error) {
                batch.attempts++;
                if (batch.attempts > this.maxRetries) {
                    this.writeFallback(batch.events);
                    if (this.config.onError) {
                        this.config.onError(error instanceof Error ? error : new Error(String(error)), { operation: "retry_exhausted", eventsLost: batch.events.length });
                    }
                }
                else {
                    this.retryQueue.push(batch);
                }
            }
        }
    }
    writeFallback(events) {
        if (events.length === 0)
            return;
        switch (this.fallbackMode) {
            case "console":
                for (const event of events) {
                    process.stdout.write(JSON.stringify(event) + "\n");
                }
                break;
            case "file":
                this.writeFallbackToFile(events);
                break;
        }
    }
    writeFallbackToFile(events) {
        try {
            const dir = path$1.dirname(this.config.fallbackFilePath);
            if (dir && dir !== ".") {
                fs$2.mkdirSync(dir, { recursive: true });
            }
            const data = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
            fs$2.appendFileSync(this.config.fallbackFilePath, data, "utf-8");
        }
        catch {
            for (const event of events) {
                process.stdout.write(JSON.stringify(event) + "\n");
            }
        }
    }
    async sendHealthHeartbeat() {
        if (!this.client)
            return;
        try {
            await this.client.post(`/api/v1/agents/${this.config.sekuireId}/logs/health`, {
                sekuire_id: this.config.sekuireId,
                status: "active",
                session_id: this.config.sessionId,
                sdk_version: this.sdkVersion,
                environment: this.config.environment,
                metadata: {},
            });
            console.debug("Health heartbeat sent");
        }
        catch (error) {
            console.debug("Failed to send health heartbeat:", error.message);
        }
    }
    startFlushTimer() {
        this.flushTimer = setInterval(() => {
            this.flush().catch(() => { });
        }, this.config.flushInterval);
        if (this.flushTimer.unref) {
            this.flushTimer.unref();
        }
    }
    startHeartbeatTimer() {
        this.heartbeatTimer = setInterval(() => {
            this.sendHealthHeartbeat().catch(() => { });
        }, 30000);
        if (this.heartbeatTimer.unref) {
            this.heartbeatTimer.unref();
        }
    }
    stopTimers() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }
    async shutdown() {
        this.stopTimers();
        await this.flush();
        for (let i = 0; i <= this.maxRetries && this.retryQueue.length > 0; i++) {
            await this.flush();
        }
        if (this.retryQueue.length > 0) {
            const pending = [...this.retryQueue];
            this.retryQueue = [];
            for (const batch of pending) {
                this.writeFallback(batch.events);
            }
        }
    }
    getStatus() {
        return {
            enabled: this.config.enabled,
            bufferedEvents: this.buffer.length,
            sessionId: this.config.sessionId,
            environment: this.config.environment,
            apiAvailable: this.apiAvailable,
            fallbackMode: this.fallbackMode,
            overflowEventsTotal: this.overflowEventsTotal,
            retryQueueSize: this.retryQueue.length,
        };
    }
    setEnabled(enabled) {
        if (enabled && !this.config.enabled) {
            this.config.enabled = true;
            this.startFlushTimer();
            if (this.apiAvailable) {
                this.startHeartbeatTimer();
            }
        }
        else if (!enabled && this.config.enabled) {
            this.config.enabled = false;
            this.stopTimers();
        }
    }
}

class PolicyClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cache = new Map();
    }
    invalidateCache(workspaceId) {
        this.cache.delete(workspaceId);
    }
    async fetchActivePolicy(workspaceId) {
        if (this.cache.has(workspaceId)) {
            return this.cache.get(workspaceId);
        }
        const res = await fetch(`${this.baseUrl}/api/v1/workspaces/${workspaceId}/policy/active`, { method: "GET" });
        if (!res.ok) {
            throw new ProtocolError(`Failed to fetch active policy: ${res.status} ${res.statusText}`, res.status);
        }
        const policy = await res.json();
        this.verify(policy);
        this.cache.set(workspaceId, policy);
        return policy;
    }
    verify(policy) {
        const recalculatedHash = SekuireCrypto.hash(JSON.stringify(policy.content));
        if (recalculatedHash !== policy.hash) {
            throw new ProtocolError(`Policy hash mismatch. Expected ${policy.hash}, got ${recalculatedHash}`, 400);
        }
        if (policy.signature && policy.signing_public_key) {
            const message = `${policy.policy_id}:${policy.version}:${policy.hash}`;
            const valid = SekuireCrypto.verify(message, policy.signature, policy.signing_public_key);
            if (!valid) {
                throw new ProtocolError("Policy signature verification failed", 400);
            }
        }
    }
}

const DEFAULT_OVERRIDE_ENV = "SEKUIRE_POLICY_DEV_OVERRIDE";
class PolicyEnforcer {
    constructor(policy, override, onViolation) {
        this.policy = policy;
        this.onViolation = onViolation;
        this.rateLimitWindows = new Map();
        const envOverride = process.env[DEFAULT_OVERRIDE_ENV] === "true";
        this.override = override ?? envOverride;
        if (this.override) {
            console.warn("[policy] override enabled; policy enforcement is running in warn-only mode");
        }
    }
    enforceNetwork(domain, protocol) {
        const perms = this.policy.content?.permissions?.network;
        if (!perms) {
            this.warnOnly("network.missing", "Network permissions not configured");
            return;
        }
        if (!perms.enabled)
            this.throw("network.disabled", "Network access is disabled");
        if (perms.require_tls && protocol !== "https") {
            this.throw("network.tls_required", "TLS is required for network requests");
        }
        if (perms.blocked_domains && this.matches(domain, perms.blocked_domains)) {
            this.throw("network.blocked", `Domain ${domain} is blocked by policy`);
        }
        if (perms.allowed_domains && !this.matches(domain, perms.allowed_domains)) {
            this.throw("network.not_allowed", `Domain ${domain} is not in the allowlist`);
        }
    }
    enforceFilesystem(path, operation) {
        const perms = this.policy.content?.permissions?.filesystem;
        if (!perms) {
            this.warnOnly("fs.missing", "Filesystem permissions not configured");
            return;
        }
        if (!perms.enabled)
            this.throw("fs.disabled", "Filesystem access is disabled");
        if (perms.blocked_paths && this.pathMatch(path, perms.blocked_paths)) {
            this.throw("fs.blocked", `Path ${path} is blocked`);
        }
        if (perms.allowed_paths && !this.pathMatch(path, perms.allowed_paths)) {
            this.throw("fs.not_allowed", `Path ${path} is not in the allowlist`);
        }
        if (perms.allowed_extensions) {
            const ext = path.includes(".") ? `.${path.split(".").pop()}` : "";
            if (ext && !perms.allowed_extensions.includes(ext)) {
                this.throw("fs.ext", `Extension ${ext} is not allowed`);
            }
        }
    }
    enforceTool(toolName) {
        const tools = this.policy.content?.tools;
        // Check blocked tools
        if (tools?.blocked_tools?.includes(toolName)) {
            this.throw("tool.blocked", `Tool ${toolName} is blocked`);
        }
        // If no allowlist, allow all tools
        if (!tools?.allowed_tools || tools.allowed_tools.length === 0) {
            return;
        }
        // Check allowlist with pattern matching
        const isAllowed = tools.allowed_tools.some((t) => {
            const pattern = t.name;
            // Exact match
            if (pattern === toolName) {
                return true;
            }
            // Category patterns: "files:*" or "files:[read,write]"
            if (pattern.includes(":")) {
                const [category, ops] = pattern.split(":", 2);
                return this.matchesCategoryPattern(category, ops, toolName);
            }
            // Pattern matching: "file_*", etc (simple wildcards without :)
            if (pattern.includes("*")) {
                const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
                return regex.test(toolName);
            }
            return false;
        });
        if (!isAllowed) {
            this.throw("tool.not_allowed", `Tool ${toolName} is not in the allowlist`);
        }
    }
    matchesCategoryPattern(category, ops, toolName) {
        const normalizedCategory = category.trim().toLowerCase();
        if (ops === "*") {
            return this.toolMatchesCategory(normalizedCategory, toolName);
        }
        if (ops.startsWith("[") && ops.endsWith("]")) {
            const operations = ops
                .slice(1, -1)
                .split(",")
                .map((op) => op.trim())
                .filter((op) => op.length > 0);
            return operations.some((op) => this.toolMatchesCategoryOperation(normalizedCategory, op, toolName));
        }
        return this.toolMatchesCategoryOperation(normalizedCategory, ops.trim(), toolName);
    }
    toolMatchesCategory(category, toolName) {
        switch (category) {
            case "files":
                return toolName.startsWith("file_");
            case "directories":
                return toolName.startsWith("dir_");
            case "network":
                return (toolName.startsWith("http_") ||
                    toolName === "download_file" ||
                    toolName === "dns_lookup" ||
                    toolName === "ping" ||
                    toolName === "web_search");
            case "data":
                return (toolName.startsWith("json_") ||
                    toolName.startsWith("csv_") ||
                    toolName.startsWith("yaml_") ||
                    toolName.startsWith("xml_") ||
                    toolName.startsWith("base64_") ||
                    toolName === "hash");
            case "system":
                return (toolName.startsWith("env_") ||
                    toolName === "get_cwd" ||
                    toolName === "get_platform");
            default:
                return toolName.startsWith(`${category}_`);
        }
    }
    toolMatchesCategoryOperation(category, operation, toolName) {
        const op = operation.trim().toLowerCase();
        if (!op)
            return false;
        switch (category) {
            case "files":
                return toolName === `file_${op}`;
            case "directories":
                return toolName === `dir_${op}`;
            case "network":
                if (op === "search")
                    return toolName === "web_search";
                if (op === "download")
                    return toolName === "download_file";
                if (op === "dns")
                    return toolName === "dns_lookup";
                return toolName === `http_${op}` || toolName === op;
            case "data":
                if (op === "hash")
                    return toolName === "hash";
                if (op.startsWith("json_"))
                    return toolName === op;
                if (op.startsWith("csv_"))
                    return toolName === op;
                if (op.startsWith("yaml_"))
                    return toolName === op;
                if (op.startsWith("xml_"))
                    return toolName === op;
                if (op.startsWith("base64_"))
                    return toolName === op;
                return toolName === `json_${op}` || toolName === op;
            case "system":
                if (op === "cwd")
                    return toolName === "get_cwd";
                if (op === "platform")
                    return toolName === "get_platform";
                if (op === "get" || op === "set")
                    return toolName === `env_${op}`;
                return toolName === `env_${op}` || toolName === op;
            default:
                return toolName === `${category}_${op}` || toolName === op;
        }
    }
    enforceModel(model) {
        const models = this.policy.content?.agent?.models;
        if (models?.allowed_models && !models.allowed_models.includes(model)) {
            this.throw("model.not_allowed", `Model ${model} is not allowed`);
        }
        if (models?.blocked_models && models.blocked_models.includes(model)) {
            this.throw("model.blocked", `Model ${model} is blocked`);
        }
    }
    enforceApi(service) {
        const perms = this.policy.content?.permissions?.api;
        if (!perms) {
            this.warnOnly("api.missing", "API permissions not configured");
            return;
        }
        if (!perms.enabled)
            this.throw("api.disabled", "API access is disabled");
        if (perms.allowed_services &&
            !perms.allowed_services.some((s) => s.service_name === service)) {
            this.throw("api.not_allowed", `API service ${service} is not in the allowlist`);
        }
    }
    enforceRateLimit(type, count = 1) {
        const limits = this.policy.content?.rate_limits?.per_agent;
        if (!limits)
            return;
        const now = Date.now();
        this.cleanupStaleWindows(now);
        if (type === "request") {
            if (limits.requests_per_minute) {
                this.checkWindow(`req_60`, 60000, limits.requests_per_minute, count, now);
            }
            if (limits.requests_per_hour) {
                this.checkWindow(`req_3600`, 3600000, limits.requests_per_hour, count, now);
            }
        }
        if (type === "token" && limits.tokens_per_minute) {
            this.checkWindow(`tok_60`, 60000, limits.tokens_per_minute, count, now);
        }
    }
    checkWindow(key, windowMs, limit, count, now) {
        let entry = this.rateLimitWindows.get(key);
        if (!entry || now - entry.windowStart >= windowMs) {
            entry = { count: 0, windowStart: now };
            this.rateLimitWindows.set(key, entry);
        }
        entry.count += count;
        if (entry.count > limit) {
            this.throw("rate_limit.exceeded", `Rate limit exceeded: ${key} (${entry.count}/${limit})`);
        }
    }
    cleanupStaleWindows(now) {
        for (const [key, entry] of this.rateLimitWindows) {
            const windowMs = key.includes("3600") ? 3600000 : 60000;
            if (now - entry.windowStart >= windowMs * 2) {
                this.rateLimitWindows.delete(key);
            }
        }
    }
    throw(rule, reason) {
        if (this.override) {
            this.warnOnly(rule, reason);
            return;
        }
        if (this.onViolation)
            this.onViolation(rule, reason);
        throw new PolicyViolationError(reason, rule);
    }
    warnOnly(rule, reason) {
        if (this.onViolation)
            this.onViolation(rule, reason);
        console.warn(`[policy][${rule}] ${reason}`);
    }
    matches(domain, patterns) {
        return patterns.some((pattern) => {
            if (pattern === "*")
                return true;
            if (pattern.startsWith("*.")) {
                const suffix = pattern.slice(2);
                return domain === suffix || domain.endsWith(`.${suffix}`);
            }
            return domain === pattern;
        });
    }
    pathMatch(path, patterns) {
        return patterns.some((pattern) => {
            if (pattern.endsWith("/*")) {
                const prefix = pattern.slice(0, -2);
                return path.startsWith(prefix);
            }
            if (pattern.endsWith("*")) {
                const prefix = pattern.slice(0, -1);
                return path.startsWith(prefix);
            }
            if (pattern.endsWith("/")) {
                return path.startsWith(pattern) || path === pattern.slice(0, -1);
            }
            return path === pattern || path.startsWith(pattern + "/");
        });
    }
}

class PolicyGateway {
    constructor(policyClient, workspaceId) {
        this.policyClient = policyClient;
        this.workspaceId = workspaceId;
        this.enforcer = null;
        this.cachedPolicyHash = null;
    }
    async initialize() {
        try {
            const policy = await this.policyClient.fetchActivePolicy(this.workspaceId);
            this.enforcer = new PolicyEnforcer(policy);
            this.cachedPolicyHash = policy.hash;
        }
        catch (err) {
            const status = err.statusCode;
            if (status === 404) {
                this.enforcer = null;
                this.cachedPolicyHash = null;
                return;
            }
            console.warn("[PolicyGateway] Failed to fetch policy, running without enforcement:", err);
            this.enforcer = null;
            this.cachedPolicyHash = null;
        }
    }
    checkRateLimit(type, count) {
        if (!this.enforcer) {
            return { allowed: true, violations: [], warnings: [] };
        }
        try {
            this.enforcer.enforceRateLimit(type, count);
            return { allowed: true, violations: [], warnings: [] };
        }
        catch (err) {
            if (err instanceof PolicyViolationError) {
                return {
                    allowed: false,
                    violations: [{
                            rule_id: err.rule,
                            rule_name: err.rule,
                            message: err.message,
                            capability: `rate_limit.${type}`,
                        }],
                    warnings: [],
                };
            }
            throw err;
        }
    }
    checkCapability(capability) {
        if (!this.enforcer) {
            return { allowed: true, violations: [], warnings: [] };
        }
        try {
            this.enforcer.enforceTool(capability);
            return { allowed: true, violations: [], warnings: [] };
        }
        catch (err) {
            if (err instanceof PolicyViolationError) {
                return {
                    allowed: false,
                    violations: [{
                            rule_id: err.rule,
                            rule_name: err.rule,
                            message: err.message,
                            capability,
                        }],
                    warnings: [],
                };
            }
            throw err;
        }
    }
    async onHeartbeatResponse(policyHash) {
        if (policyHash === this.cachedPolicyHash)
            return;
        if (!policyHash) {
            this.enforcer = null;
            this.cachedPolicyHash = null;
            this.policyClient.invalidateCache(this.workspaceId);
            return;
        }
        try {
            this.policyClient.invalidateCache(this.workspaceId);
            const policy = await this.policyClient.fetchActivePolicy(this.workspaceId);
            this.enforcer = new PolicyEnforcer(policy);
            this.cachedPolicyHash = policy.hash;
        }
        catch (err) {
            console.error("[PolicyGateway] Failed to refresh policy (keeping stale enforcer):", err);
        }
    }
}

/**
 * Sekuire Task Worker
 *
 * Handles SSE connection to Core for real-time task delivery.
 * Provides `onTask()` API for agents to register task handlers.
 */
// ============================================================================
// Task Worker
// ============================================================================
class TaskWorker {
    constructor(config) {
        this.eventSource = null;
        this.handlers = new Map();
        this.heartbeatInterval = null;
        this.isConnected = false;
        this.isPaused = false;
        this.installationId = null;
        this.runtimeToken = null;
        this.refreshToken = null;
        this.expiresAt = null;
        this.recoveredFromEnv = false;
        this.degradedMode = false;
        const storeSnapshot = config.credentialsStore?.getAll() || {};
        const resolvedInstallationId = config.installationId || storeSnapshot.installationId || this.getEnvVar('SEKUIRE_INSTALLATION_ID');
        const resolvedRefreshToken = config.refreshToken || storeSnapshot.refreshToken || this.getEnvVar('SEKUIRE_REFRESH_TOKEN');
        const resolvedRuntimeToken = config.runtimeToken || storeSnapshot.runtimeToken || this.getEnvVar('SEKUIRE_RUNTIME_TOKEN');
        const resolvedInstallToken = config.installToken || this.getEnvVar('SEKUIRE_INSTALL_TOKEN');
        const hasRecoveryCredentials = resolvedInstallationId && resolvedRefreshToken;
        if (!resolvedInstallToken && !resolvedRuntimeToken && !hasRecoveryCredentials) {
            console.warn("[Worker] No credentials provided (installToken, runtimeToken, or installationId + refreshToken). " +
                "Worker will not connect until credentials are provided.");
            this.degradedMode = true;
        }
        this.config = {
            heartbeatIntervalMs: 10000, // 10 seconds
            reconnectDelayMs: 1000, // 1 second initial
            maxReconnectDelayMs: 30000, // 30 seconds max
            capabilities: [],
            ...config,
            installToken: resolvedInstallToken,
            runtimeToken: resolvedRuntimeToken,
            installationId: resolvedInstallationId,
            refreshToken: resolvedRefreshToken,
        };
        this.credentialsStore = config.credentialsStore;
        this.tokenProvider = config.tokenProvider;
        this.policyGateway = config.policyGateway;
        this.reconnectDelay = this.config.reconnectDelayMs;
        this.runtimeToken = resolvedRuntimeToken || null;
        this.installationId = resolvedInstallationId || null;
        this.refreshToken = resolvedRefreshToken || null;
        if (this.credentialsStore) {
            this.credentialsStore.setApiBaseUrl(this.config.apiBaseUrl);
            this.credentialsStore.update({
                installationId: resolvedInstallationId,
                refreshToken: resolvedRefreshToken,
                runtimeToken: resolvedRuntimeToken,
            });
        }
    }
    getEnvVar(name) {
        if (typeof process !== 'undefined' && process.env) {
            return process.env[name];
        }
        return undefined;
    }
    /**
     * Register a handler for a specific capability
     */
    onTask(capability, handler) {
        this.handlers.set(capability, handler);
        console.log(`[Worker] Registered handler for capability: ${capability}`);
        return this;
    }
    /**
     * Start the worker (connects to SSE stream and starts heartbeat)
     *
     * Authentication priority:
     * 1. If runtimeToken is provided, use it directly
     * 2. If installationId + refreshToken are set, recover credentials
     * 3. Fall back to installToken for fresh bootstrap
     */
    async start() {
        if (this.degradedMode) {
            console.warn("[Worker] Cannot start in degraded mode - no credentials available.");
            return;
        }
        console.log("[Worker] Starting task worker...");
        let authenticated = false;
        // Priority 1: Already have runtime token
        const tokenFromProvider = this.tokenProvider?.();
        const tokenFromStore = this.credentialsStore?.getRuntimeToken();
        if (tokenFromProvider || tokenFromStore || this.runtimeToken) {
            if (tokenFromProvider) {
                this.runtimeToken = tokenFromProvider;
            }
            else if (tokenFromStore) {
                this.runtimeToken = tokenFromStore;
            }
            console.log("[Worker] Using provided runtime token");
            authenticated = true;
        }
        // Priority 2: Try credential recovery from env vars
        if (!authenticated && this.config.installationId && this.config.refreshToken) {
            console.log("[Worker] Attempting credential recovery from environment...");
            authenticated = await this.tryCredentialRecovery();
            if (authenticated) {
                this.recoveredFromEnv = true;
                console.log("[Worker] Successfully recovered credentials from environment");
            }
        }
        // Priority 3: Fall back to fresh bootstrap
        if (!authenticated) {
            await this.bootstrap();
            authenticated = true;
        }
        this.connect();
        this.startHeartbeat();
    }
    /**
     * Try to recover credentials using installation ID and refresh token.
     */
    async tryCredentialRecovery() {
        const installationId = this.getInstallationId() || this.config.installationId;
        const refreshToken = this.getRefreshToken() || this.config.refreshToken;
        if (!installationId || !refreshToken) {
            return false;
        }
        try {
            if (this.credentialsStore) {
                this.credentialsStore.update({ installationId, refreshToken });
                await this.credentialsStore.refreshRuntimeToken("Worker");
                this.installationId = installationId;
                this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
                this.refreshToken = refreshToken;
                const expiresAt = this.credentialsStore.getExpiresAt();
                this.expiresAt = expiresAt ? new Date(expiresAt).getTime() : null;
                console.log(`[Worker] Credentials recovered for installation: ${installationId}`);
                return true;
            }
            const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    refresh_token: refreshToken,
                }),
            });
            if (!response.ok) {
                const body = await response.text();
                console.error(`[Worker] Credential recovery failed: ${response.status} - ${body}`);
                return false;
            }
            const data = await response.json();
            this.installationId = installationId;
            this.runtimeToken = data.runtime_token;
            this.refreshToken = refreshToken;
            this.expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
            console.log(`[Worker] Credentials recovered for installation: ${installationId}`);
            return true;
        }
        catch (error) {
            console.error("[Worker] Credential recovery error:", error);
            return false;
        }
    }
    /**
     * Stop the worker gracefully
     */
    async stop() {
        console.log("[Worker] Stopping task worker...");
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.isConnected = false;
    }
    /**
     * Check if the worker is currently paused
     */
    getIsPaused() {
        return this.isPaused;
    }
    /**
     * Register a callback for control commands
     */
    onCommand(callback) {
        this.onCommandCallback = callback;
        return this;
    }
    /**
     * Handle control commands from SSE or heartbeat fallback
     */
    handleCommand(cmd) {
        console.log(`[Worker] Received command: ${cmd.type}`);
        switch (cmd.type) {
            case 'pause':
                this.isPaused = true;
                console.log('[Worker] Paused by administrator:', cmd.reason || 'No reason provided');
                break;
            case 'resume':
                this.isPaused = false;
                console.log('[Worker] Resumed by administrator');
                break;
            case 'terminate':
                console.log('[Worker] Terminating by administrator command...');
                this.stop().then(() => {
                    if (typeof process !== 'undefined') {
                        process.exit(0);
                    }
                });
                break;
            default:
                console.warn(`[Worker] Unknown command: ${cmd.type}`);
        }
        // Call user-defined callback if registered
        if (this.onCommandCallback) {
            this.onCommandCallback(cmd);
        }
    }
    /**
     * Get runtime token for API calls
     */
    getToken() {
        const tokenFromProvider = this.tokenProvider?.();
        if (tokenFromProvider) {
            this.runtimeToken = tokenFromProvider;
            return tokenFromProvider;
        }
        const tokenFromStore = this.credentialsStore?.getRuntimeToken();
        if (tokenFromStore) {
            this.runtimeToken = tokenFromStore;
            return tokenFromStore;
        }
        if (!this.runtimeToken) {
            throw new Error("No runtime token available - call bootstrap first");
        }
        return this.runtimeToken;
    }
    /**
     * Connect to SSE stream
     */
    connect() {
        const url = `${this.config.apiBaseUrl}/api/v1/tasks/stream`;
        console.log(`[Worker] Connecting to SSE stream: ${url}`);
        this.eventSource = new EventSource(url, {
            headers: {
                Authorization: `Bearer ${this.getToken()}`,
            },
        });
        this.eventSource.onopen = () => {
            console.log("[Worker] SSE connection established");
            this.isConnected = true;
            this.reconnectDelay = this.config.reconnectDelayMs; // Reset backoff
        };
        this.eventSource.addEventListener("connected", (event) => {
            const data = JSON.parse(event.data);
            console.log(`[Worker] Connected as agent: ${data.agent_id}`);
            console.log(`[Worker] Capabilities: ${data.capabilities?.join(", ") || "none"}`);
        });
        this.eventSource.addEventListener("new_task", async (event) => {
            const task = JSON.parse(event.data);
            await this.handleTask(task);
        });
        // Kill Switch: Listen for control commands
        this.eventSource.addEventListener("command", (event) => {
            const cmd = JSON.parse(event.data);
            this.handleCommand(cmd);
        });
        this.eventSource.onerror = (error) => {
            console.error("[Worker] SSE connection error:", error);
            this.isConnected = false;
            this.scheduleReconnect();
        };
    }
    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        console.log(`[Worker] Reconnecting in ${this.reconnectDelay}ms...`);
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, this.reconnectDelay);
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.config.maxReconnectDelayMs);
    }
    /**
     * Handle incoming task
     */
    async handleTask(task) {
        // Kill Switch: Block task execution if paused
        if (this.isPaused) {
            console.log(`[Worker] Task ${task.id} rejected - agent is paused`);
            await this.completeTask(task.id, "failed", null, { message: "Agent has been paused by administrator." });
            return;
        }
        console.log(`[Worker] Received task: ${task.id}`);
        // Find handler by capability or tool
        const capability = task.target_capability || task.target_tool || "default";
        if (this.policyGateway) {
            const rateLimitDecision = this.policyGateway.checkRateLimit("request");
            if (!rateLimitDecision.allowed) {
                const reason = rateLimitDecision.violations[0]?.message || "Rate limit exceeded";
                console.warn(`[Worker] Task ${task.id} rate limited: ${reason}`);
                await this.completeTask(task.id, "failed", null, { message: reason, code: "RATE_LIMIT_EXCEEDED" });
                return;
            }
            const decision = this.policyGateway.checkCapability(capability);
            if (!decision.allowed) {
                const reason = decision.violations[0]?.message || "Denied by policy";
                console.warn(`[Worker] Task ${task.id} denied by policy: ${reason}`);
                await this.completeTask(task.id, "failed", null, { message: reason, code: "POLICY_DENIED" });
                return;
            }
        }
        const handler = this.handlers.get(capability) || this.handlers.get("default");
        if (!handler) {
            console.warn(`[Worker] No handler for capability: ${capability}`);
            await this.completeTask(task.id, "failed", null, {
                error: `No handler registered for capability: ${capability}`,
            });
            return;
        }
        const ctx = {
            taskId: task.id,
            workspaceId: task.workspace_id,
            requesterId: task.requester_agent_id,
            parentTaskId: task.parent_task_id,
            traceId: task.trace_id,
            workflowId: task.workflow_id,
        };
        try {
            console.log(`[Worker] Executing handler for: ${capability}`);
            const result = await handler(ctx, task.input);
            await this.completeTask(task.id, "completed", result, null);
            console.log(`[Worker] Task ${task.id} completed successfully`);
        }
        catch (error) {
            console.error(`[Worker] Task ${task.id} failed:`, error);
            await this.completeTask(task.id, "failed", null, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Report task completion to Core
     */
    async completeTask(taskId, status, output, error) {
        try {
            await fetch(`${this.config.apiBaseUrl}/api/v1/tasks/${taskId}/complete`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.getToken()}`,
                },
                body: JSON.stringify({ status, output, error }),
            });
        }
        catch (e) {
            console.error(`[Worker] Failed to report task completion:`, e);
        }
    }
    /**
     * Register this agent installation with Sekuire using install_token
     * Returns runtime_token for subsequent API calls
     */
    async bootstrap() {
        // If we already have a runtime token, skip bootstrap
        if (this.runtimeToken) {
            console.log("[Worker] Using provided runtime token, skipping bootstrap");
            return;
        }
        if (!this.config.installToken) {
            throw new Error("No install token provided for bootstrap");
        }
        const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/bootstrap`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    install_token: this.config.installToken,
                    upstream_url: deploymentUrl,
                    capabilities: this.config.capabilities || [],
                    heartbeat_interval_seconds: Math.floor((this.config.heartbeatIntervalMs || 10000) / 1000),
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Bootstrap failed: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            applyBootstrapResponse(this, data);
            this.expiresAt = data.expires_at
                ? new Date(data.expires_at).getTime()
                : null;
            console.log(`[Worker] Bootstrapped installation: ${this.installationId}`);
        }
        catch (e) {
            console.error("[Worker] Bootstrap registration failed:", e);
            throw e;
        }
    }
    /**
     * Start heartbeat/lease renewal loop
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            const installationId = this.getInstallationId();
            if (!installationId) {
                return;
            }
            try {
                const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();
                const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/${installationId}/lease`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.getToken()}`,
                    },
                    body: JSON.stringify({
                        status: this.isPaused ? "stopped" : "running",
                        upstream_url: deploymentUrl,
                        heartbeat_interval_seconds: Math.floor((this.config.heartbeatIntervalMs || 10000) / 1000),
                    }),
                });
                if (response.status === 401) {
                    console.warn("[Worker] Runtime token expired, attempting refresh...");
                    try {
                        await this.refreshRuntimeToken();
                        return; // Will retry on next interval
                    }
                    catch {
                        console.error("[Worker] Token refresh failed, stopping worker");
                        await this.stop();
                        return;
                    }
                }
                if (response.ok) {
                    const data = await response.json();
                    // Handle server-side token auto-refresh (sliding expiration)
                    if (data.refreshed_token) {
                        this.runtimeToken = data.refreshed_token.runtime_token;
                        if (data.refreshed_token.expires_at) {
                            this.expiresAt = new Date(data.refreshed_token.expires_at).getTime();
                        }
                        this.credentialsStore?.setRuntimeToken(data.refreshed_token.runtime_token, data.refreshed_token.expires_at);
                        console.log(`[Worker] Token auto-refreshed by server (version ${data.refreshed_token.token_version})`);
                    }
                    if (data.command) {
                        this.handleCommand(data.command);
                    }
                    if (this.policyGateway && "active_policy_hash" in data) {
                        this.policyGateway.onHeartbeatResponse(data.active_policy_hash ?? null).catch((err) => {
                            console.warn("[Worker] Policy sync failed:", err);
                        });
                    }
                }
            }
            catch (e) {
                console.warn("[Worker] Heartbeat/lease failed:", e);
            }
        }, this.config.heartbeatIntervalMs);
    }
    /**
     * Refresh the runtime token using the refresh token
     */
    async refreshRuntimeToken() {
        if (this.credentialsStore) {
            await this.credentialsStore.refreshRuntimeToken("Worker");
            this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
            return;
        }
        const installationId = this.getInstallationId();
        const refreshToken = this.getRefreshToken();
        if (!installationId || !refreshToken) {
            throw new Error("Cannot refresh token - missing installation ID or refresh token");
        }
        const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                refresh_token: refreshToken,
            }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Token refresh failed: ${response.status} - ${body}`);
        }
        const data = await response.json();
        this.runtimeToken = data.runtime_token;
        console.log("[Worker] Runtime token refreshed successfully");
    }
    getInstallationId() {
        const storeValue = this.credentialsStore?.getInstallationId();
        if (storeValue) {
            this.installationId = storeValue;
            return storeValue;
        }
        return this.installationId;
    }
    getRefreshToken() {
        const storeValue = this.credentialsStore?.getRefreshToken();
        if (storeValue) {
            this.refreshToken = storeValue;
            return storeValue;
        }
        return this.refreshToken;
    }
}
// ============================================================================
// Convenience Export
// ============================================================================
function createWorker(config) {
    return new TaskWorker(config);
}

/**
 * SekuireSDK - Main SDK entry point for TypeScript agents
 *
 * Combines identity, logging, and heartbeat functionality with a simple API.
 */
const DEFAULT_API_URL = "https://api.sekuire.ai";
class SekuireSDK {
    constructor(config) {
        this.isRunning = false;
        this.policyGateway = null;
        if (!config.agentId) {
            throw new Error("agentId is required");
        }
        const apiKey = config.apiKey || process.env.SEKUIRE_API_KEY;
        const installToken = config.installToken || process.env.SEKUIRE_INSTALL_TOKEN;
        const installationId = config.installationId || process.env.SEKUIRE_INSTALLATION_ID;
        const refreshToken = config.refreshToken || process.env.SEKUIRE_REFRESH_TOKEN;
        const runtimeToken = config.runtimeToken || process.env.SEKUIRE_RUNTIME_TOKEN;
        const hasRecoveryCredentials = !!(installationId && refreshToken);
        const hasAnyCredentials = !!(apiKey ||
            installToken ||
            runtimeToken ||
            hasRecoveryCredentials);
        this.config = {
            privateKey: config.privateKey,
            apiKey,
            installToken,
            installationId,
            refreshToken,
            runtimeToken,
            agentId: config.agentId,
            agentName: config.agentName ?? "Unknown",
            apiUrl: (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, ""),
            workspaceId: config.workspaceId ?? "",
            environment: config.environment ?? "production",
            autoHeartbeat: config.autoHeartbeat !== false,
            heartbeatIntervalSeconds: config.heartbeatIntervalSeconds ?? 60,
            loggingEnabled: config.loggingEnabled !== false,
            capabilities: config.capabilities ?? [],
        };
        this.credentialsStore = new RuntimeCredentialsStore({
            installationId: this.config.installationId,
            refreshToken: this.config.refreshToken,
            runtimeToken: this.config.runtimeToken,
            apiBaseUrl: this.config.apiUrl,
        });
        this.identity = new AgentIdentity(this.config.agentName, this.config.agentId, this.config.privateKey);
        const loggerApiBaseUrl = config.apiUrl !== undefined || hasAnyCredentials
            ? this.config.apiUrl
            : undefined;
        const loggerConfig = {
            sekuireId: this.config.agentId,
            apiBaseUrl: loggerApiBaseUrl,
            apiKey: this.config.apiKey,
            workspaceId: this.config.workspaceId || undefined,
            environment: this.config.environment,
            enabled: this.config.loggingEnabled,
        };
        this.logger = new SekuireLogger(loggerConfig);
        this.client = axios.create({
            baseURL: this.config.apiUrl,
            timeout: 10000,
            headers: this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {},
        });
        this.beacon = new Beacon({
            apiBaseUrl: this.config.apiUrl,
            installToken: this.config.installToken,
            apiKey: this.config.apiKey,
            agentId: this.config.agentId,
            workspaceId: this.config.workspaceId || undefined,
            heartbeatIntervalSeconds: this.config.heartbeatIntervalSeconds,
            capabilities: this.config.capabilities,
            installationId: this.config.installationId,
            refreshToken: this.config.refreshToken,
            runtimeToken: this.config.runtimeToken,
            credentialsStore: this.credentialsStore,
        });
    }
    /**
     * Create SDK instance from environment variables.
     *
     * Required env vars:
     *   SEKUIRE_AGENT_ID - The agent's sekuire_id
     *
     * Authentication (one of the following):
     *   SEKUIRE_INSTALL_TOKEN - Install token from dashboard (for initial bootstrap)
     *   SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN - For credential recovery
     *
     * Optional env vars:
     *   SEKUIRE_API_KEY - API key for authentication (X-API-Key header)
     *   SEKUIRE_PRIVATE_KEY - Private key for signing
     *   SEKUIRE_AGENT_NAME - Human-readable agent name
     *   SEKUIRE_API_URL - API base URL (default: https://api.sekuire.ai)
     *   SEKUIRE_WORKSPACE_ID - Workspace ID for policy enforcement
     *   SEKUIRE_ENVIRONMENT - Environment name (default: production)
     *   SEKUIRE_RUNTIME_TOKEN - Pre-existing runtime token (skips refresh if valid)
     */
    static fromEnv(options) {
        const agentId = process.env.SEKUIRE_AGENT_ID;
        if (!agentId) {
            throw new Error("SEKUIRE_AGENT_ID environment variable is required");
        }
        return new SekuireSDK({
            privateKey: process.env.SEKUIRE_PRIVATE_KEY,
            apiKey: process.env.SEKUIRE_API_KEY,
            installToken: process.env.SEKUIRE_INSTALL_TOKEN,
            installationId: process.env.SEKUIRE_INSTALLATION_ID,
            refreshToken: process.env.SEKUIRE_REFRESH_TOKEN,
            runtimeToken: process.env.SEKUIRE_RUNTIME_TOKEN,
            agentId,
            agentName: process.env.SEKUIRE_AGENT_NAME,
            apiUrl: process.env.SEKUIRE_API_URL ?? DEFAULT_API_URL,
            workspaceId: process.env.SEKUIRE_WORKSPACE_ID,
            environment: process.env.SEKUIRE_ENVIRONMENT ?? "production",
            autoHeartbeat: options?.autoHeartbeat !== false,
            loggingEnabled: options?.loggingEnabled !== false,
        });
    }
    /**
     * Start the SDK.
     *
     * - Bootstraps with Sekuire using install token or recovery credentials
     * - Starts auto-heartbeat loop if enabled
     *
     * Authentication (one of):
     * - SEKUIRE_INSTALL_TOKEN for initial bootstrap
     * - SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN for recovery
     */
    async start() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        const hasInstallToken = !!this.config.installToken;
        const hasRecoveryCredentials = !!(this.config.installationId && this.config.refreshToken);
        if (this.config.workspaceId) {
            try {
                const policyClient = new PolicyClient(this.config.apiUrl);
                this.policyGateway = new PolicyGateway(policyClient, this.config.workspaceId);
                await this.policyGateway.initialize();
            }
            catch {
                console.warn("[SekuireSDK] PolicyGateway initialization failed, running without enforcement");
                this.policyGateway = null;
            }
        }
        if (this.policyGateway) {
            this.beacon.setPolicyGateway(this.policyGateway);
        }
        if (this.config.autoHeartbeat && (hasInstallToken || hasRecoveryCredentials)) {
            await this.beacon.start();
        }
        else if (this.config.autoHeartbeat && !hasInstallToken && !hasRecoveryCredentials) {
            console.warn("[SekuireSDK] Auto-heartbeat enabled but no credentials provided. Set one of:" +
                "\n  - SEKUIRE_INSTALL_TOKEN (for initial bootstrap)" +
                "\n  - SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN (for recovery)");
        }
    }
    /**
     * Check if the beacon is connected and sending heartbeats.
     *
     * @returns True if the beacon has successfully bootstrapped
     */
    isConnected() {
        const status = this.beacon.getStatus();
        return status.isRunning && !!status.installationId;
    }
    /**
     * Log an event to Sekuire.
     *
     * @param eventType Type of event (tool_execution, model_call, policy_check, etc.)
     * @param data Event-specific data
     * @param severity Severity level (debug, info, warn, error)
     */
    log(eventType, data, severity = "info") {
        this.logger.logEvent(eventType, severity, data);
    }
    /**
     * Check if an action is allowed by the workspace policy.
     *
     * @param action The action to check (e.g., "read_file", "network_access")
     * @param context Context for the action (e.g., {path: "/etc/passwd"})
     * @returns True if allowed, False if denied
     */
    async checkPolicy(action, context) {
        if (!this.config.workspaceId) {
            return true;
        }
        if (this.policyGateway) {
            const decision = this.policyGateway.checkCapability(action);
            return decision.allowed;
        }
        const payload = {
            action,
            resource: context.resource ?? "",
            context,
            agent_id: this.config.agentId,
        };
        try {
            const response = await this.client.post("/api/v1/policies/evaluate", payload);
            if (response.status === 200) {
                return response.data?.decision !== "deny";
            }
            return true;
        }
        catch {
            return true;
        }
    }
    /**
     * Shutdown the SDK gracefully.
     */
    async shutdown() {
        this.isRunning = false;
        this.beacon.stop();
        await this.logger.shutdown();
    }
    /**
     * Get the current beacon status (heartbeat health, connection info).
     */
    getBeaconStatus() {
        return this.beacon.getStatus();
    }
    /**
     * Get runtime credentials after SDK has started.
     *
     * Use this to share credentials with TaskWorker to avoid dual bootstrap
     * token consumption. The SDK must be started first.
     *
     * @returns Runtime credentials or null if not bootstrapped
     */
    getRuntimeCredentials() {
        return this.beacon.getRuntimeCredentials();
    }
    /**
     * Get full installation credentials for persistence.
     *
     * Use this after successful SDK start to extract credentials that can be
     * saved as environment variables or secrets for future container restarts.
     * These credentials allow recovery without consuming a new install token.
     *
     * Recommended workflow for ephemeral compute (Cloud Run, K8s, etc.):
     * 1. First deploy: use SEKUIRE_INSTALL_TOKEN for initial bootstrap
     * 2. After start: call getInstallationCredentials() to extract creds
     * 3. Save to secrets manager (AWS Secrets Manager, K8s Secret, etc.)
     * 4. Update deployment with:
     *    - SEKUIRE_INSTALLATION_ID
     *    - SEKUIRE_REFRESH_TOKEN
     *    - (optionally) SEKUIRE_RUNTIME_TOKEN
     * 5. Future restarts: SDK auto-recovers using refresh token
     *
     * @example
     * ```ts
     * const sdk = SekuireSDK.fromEnv();
     * await sdk.start();
     *
     * const creds = sdk.getInstallationCredentials();
     * if (creds) {
     *   console.log('Save these to your secrets manager:');
     *   console.log(`SEKUIRE_INSTALLATION_ID=${creds.installationId}`);
     *   console.log(`SEKUIRE_REFRESH_TOKEN=${creds.refreshToken}`);
     * }
     * ```
     *
     * @returns Full installation credentials or null if not bootstrapped
     */
    getInstallationCredentials() {
        return this.beacon.getInstallationCredentials();
    }
    /**
     * Create a TaskWorker that shares credentials with this SDK instance.
     *
     * This avoids the dual bootstrap token consumption issue by reusing
     * the runtime credentials from the SDK's beacon. The SDK must be started
     * before calling this method.
     *
     * The Worker receives full credentials (installationId, runtimeToken, refreshToken)
     * so it can independently refresh tokens when they expire.
     *
     * @param options Optional worker configuration overrides
     * @returns TaskWorker instance ready to be started
     * @throws Error if SDK hasn't been started or bootstrap failed
     *
     * @example
     * ```ts
     * const sdk = new SekuireSDK({ ... });
     * await sdk.start();
     *
     * const worker = sdk.createTaskWorker();
     * worker.onTask("my-capability", async (ctx, input) => {
     *   return { result: "done" };
     * });
     * await worker.start();
     * ```
     */
    createTaskWorker(options) {
        const credentials = this.getInstallationCredentials();
        if (!credentials) {
            throw new Error("SDK must be started before creating a TaskWorker. " +
                "Call sdk.start() first and ensure bootstrap succeeded.");
        }
        const workerConfig = {
            apiBaseUrl: this.config.apiUrl,
            agentId: this.config.agentId,
            runtimeToken: credentials.runtimeToken,
            installationId: credentials.installationId,
            refreshToken: credentials.refreshToken,
            credentialsStore: this.credentialsStore,
            tokenProvider: () => this.credentialsStore.getRuntimeToken(),
            deploymentUrl: detectDeploymentUrl(),
            capabilities: options?.capabilities ?? this.config.capabilities,
            heartbeatIntervalMs: options?.heartbeatIntervalMs,
            reconnectDelayMs: options?.reconnectDelayMs,
            maxReconnectDelayMs: options?.maxReconnectDelayMs,
            policyGateway: this.policyGateway ?? undefined,
        };
        return new TaskWorker(workerConfig);
    }
    /**
     * Create an A2A task delegator that reuses SDK runtime credentials when available.
     *
     * Route calls continue to use the SDK auth token (API key), while direct fallback
     * task registration/completion can use runtime token if bootstrapped.
     */
    createDelegator(options) {
        return new A2ATaskDelegator({
            apiUrl: this.config.apiUrl,
            authToken: this.config.apiKey || "",
            workspaceId: this.config.workspaceId,
            agentId: this.config.agentId,
            timeout: options?.timeout,
            pollInterval: options?.pollInterval,
            maxRetries: options?.maxRetries,
            retryDelayMs: options?.retryDelayMs,
            retryBackoffMultiplier: options?.retryBackoffMultiplier,
            policyGateway: this.policyGateway ?? undefined,
            tokenResolver: () => this.credentialsStore.getRuntimeToken(),
            onUnauthorized: async () => {
                await this.credentialsStore.refreshRuntimeToken("A2AClient");
            },
        });
    }
    /**
     * Get the agent ID.
     */
    get agentId() {
        return this.config.agentId;
    }
    /**
     * Get the agent's public key.
     */
    get publicKey() {
        return this.identity.publicKey;
    }
    /**
     * Sign a message with the agent's private key.
     */
    async sign(message) {
        return this.identity.sign(message);
    }
    /**
     * Verify a signature using the agent's public key.
     */
    verify(message, signature) {
        return this.identity.verify(message, signature);
    }
    /**
     * Get the underlying identity object.
     */
    getIdentity() {
        return this.identity;
    }
    /**
     * Get the underlying logger object.
     */
    getLogger() {
        return this.logger;
    }
    getPolicyGateway() {
        return this.policyGateway;
    }
}

/**
 * 🛡️ Sekuire Compliance Enforcement System for TypeScript
 *
 * Runtime compliance enforcement that blocks all unauthorized behavior.
 * Everything blocked unless explicitly allowed in sekuire.yaml.
 */
class ComplianceError extends Error {
    constructor(message, category = "general", details = {}) {
        super(message);
        this.category = category;
        this.details = details;
        this.name = "ComplianceError";
    }
}
class NetworkComplianceError extends ComplianceError {
    constructor(message, details = {}) {
        super(message, "network", details);
        this.name = "NetworkComplianceError";
    }
}
class FileAccessError extends ComplianceError {
    constructor(message, details = {}) {
        super(message, "filesystem", details);
        this.name = "FileAccessError";
    }
}
class ToolUsageError extends ComplianceError {
    constructor(message, details = {}) {
        super(message, "tools", details);
        this.name = "ToolUsageError";
    }
}
class ContentPolicyError extends ComplianceError {
    constructor(message, details = {}) {
        super(message, "content", details);
        this.name = "ContentPolicyError";
    }
}
// ==================== MAIN COMPLIANCE MONITOR ====================
/**
 * 🔒 Runtime compliance enforcement system
 *
 * Enforces all rules defined in sekuire.yaml:
 * - Network access control
 * - File system restrictions
 * - Tool usage limits
 * - Content filtering
 * - Environment variable access
 */
class ComplianceMonitor {
    constructor(configPath = "sekuire.yaml", logger) {
        this.configPath = configPath;
        this.violations = [];
        // Performance cache
        this.networkCache = new Map();
        this.contentCache = new Map();
        this.maxCacheSize = 10000;
        this.loadConfig();
        this.buildIndexes();
        this.logger = logger;
    }
    loadConfig() {
        try {
            const configContent = fs__namespace.readFileSync(this.configPath, "utf8");
            this.config = yaml__namespace.load(configContent);
            if (!this.config) {
                throw new Error("Invalid compliance configuration");
            }
        }
        catch (error) {
            throw new Error(`Failed to load compliance config: ${error.message}`);
        }
    }
    buildIndexes() {
        const permissions = this.config.permissions;
        // Network rules
        this.networkAllowSet = new Set(permissions.network.allow);
        this.networkBlockSet = new Set(permissions.network.block || []);
        // File system rules
        this.filesReadSet = new Set(permissions.filesystem.allow_read);
        this.filesWriteSet = new Set(permissions.filesystem.allow_write);
        this.filesBlockPatterns = permissions.filesystem.block_all || [];
        // Environment variable rules
        this.envAllowSet = new Set(permissions.env.allow);
        this.envBlockSet = new Set(permissions.env.block || []);
        // Tool rules - load from tools.json
        this.allowedToolsSet = this.loadAllowedTools();
        this.toolBlockPatterns = permissions.tools.blocked_patterns.map((pattern) => new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
        // Content filtering rules
        this.inputBlockPatterns = permissions.content.blocked_input_patterns.map((pattern) => new RegExp(pattern, "i"));
        this.outputBlockPatterns = permissions.content.blocked_output_patterns.map((pattern) => new RegExp(pattern, "i"));
        // Model restrictions
        this.allowedModelsSet = new Set(permissions.model.allowed_models);
    }
    loadAllowedTools() {
        const toolsPath = "tools.json"; // Default path
        if (!fs__namespace.existsSync(toolsPath)) {
            return new Set();
        }
        try {
            const toolsContent = fs__namespace.readFileSync(toolsPath, "utf8");
            const toolsData = JSON.parse(toolsContent);
            return new Set(toolsData
                .filter((tool) => tool.name)
                .map((tool) => tool.name));
        }
        catch (error) {
            console.error(`Failed to load tools configuration: ${error.message}`);
            return new Set();
        }
    }
    // ==================== NETWORK COMPLIANCE ====================
    /**
     * 🌐 Check if network access is allowed
     *
     * @param url Target URL
     * @param method HTTP method (GET, POST, etc.)
     * @throws NetworkComplianceError If access is blocked
     */
    checkNetworkAccess(url, method = "GET") {
        // Check cache first
        if (this.networkCache.has(url)) {
            return this.networkCache.get(url);
        }
        try {
            // Check blocklist first
            for (const blocked of this.networkBlockSet) {
                if (url.startsWith(blocked)) {
                    const violation = {
                        timestamp: new Date(),
                        category: "network",
                        message: `Network access to ${url} blocked by blocklist rule: ${blocked}`,
                        details: { url, method, rule: blocked },
                        agentId: this.config.agent.name,
                    };
                    this.logViolation(violation);
                    throw new NetworkComplianceError(violation.message, violation.details);
                }
            }
            // Check allowlist
            if (this.networkAllowSet.size > 0) {
                const allowed = Array.from(this.networkAllowSet).some((allowed) => url.startsWith(allowed));
                if (!allowed) {
                    const violation = {
                        timestamp: new Date(),
                        category: "network",
                        message: `Network access to ${url} not in allowlist`,
                        details: { url, method },
                        agentId: this.config.agent.name,
                    };
                    this.logViolation(violation);
                    throw new NetworkComplianceError(violation.message, violation.details);
                }
            }
            // Cache result
            this.setCacheValue(this.networkCache, url, true);
            // Log successful access for audit trail
            if (this.logger && this.config.logging?.log_network_requests) {
                this.logger.logEvent("network_access", "info", {
                    url,
                    method,
                    allowed: true,
                    agentId: this.config.agent.name,
                });
            }
            return true;
        }
        catch (error) {
            if (error instanceof NetworkComplianceError) {
                throw error;
            }
            const violation = {
                timestamp: new Date(),
                category: "network",
                message: `Network access check failed: ${error.message}`,
                details: { url, method, error: error.message },
                agentId: this.config.agent.name,
            };
            this.logViolation(violation);
            throw new NetworkComplianceError(violation.message, violation.details);
        }
    }
    /**
     * Create a safe fetch function with compliance enforcement
     */
    createSafeFetch(originalFetch = globalThis.fetch) {
        return async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();
            const method = init?.method || "GET";
            // Check compliance before making request
            this.checkNetworkAccess(url, method);
            // Make the request
            return originalFetch(input, init);
        };
    }
    // ==================== FILE SYSTEM COMPLIANCE ====================
    /**
     * 📁 Check if file access is allowed
     *
     * @param filePath File path
     * @param mode 'read', 'write', 'execute'
     * @throws FileAccessError If access is blocked
     */
    checkFileAccess(filePath, mode = "read") {
        try {
            // Normalize path
            const resolvedPath = path__namespace.resolve(filePath);
            // Check block patterns
            for (const blockedPattern of this.filesBlockPatterns) {
                if (resolvedPath.includes(blockedPattern) ||
                    resolvedPath.startsWith(blockedPattern)) {
                    const violation = {
                        timestamp: new Date(),
                        category: "filesystem",
                        message: `File access blocked by pattern: ${blockedPattern}`,
                        details: { path: resolvedPath, mode, pattern: blockedPattern },
                        agentId: this.config.agent.name,
                    };
                    this.logViolation(violation);
                    throw new FileAccessError(violation.message, violation.details);
                }
            }
            // Check allowlists
            if (mode === "read") {
                if (this.filesReadSet.size > 0) {
                    const allowed = Array.from(this.filesReadSet).some((allowed) => resolvedPath.endsWith(allowed) || resolvedPath === allowed);
                    if (!allowed) {
                        const violation = {
                            timestamp: new Date(),
                            category: "filesystem",
                            message: `File read access not allowed: ${resolvedPath}`,
                            details: { path: resolvedPath, mode },
                            agentId: this.config.agent.name,
                        };
                        this.logViolation(violation);
                        throw new FileAccessError(violation.message, violation.details);
                    }
                }
            }
            else if (mode === "write") {
                if (this.filesWriteSet.size > 0) {
                    const allowed = Array.from(this.filesWriteSet).some((allowed) => resolvedPath.startsWith(allowed));
                    if (!allowed) {
                        const violation = {
                            timestamp: new Date(),
                            category: "filesystem",
                            message: `File write access not allowed: ${resolvedPath}`,
                            details: { path: resolvedPath, mode },
                            agentId: this.config.agent.name,
                        };
                        this.logViolation(violation);
                        throw new FileAccessError(violation.message, violation.details);
                    }
                }
            }
            return true;
        }
        catch (error) {
            if (error instanceof FileAccessError) {
                throw error;
            }
            const violation = {
                timestamp: new Date(),
                category: "filesystem",
                message: `File access check failed: ${error.message}`,
                details: { path: filePath, mode, error: error.message },
                agentId: this.config.agent.name,
            };
            this.logViolation(violation);
            throw new FileAccessError(violation.message, violation.details);
        }
    }
    /**
     * Safe file reading with compliance check
     */
    safeReadFile(filePath, encoding = "utf8") {
        this.checkFileAccess(filePath, "read");
        return fs__namespace.readFileSync(filePath, encoding);
    }
    /**
     * Safe file writing with compliance check
     */
    safeWriteFile(filePath, data, encoding) {
        this.checkFileAccess(filePath, "write");
        fs__namespace.writeFileSync(filePath, data, encoding);
    }
    // ==================== ENVIRONMENT VARIABLE COMPLIANCE ====================
    /**
     * 🔐 Check if environment variable access is allowed
     *
     * @param varName Environment variable name
     * @throws ComplianceError If access is blocked
     */
    checkEnvAccess(varName) {
        try {
            // Check blocklist
            for (const blocked of this.envBlockSet) {
                if (varName.toLowerCase().includes(blocked.toLowerCase())) {
                    const violation = {
                        timestamp: new Date(),
                        category: "env",
                        message: `Environment variable access blocked: ${varName}`,
                        details: { varName },
                        agentId: this.config.agent.name,
                    };
                    this.logViolation(violation);
                    throw new ComplianceError(violation.message, "env", violation.details);
                }
            }
            // Check allowlist
            if (this.envAllowSet.size > 0 && !this.envAllowSet.has(varName)) {
                const violation = {
                    timestamp: new Date(),
                    category: "env",
                    message: `Environment variable ${varName} not in allowlist`,
                    details: { varName },
                    agentId: this.config.agent.name,
                };
                this.logViolation(violation);
                throw new ComplianceError(violation.message, "env", violation.details);
            }
            return true;
        }
        catch (error) {
            if (error instanceof ComplianceError) {
                throw error;
            }
            const violation = {
                timestamp: new Date(),
                category: "env",
                message: `Environment variable access check failed: ${error.message}`,
                details: { varName, error: error.message },
                agentId: this.config.agent.name,
            };
            this.logViolation(violation);
            throw new ComplianceError(violation.message, "env", violation.details);
        }
    }
    /**
     * Safe environment variable access
     */
    safeGetEnv(varName, defaultValue) {
        this.checkEnvAccess(varName);
        return process.env[varName] ?? defaultValue;
    }
    // ==================== TOOL USAGE COMPLIANCE ====================
    /**
     * 🛠️ Check if tool usage is allowed
     *
     * @param toolName Name of the tool
     * @param codeSnippet Code snippet for pattern checking
     * @throws ToolUsageError If tool usage is blocked
     */
    checkToolUsage(toolName, codeSnippet) {
        try {
            // Check blocked patterns in code
            if (codeSnippet) {
                for (const pattern of this.toolBlockPatterns) {
                    if (pattern.test(codeSnippet)) {
                        const violation = {
                            timestamp: new Date(),
                            category: "tools",
                            message: `Tool usage contains blocked pattern: ${pattern.source}`,
                            details: { tool: toolName, pattern: pattern.source },
                            agentId: this.config.agent.name,
                        };
                        this.logViolation(violation);
                        throw new ToolUsageError(violation.message, violation.details);
                    }
                }
            }
            // Check tool whitelist
            if (this.config.permissions.tools.enforce_whitelist &&
                !this.allowedToolsSet.has(toolName)) {
                const violation = {
                    timestamp: new Date(),
                    category: "tools",
                    message: `Tool ${toolName} not in approved tools.json whitelist`,
                    details: {
                        tool: toolName,
                        allowedTools: Array.from(this.allowedToolsSet),
                    },
                    agentId: this.config.agent.name,
                };
                this.logViolation(violation);
                throw new ToolUsageError(violation.message, violation.details);
            }
            if (this.logger && this.config.logging?.audit_all_tool_calls) {
                this.logger.logEvent("tool_execution", "info", {
                    tool: toolName,
                    allowed: true,
                    agentId: this.config.agent.name,
                });
            }
        }
        catch (error) {
            if (error instanceof ToolUsageError) {
                throw error;
            }
            const violation = {
                timestamp: new Date(),
                category: "tools",
                message: `Tool usage check failed: ${error.message}`,
                details: { tool: toolName, error: error.message },
                agentId: this.config.agent.name,
            };
            this.logViolation(violation);
            throw new ToolUsageError(violation.message, violation.details);
        }
    }
    // ==================== CONTENT POLICY COMPLIANCE ====================
    /**
     * 💬 Check input content for policy violations
     *
     * @param content Input content to check
     * @throws ContentPolicyError If content violates policy
     */
    checkInputContent(content) {
        this.checkContent(content, this.inputBlockPatterns, "input");
    }
    /**
     * 📤 Check output content for policy violations
     *
     * @param content Output content to check
     * @throws ContentPolicyError If content violates policy
     */
    checkOutputContent(content) {
        this.checkContent(content, this.outputBlockPatterns, "output");
    }
    checkContent(content, patterns, contentType) {
        const cacheKey = `${contentType}:${content.slice(0, 100)}`;
        if (this.contentCache.has(cacheKey)) {
            return;
        }
        try {
            for (const pattern of patterns) {
                if (pattern.test(content)) {
                    const violation = {
                        timestamp: new Date(),
                        category: "content",
                        message: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} contains blocked pattern: ${pattern.source}`,
                        details: {
                            pattern: pattern.source,
                            contentLength: content.length,
                            contentType,
                        },
                        agentId: this.config.agent.name,
                    };
                    this.logViolation(violation);
                    throw new ContentPolicyError(violation.message, violation.details);
                }
            }
            // Check response length limit
            const maxLength = this.config.permissions.content.max_response_length;
            if (contentType === "output" && maxLength && content.length > maxLength) {
                const violation = {
                    timestamp: new Date(),
                    category: "content",
                    message: `${contentType} length ${content.length} exceeds maximum ${maxLength}`,
                    details: { contentLength: content.length, maxLength, contentType },
                    agentId: this.config.agent.name,
                };
                this.logViolation(violation);
                throw new ContentPolicyError(violation.message, violation.details);
            }
            this.setCacheValue(this.contentCache, cacheKey, true);
        }
        catch (error) {
            if (error instanceof ContentPolicyError) {
                throw error;
            }
            const violation = {
                timestamp: new Date(),
                category: "content",
                message: `${contentType} content check failed: ${error.message}`,
                details: {
                    error: error.message,
                    contentLength: content.length,
                    contentType,
                },
                agentId: this.config.agent.name,
            };
            this.logViolation(violation);
            throw new ContentPolicyError(violation.message, violation.details);
        }
    }
    // ==================== AI MODEL COMPLIANCE ====================
    /**
     * 🤖 Check AI model usage compliance
     *
     * @param model Model name
     * @param temperature Temperature setting
     * @param maxTokens Max tokens setting
     * @throws ComplianceError If model usage violates rules
     */
    checkModelUsage(model, temperature, maxTokens) {
        try {
            // Check allowed models
            if (this.allowedModelsSet.size > 0 && !this.allowedModelsSet.has(model)) {
                const violation = {
                    timestamp: new Date(),
                    category: "model",
                    message: `Model ${model} not in allowlist`,
                    details: { model, allowedModels: Array.from(this.allowedModelsSet) },
                    agentId: this.config.agent.name,
                };
                this.logViolation(violation);
                throw new ComplianceError(violation.message, "model", violation.details);
            }
            // Check temperature
            if (temperature !== undefined &&
                temperature > this.config.permissions.model.max_temperature) {
                const violation = {
                    timestamp: new Date(),
                    category: "model",
                    message: `Temperature ${temperature} exceeds maximum ${this.config.permissions.model.max_temperature}`,
                    details: { model, temperature },
                    agentId: this.config.agent.name,
                };
                this.logViolation(violation);
                throw new ComplianceError(violation.message, "model", violation.details);
            }
            // Check max tokens
            if (maxTokens !== undefined &&
                maxTokens > this.config.permissions.model.max_tokens) {
                const violation = {
                    timestamp: new Date(),
                    category: "model",
                    message: `Max tokens ${maxTokens} exceeds maximum ${this.config.permissions.model.max_tokens}`,
                    details: { model, maxTokens },
                    agentId: this.config.agent.name,
                };
                this.logViolation(violation);
                throw new ComplianceError(violation.message, "model", violation.details);
            }
            return true;
        }
        catch (error) {
            if (error instanceof ComplianceError) {
                throw error;
            }
            const violation = {
                timestamp: new Date(),
                category: "model",
                message: `Model usage check failed: ${error.message}`,
                details: { model, error: error.message },
                agentId: this.config.agent.name,
            };
            this.logViolation(violation);
            throw new ComplianceError(violation.message, "model", violation.details);
        }
    }
    // ==================== INTEGRITY CHECKING ====================
    /**
     * 🔢 Generate BLAKE3 hash for content integrity checking
     */
    hashContent(content) {
        return crypto__namespace.createHash("blake3").update(content).digest("hex");
    }
    /**
     * Verify file hasn't been modified
     */
    checkFileIntegrity(filePath, expectedHash) {
        try {
            const content = fs__namespace.readFileSync(filePath, "utf8");
            const actualHash = this.hashContent(content);
            if (actualHash !== expectedHash) {
                const violation = {
                    timestamp: new Date(),
                    category: "integrity",
                    message: `File integrity check failed: ${filePath}`,
                    details: {
                        file: filePath,
                        expected: expectedHash,
                        actual: actualHash,
                    },
                    agentId: this.config.agent.name,
                };
                this.logViolation(violation);
                throw new ComplianceError(violation.message, "integrity", violation.details);
            }
            return true;
        }
        catch (error) {
            if (error instanceof ComplianceError) {
                throw error;
            }
            const violation = {
                timestamp: new Date(),
                category: "integrity",
                message: `File integrity check failed: ${error.message}`,
                details: { file: filePath, error: error.message },
                agentId: this.config.agent.name,
            };
            this.logViolation(violation);
            throw new ComplianceError(violation.message, "integrity", violation.details);
        }
    }
    // ==================== MONITORING & LOGGING ====================
    /**
     * Log compliance violation
     */
    logViolation(violation) {
        this.violations.push(violation);
        // Console warning for development
        console.warn(`⚠️ Compliance Violation [${violation.category}]: ${violation.message}`);
        // Log to Sekuire API via logger
        if (this.logger) {
            this.logger.logEvent("policy_violation", "error", {
                category: violation.category,
                message: violation.message,
                details: violation.details,
                agentId: violation.agentId,
                timestamp: violation.timestamp.toISOString(),
            });
        }
        // Send alerts if configured
        if (this.config.alerts?.[`${violation.category}_violation`]) {
            this.sendSecurityAlert(violation);
        }
        // Keep cache size manageable
        if (this.violations.length > 10000) {
            this.violations = this.violations.slice(-5e3);
        }
    }
    /**
     * 🚨 Send security alert to monitoring systems
     */
    async sendSecurityAlert(violation) {
        try {
            // TODO: Integrate with enterprise monitoring systems
            // - Send to SIEM
            // - Send to security teams
            // - Create tickets
            // - Send to webhook endpoints
            console.log(`🚨 Security Alert: ${violation.category} - ${violation.message}`);
        }
        catch (error) {
            console.error(`Failed to send security alert: ${error.message}`);
        }
    }
    /**
     * 📊 Get current compliance status and statistics
     */
    getComplianceStatus() {
        return {
            configLoaded: true,
            configFile: this.configPath,
            violationsCount: this.violations.length,
            lastViolation: this.violations.length > 0
                ? this.violations[this.violations.length - 1]
                : null,
            rulesEnforced: [
                "network_access",
                "file_access",
                "tool_usage",
                "content_filtering",
                "env_var_access",
                "model_usage",
            ],
            securityStats: {
                networkRules: this.networkAllowSet.size + this.networkBlockSet.size,
                allowedTools: this.allowedToolsSet.size,
                contentPatterns: this.inputBlockPatterns.length + this.outputBlockPatterns.length,
                cacheSize: this.networkCache.size + this.contentCache.size,
            },
        };
    }
    /**
     * Get recent violations
     */
    getViolations(category, limit = 100) {
        let violations = this.violations;
        if (category) {
            violations = violations.filter((v) => v.category === category);
        }
        return limit > 0 ? violations.slice(-limit) : violations;
    }
    /**
     * Clear violation log
     */
    clearViolations() {
        this.violations = [];
        this.networkCache.clear();
        this.contentCache.clear();
    }
    // ==================== PERFORMANCE OPTIMIZATIONS ====================
    /**
     * Set cache value with size limit
     */
    setCacheValue(cache, key, value) {
        if (cache.size >= this.maxCacheSize) {
            // Remove oldest entries (simple FIFO)
            const keysToDelete = Array.from(cache.keys()).slice(0, Math.floor(this.maxCacheSize * 0.2));
            keysToDelete.forEach((k) => cache.delete(k));
        }
        cache.set(key, value);
    }
    /**
     * Pre-warm caches with common operations
     */
    preWarmCaches() {
        // Pre-warm network cache with common domains
        const commonDomains = [
            "https://api.openai.com",
            "https://api.anthropic.com",
            "https://registry.sekuire.ai",
        ];
        commonDomains.forEach((domain) => {
            try {
                this.checkNetworkAccess(domain);
            }
            catch {
                // Ignore errors during pre-warm
            }
        });
    }
}

/**
 * Sekuire Agent Framework
 *
 * High-level API for building compliant AI agents with automatic
 * identity verification, compliance enforcement, and event logging.
 */
// ============================================================================
// Sekuire Agent
// ============================================================================
let SekuireAgent$1 = class SekuireAgent {
    constructor(identity, compliance, logger) {
        this.tools = new Map();
        this.identity = identity;
        this.compliance = compliance;
        this.logger = logger;
    }
    /**
     * Get agent identity
     */
    getIdentity() {
        return this.identity;
    }
    /**
     * Get compliance monitor
     */
    getCompliance() {
        return this.compliance;
    }
    /**
     * Get logger
     */
    getLogger() {
        return this.logger;
    }
    /**
     * Register a tool with the agent
     */
    registerTool(tool) {
        // Wrap tool with compliance checks
        const wrappedTool = {
            ...tool,
            execute: async (input) => {
                try {
                    // Check tool usage compliance
                    this.compliance.checkToolUsage(tool.name, JSON.stringify(input));
                    // Run custom pre-execution checks
                    if (tool.beforeExecute) {
                        await tool.beforeExecute(input);
                    }
                    // Log tool execution
                    this.logger.logEvent("tool_execution", "info", {
                        tool: tool.name,
                        input,
                        status: "allowed",
                    });
                    // Execute the tool
                    const result = await tool.execute(input);
                    return result;
                }
                catch (error) {
                    // Log violation
                    this.logger.logEvent("policy_violation", "error", {
                        tool: tool.name,
                        input,
                        error: error.message,
                    });
                    throw error;
                }
            },
        };
        this.tools.set(tool.name, wrappedTool);
        return this;
    }
    /**
     * Register multiple tools at once
     */
    registerTools(tools) {
        tools.forEach((tool) => this.registerTool(tool));
        return this;
    }
    /**
     * Get registered tools
     */
    getTools(names) {
        if (names) {
            return names
                .map((name) => this.tools.get(name))
                .filter((tool) => tool !== undefined);
        }
        return Array.from(this.tools.values());
    }
    /**
     * Execute a tool by name
     */
    async executeTool(name, input) {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool '${name}' not found`);
        }
        // Validate input
        const validatedInput = tool.schema.parse(input);
        // Execute (compliance checks happen inside)
        return await tool.execute(validatedInput);
    }
    /**
     * Invoke the agent (to be implemented by subclasses or plugins)
     */
    async invoke(options) {
        throw new Error("invoke() must be implemented by a plugin or subclass");
    }
    /**
     * Shutdown agent and flush logs
     */
    async shutdown() {
        await this.logger.flush();
        await this.logger.shutdown();
    }
};
// ============================================================================
// Agent Builder
// ============================================================================
class SekuireAgentBuilder {
    constructor() {
        this.config = {};
        this.tools = [];
    }
    /**
     * Set agent identity
     */
    withIdentity(identity) {
        this.config.identity = identity;
        return this;
    }
    /**
     * Load identity from disk
     */
    async loadIdentity(path) {
        this.config.identity = await AgentIdentity.load(path);
        return this;
    }
    /**
     * Set compliance config path
     */
    withConfig(path) {
        this.config.configPath = path;
        return this;
    }
    /**
     * Set logger options
     */
    withLogger(options) {
        this.config.logger = options;
        return this;
    }
    /**
     * Add a tool
     */
    withTool(tool) {
        this.tools.push(tool);
        return this;
    }
    /**
     * Add multiple tools
     */
    withTools(tools) {
        this.tools.push(...tools);
        return this;
    }
    /**
     * Build the agent
     */
    async build() {
        // Load identity if not provided
        if (!this.config.identity) {
            this.config.identity = await AgentIdentity.load(this.config.configPath);
        }
        const identity = this.config.identity;
        // Create logger
        const logger = new SekuireLogger({
            sekuireId: identity.sekuireId,
            apiBaseUrl: this.config.logger?.apiBaseUrl || "http://localhost:9300",
            environment: this.config.logger?.environment || "development",
            enabled: this.config.logger?.enabled !== false,
        });
        // Create compliance monitor
        const compliance = this.config.compliance ||
            new ComplianceMonitor(this.config.configPath || "./sekuire.yaml", logger);
        // Create agent
        const agent = new SekuireAgent$1(identity, compliance, logger);
        // Register tools
        agent.registerTools(this.tools);
        return agent;
    }
}
// ============================================================================
// Convenience Functions (LangChain-style API)
// ============================================================================
/**
 * Create a new Sekuire agent with compliance and identity
 *
 * @example
 * ```typescript
 * const agent = await createAgent({
 *   configPath: './sekuire.yaml',
 *   tools: [weatherTool, calculatorTool],
 * });
 * ```
 */
async function createAgent(config) {
    const builder = new SekuireAgentBuilder();
    if (config?.identity) {
        builder.withIdentity(config.identity);
    }
    else {
        await builder.loadIdentity(config?.configPath);
    }
    if (config?.configPath) {
        builder.withConfig(config.configPath);
    }
    if (config?.logger) {
        builder.withLogger(config.logger);
    }
    if (config?.tools) {
        builder.withTools(config.tools);
    }
    return await builder.build();
}
/**
 * Create a compliant tool definition
 *
 * @example
 * ```typescript
 * const weatherTool = tool({
 *   name: 'get_weather',
 *   description: 'Get weather for a city',
 *   schema: z.object({
 *     city: z.string(),
 *   }),
 *   execute: async ({ city }) => {
 *     return `Weather in ${city}: Sunny`;
 *   },
 * });
 * ```
 */
function tool(definition) {
    return definition;
}
/**
 * Create multiple tools at once
 *
 * @example
 * ```typescript
 * const [weather, calc] = tools(
 *   { name: 'weather', ... },
 *   { name: 'calculator', ... }
 * );
 * ```
 */
function tools(...definitions) {
    return definitions;
}
/**
 * Get tools registered with an agent
 */
function getTools$1(agent, names) {
    return agent.getTools(names);
}

const getFetch = () => {
    if (typeof globalThis.fetch !== 'undefined') {
        return globalThis.fetch.bind(globalThis);
    }
    throw new Error('fetch is not available. Please use Node.js 18+ or install node-fetch.');
};
class HttpClient {
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.timeout = config.timeout ?? 30000;
        this.retries = config.retries ?? 3;
        this.apiKey = config.apiKey;
        this.authToken = config.authToken;
    }
    setAuthToken(token) {
        this.authToken = token;
    }
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }
    async get(path, params) {
        let url = this.resolveUrl(path);
        if (params) {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) {
                    searchParams.append(key, String(value));
                }
            }
            const queryString = searchParams.toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        }
        const response = await this.fetchWithRetry(url, { method: 'GET' });
        if (!response.ok) {
            throw new ProtocolError(`HTTP ${response.status}: ${response.statusText}`, response.status);
        }
        return response.json();
    }
    async post(path, data) {
        const url = this.resolveUrl(path);
        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            throw new ProtocolError(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`, response.status);
        }
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }
    async put(path, data) {
        const url = this.resolveUrl(path);
        const response = await this.fetchWithRetry(url, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined,
        });
        if (!response.ok) {
            throw new ProtocolError(`HTTP ${response.status}: ${response.statusText}`, response.status);
        }
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }
    async delete(path) {
        const url = this.resolveUrl(path);
        const response = await this.fetchWithRetry(url, { method: 'DELETE' });
        if (!response.ok) {
            throw new ProtocolError(`HTTP ${response.status}: ${response.statusText}`, response.status);
        }
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }
    resolveUrl(path) {
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        return `${this.baseUrl}${path}`;
    }
    async fetchWithRetry(url, options = {}, attempt = 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers,
            };
            if (this.authToken) {
                headers.Authorization = `Bearer ${this.authToken}`;
            }
            if (this.apiKey) {
                headers['X-API-Key'] = this.apiKey;
            }
            const response = await getFetch()(url, {
                ...options,
                signal: controller.signal,
                headers,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            if (attempt < this.retries && this.shouldRetry(error)) {
                await this.delay(2 ** attempt * 1000);
                return this.fetchWithRetry(url, options, attempt + 1);
            }
            throw new NetworkError(`HTTP request failed: ${error.message}`, error);
        }
    }
    shouldRetry(error) {
        const err = error;
        if (err.name === 'AbortError')
            return false;
        if (err.code === 'ECONNRESET')
            return true;
        if (err.code === 'ETIMEDOUT')
            return true;
        return false;
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

/**
 * Sekuire client for verifying agents and performing handshakes
 */
class SekuireClient {
    constructor(keyPair, config) {
        this.keyPair = keyPair;
        this.httpClient = new HttpClient({
            baseUrl: config.registryUrl,
            apiKey: config.apiKey,
            timeout: config.timeout,
            retries: config.retries,
        });
    }
    /**
     * Perform the full handshake with a remote agent
     */
    async connect(agentUrl, expectedAgentId) {
        try {
            // 1. Generate client nonce
            const clientNonce = SekuireCrypto.generateNonce();
            // 2. Send HELLO
            const hello = { clientNonce };
            const welcome = await this.httpClient.post(`${agentUrl}/sekuire/hello`, hello);
            // 3. Verify agent ID if provided
            if (expectedAgentId && welcome.agentId !== expectedAgentId) {
                throw new ProtocolError(`Agent ID mismatch. Expected ${expectedAgentId}, got ${welcome.agentId}`);
            }
            // 4. Verify signature C (Agent signed our nonce)
            await this.verifyAgentSignature(clientNonce, welcome.agentId, welcome.signatureC, welcome.agentPublicKey);
            // 5. Sign agent nonce and send AUTH
            const signatureA = SekuireCrypto.sign(welcome.agentNonce, this.keyPair.privateKey);
            const auth = {
                signatureA,
                clientPublicKey: this.keyPair.publicKey,
                clientNonce,
            };
            const authResult = await this.httpClient.post(`${agentUrl}/sekuire/auth`, auth);
            this.sessionToken = authResult.sessionToken;
            return {
                agentId: welcome.agentId,
                verified: true,
                credentials: welcome.credentials,
                sessionToken: authResult.sessionToken,
            };
        }
        catch (error) {
            if (error instanceof NetworkError ||
                error instanceof ProtocolError ||
                error instanceof CryptoError) {
                throw error;
            }
            throw new NetworkError(`Handshake failed: ${error.message}`, error);
        }
    }
    /**
     * Verify an agent's signature
     */
    async verifyAgentSignature(clientNonce, agentId, signatureHex, directPublicKey) {
        try {
            let publicKey = directPublicKey;
            if (publicKey && !SekuireCrypto.isValidPublicKey(publicKey)) {
                throw new CryptoError("Invalid public key format from handshake response");
            }
            if (!publicKey) {
                publicKey = await this.fetchAgentPublicKey(agentId);
            }
            // Verify the signature
            const isValid = SekuireCrypto.verify(clientNonce, signatureHex, publicKey);
            if (!isValid) {
                throw new CryptoError("Agent signature verification failed");
            }
        }
        catch (error) {
            if (error instanceof CryptoError) {
                throw error;
            }
            throw new NetworkError(`Failed to verify agent signature: ${error.message}`, error);
        }
    }
    /**
     * Fetch agent's public key from the registry
     */
    async fetchAgentPublicKey(agentId) {
        try {
            const agentData = await this.httpClient.get(`/api/v1/agents/${agentId}`);
            if (!agentData.authorKey) {
                throw new ProtocolError("Registry response missing authorKey");
            }
            if (!SekuireCrypto.isValidPublicKey(agentData.authorKey)) {
                throw new CryptoError("Invalid public key format from registry");
            }
            return agentData.authorKey;
        }
        catch (error) {
            if (error instanceof ProtocolError || error instanceof CryptoError) {
                throw error;
            }
            throw new NetworkError(`Registry lookup failed for ${agentId}`, error);
        }
    }
    /**
     * Get agent information from the registry
     */
    async getAgentInfo(agentId) {
        try {
            return await this.httpClient.get(`/api/v1/agents/${agentId}`);
        }
        catch (error) {
            if (error instanceof ProtocolError) {
                throw error;
            }
            throw new NetworkError(`Failed to fetch agent info: ${error.message}`, error);
        }
    }
    /**
     * Search for agents in the registry
     */
    async searchAgents(query) {
        try {
            const response = await this.httpClient.get(`/api/v1/agents/search?q=${encodeURIComponent(query)}`);
            return response.agents || [];
        }
        catch (error) {
            if (error instanceof ProtocolError) {
                throw error;
            }
            throw new NetworkError(`Failed to search agents: ${error.message}`, error);
        }
    }
    /**
     * Sign data with the client's private key
     */
    sign(data) {
        return SekuireCrypto.sign(data, this.keyPair.privateKey);
    }
    buildRequestSignatureMessage(method, path, timestampMs, body) {
        const normalizedBody = body === undefined ? "" : JSON.stringify(body);
        const bodyHash = SekuireCrypto.hash(normalizedBody);
        return `${method.toUpperCase()}\n${path}\n${timestampMs}\n${bodyHash}`;
    }
    /**
     * Build signed headers for protected agent endpoints (for example /chat, /webhook).
     * Requires a successful connect() call to obtain a session token.
     */
    createSignedRequestHeaders(method, path, body, timestampMs = Date.now()) {
        if (!this.sessionToken) {
            throw new ProtocolError("No active session token. Call connect() before signing requests.");
        }
        const message = this.buildRequestSignatureMessage(method, path, timestampMs, body);
        const signature = SekuireCrypto.sign(message, this.keyPair.privateKey);
        return {
            "x-sekuire-session": this.sessionToken,
            "x-sekuire-timestamp": String(Math.floor(timestampMs)),
            "x-sekuire-signature": signature,
        };
    }
    /**
     * Get the current authenticated session token, if any.
     */
    getSessionToken() {
        return this.sessionToken;
    }
    /**
     * Clear the local session token.
     */
    clearSession() {
        this.sessionToken = undefined;
    }
    /**
     * Get the client's public key
     */
    getPublicKey() {
        return this.keyPair.publicKey;
    }
}

class SekuireRegistryClient {
    constructor(config, authToken) {
        const cfg = typeof config === "string" ? { apiUrl: config } : config;
        this.http = new HttpClient({
            baseUrl: cfg.apiUrl,
            timeout: cfg.timeout,
            retries: cfg.retries,
            apiKey: cfg.apiKey || process.env.SEKUIRE_API_KEY,
            authToken,
        });
    }
    setAuthToken(token) {
        this.http.setAuthToken(token);
    }
    setApiKey(apiKey) {
        this.http.setApiKey(apiKey);
    }
    async publishAgent(options) {
        const { manifest, privateKeyHex, systemPrompt, tools, publisherOrgId, visibility } = options;
        const sekuireId = SekuireCrypto.calculateSekuireId({
            model: manifest.identity.model,
            systemPrompt,
            tools,
            projectName: manifest.project.name,
            projectVersion: manifest.project.version,
        });
        const signature = SekuireCrypto.sign(sekuireId, privateKeyHex);
        const publicKeyBytes = SekuireCrypto.hexToBytes(privateKeyHex).slice(32);
        const publicKey = SekuireCrypto.bytesToHex(publicKeyBytes);
        const payload = {
            manifest,
            sekuireId,
            signature,
            publicKey,
            systemPromptHash: SekuireCrypto.hash(systemPrompt),
            toolsHash: SekuireCrypto.hash(tools),
            publisherOrgId,
            visibility: visibility || "public",
        };
        return this.http.post("/api/v1/publish", payload);
    }
    async getAgent(sekuireId) {
        return this.http.get(`/api/v1/agents/${sekuireId}`);
    }
    async updateAgent(sekuireId, options) {
        return this.http.put(`/api/v1/agents/${sekuireId}`, options);
    }
    async deleteAgent(sekuireId) {
        await this.http.delete(`/api/v1/agents/${sekuireId}/delete`);
    }
    async listAgents(options) {
        const params = {};
        if (options?.query)
            params.q = options.query;
        if (options?.tags?.length)
            params.tags = options.tags.join(",");
        if (options?.verificationStatus)
            params.verification_status = options.verificationStatus;
        if (options?.category)
            params.category = options.category;
        if (options?.limit)
            params.limit = options.limit;
        if (options?.offset)
            params.offset = options.offset;
        const response = await this.http.get("/api/v1/agents", params);
        return response.agents || [];
    }
    async searchAgents(query, options) {
        return this.listAgents({ ...options, query });
    }
    async getMyAgents() {
        const response = await this.http.get("/api/v1/agents/me");
        return response.agents || [];
    }
    async getReputation(sekuireId) {
        return this.http.get(`/api/v1/agents/${sekuireId}/reputation`);
    }
    async recordTaskCompletion(sekuireId, task, privateKeyHex) {
        const payload = {
            sekuireId,
            taskHash: task.taskHash,
            rating: task.rating,
            comment: task.comment,
            signature: SekuireCrypto.sign(`${sekuireId}:${task.taskHash}:${task.rating}`, privateKeyHex),
        };
        await this.http.post("/api/v1/tasks/complete", payload);
    }
    async getLeaderboard(limit = 10) {
        const response = await this.http.get("/api/v1/leaderboard", { limit });
        return response.entries || [];
    }
    async fileDispute(sekuireId, reason, evidenceLog, accuserId) {
        const payload = {
            sekuireId,
            accuserId,
            reason,
            evidenceLog,
        };
        return this.http.post("/api/v1/disputes", payload);
    }
    async verifyAgentQuick(sekuireId) {
        return this.http.post("/api/v1/verify-agent", { sekuireId });
    }
    async verifyAgentComprehensive(request) {
        return this.http.post("/api/v1/agents/verify/comprehensive", request);
    }
    async getVerificationHistory(sekuireId) {
        const response = await this.http.get(`/api/v1/agents/${sekuireId}/verifications`);
        return response.verifications || [];
    }
    async getLatestVerification(sekuireId) {
        try {
            return await this.http.get(`/api/v1/agents/${sekuireId}/verification`);
        }
        catch (error) {
            if (error instanceof ProtocolError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }
    async generateTrustHeaders(request) {
        return this.http.post("/api/v1/trust/headers", request);
    }
    async getTrustProfile(agentDid) {
        return this.http.get(`/api/v1/trust/profile/${agentDid}`);
    }
    async getTransactionHistory(agentDid) {
        const response = await this.http.get(`/api/v1/trust/transactions/${agentDid}`);
        return response.transactions || [];
    }
    async createTask(task) {
        return this.http.post("/api/v1/tasks", task);
    }
    async getTask(taskId) {
        return this.http.get(`/api/v1/tasks/${taskId}`);
    }
    async completeTask(taskId, result, privateKeyHex) {
        const signature = SekuireCrypto.sign(`task:${taskId}:complete`, privateKeyHex);
        await this.http.post(`/api/v1/tasks/${taskId}/complete`, {
            result,
            signature,
        });
    }
    async getRegistryStats() {
        return this.http.get("/api/v1/agents/stats");
    }
    async getCategories() {
        return this.http.get("/api/v1/categories");
    }
    async getAgentsByCategory(categorySlug) {
        const response = await this.http.get(`/api/v1/categories/${categorySlug}/agents`);
        return response.agents || [];
    }
    async getWorkspace(workspaceId) {
        return this.http.get(`/api/v1/workspaces/${workspaceId}`);
    }
    async getWorkspacePolicies(workspaceId) {
        const response = await this.http.get(`/api/v1/workspaces/${workspaceId}/policies`);
        return response.policies || [];
    }
    async getActivePolicy(workspaceId) {
        return this.http.get(`/api/v1/workspaces/${workspaceId}/policy/active`);
    }
    async getPolicyTemplates() {
        const response = await this.http.get("/api/v1/policies/templates");
        return response.templates || [];
    }
    async evaluatePolicy(workspaceId, action) {
        return this.http.post("/api/v1/policies/evaluate", {
            workspaceId,
            action,
        });
    }
    async logAgentEvents(sekuireId, events) {
        await this.http.post(`/api/v1/agents/${sekuireId}/logs/batch`, { events });
    }
    async logAgentHealth(sekuireId, health) {
        await this.http.post(`/api/v1/agents/${sekuireId}/logs/health`, health);
    }
    async getAgentLogs(sekuireId, options) {
        const response = await this.http.get(`/api/v1/agents/${sekuireId}/logs`, options);
        return response.logs || [];
    }
}
function createRegistryClient(apiUrl, authToken, apiKey) {
    return new SekuireRegistryClient({ apiUrl, apiKey }, authToken);
}

/**
 * Load sekuire.yml configuration file
 */
async function loadConfig(configPath = './sekuire.yml') {
    try {
        const content = await fs$1.readFile(configPath, 'utf-8');
        const config = yaml.load(content);
        return resolveEnvVars(config);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Config file not found: ${configPath}`);
        }
        throw error;
    }
}
/**
 * Load system prompt from file
 */
async function loadSystemPrompt(promptPath, basePath = '.') {
    try {
        const fullPath = path.isAbsolute(promptPath) ? promptPath : path.join(basePath, promptPath);
        return await fs$1.readFile(fullPath, 'utf-8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`System prompt file not found: ${promptPath}`);
        }
        throw error;
    }
}
/**
 * Load tools configuration from JSON file
 */
async function loadTools(toolsPath, basePath = '.') {
    try {
        const fullPath = path.isAbsolute(toolsPath) ? toolsPath : path.join(basePath, toolsPath);
        const content = await fs$1.readFile(fullPath, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Tools file not found: ${toolsPath}`);
        }
        throw error;
    }
}
/**
 * Resolve environment variables in config strings
 * Supports ${VAR} and ${VAR:-default} syntax
 */
function resolveEnvVars(obj) {
    if (typeof obj === 'string') {
        // Match ${VAR} or ${VAR:-default}
        return obj.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (match, varName, defaultValue) => {
            const value = process.env[varName];
            return value !== undefined ? value : defaultValue || match;
        });
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => resolveEnvVars(item));
    }
    if (obj !== null && typeof obj === 'object') {
        const resolved = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[key] = resolveEnvVars(value);
        }
        return resolved;
    }
    return obj;
}
/**
 * Get agent configuration by name
 * Supports both single agent and multi-agent configs
 */
function getAgentConfig(config, agentName) {
    // Multi-agent config
    if (config.agents) {
        if (!agentName) {
            // Return first agent if no name specified
            const firstKey = Object.keys(config.agents)[0];
            if (!firstKey) {
                throw new Error('No agents defined in sekuire.yml');
            }
            return config.agents[firstKey];
        }
        const agentConfig = config.agents[agentName];
        if (!agentConfig) {
            throw new Error(`Agent '${agentName}' not found in sekuire.yml`);
        }
        return agentConfig;
    }
    // Single agent config
    if (config.agent) {
        const agentConfig = config.agent;
        // If agent config doesn't have LLM but root does, merge it
        if (!agentConfig.llm && config.llm) {
            return {
                ...agentConfig,
                name: agentConfig.name || config.project.name,
                llm: config.llm,
            };
        }
        return agentConfig;
    }
    // Legacy: use top-level llm config
    if (config.llm) {
        return {
            name: config.project.name,
            system_prompt: './system_prompt.md',
            tools: './tools.json',
            llm: config.llm,
        };
    }
    throw new Error('No agent configuration found in sekuire.yml');
}

class BaseLLMProvider {
    constructor(config) {
        this.model = config.model;
        this.maxTokens = config.maxTokens || this.getMaxTokensForModel(config.model);
    }
    countTokens(text) {
        return Math.ceil(text.length / 4);
    }
    getMaxTokens() {
        return this.maxTokens;
    }
    getModelName() {
        return this.model;
    }
}

let _Anthropic;
async function loadAnthropicSDK() {
    if (!_Anthropic) {
        try {
            const mod = await import('@anthropic-ai/sdk');
            _Anthropic = mod.default || mod;
        }
        catch {
            throw new Error('@anthropic-ai/sdk is required to use AnthropicProvider. Install it with: npm install @anthropic-ai/sdk');
        }
    }
    return _Anthropic;
}
class AnthropicProvider extends BaseLLMProvider {
    constructor(config) {
        super(config);
    }
    static async create(config) {
        const provider = new AnthropicProvider(config);
        const Anthropic = await loadAnthropicSDK();
        provider.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
        });
        return provider;
    }
    async chat(messages, options) {
        try {
            const systemMessage = messages.find((m) => m.role === 'system');
            const conversationMessages = messages.filter((m) => m.role !== 'system');
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: options?.max_tokens || 4096,
                temperature: options?.temperature,
                top_p: options?.top_p,
                stop_sequences: options?.stop,
                system: systemMessage?.content || undefined,
                messages: conversationMessages.map((m) => ({
                    role: m.role,
                    content: m.content || '',
                })),
            });
            const content = response.content
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join('');
            return {
                content,
                model: response.model,
                finish_reason: response.stop_reason || undefined,
                usage: {
                    prompt_tokens: response.usage.input_tokens,
                    completion_tokens: response.usage.output_tokens,
                    total_tokens: response.usage.input_tokens + response.usage.output_tokens,
                },
            };
        }
        catch (error) {
            throw new Error(`Anthropic API error: ${error.message}`);
        }
    }
    async *chatStream(messages, options) {
        try {
            const systemMessage = messages.find((m) => m.role === 'system');
            const conversationMessages = messages.filter((m) => m.role !== 'system');
            const stream = await this.client.messages.create({
                model: this.model,
                max_tokens: options?.max_tokens || 4096,
                temperature: options?.temperature,
                top_p: options?.top_p,
                stop_sequences: options?.stop,
                system: systemMessage?.content || undefined,
                messages: conversationMessages.map((m) => ({
                    role: m.role,
                    content: m.content || '',
                })),
                stream: true,
            });
            for await (const event of stream) {
                if (event.type === 'content_block_delta') {
                    if (event.delta.type === 'text_delta') {
                        yield {
                            content: event.delta.text,
                        };
                    }
                }
                else if (event.type === 'message_stop') {
                    yield {
                        content: '',
                        finish_reason: 'stop',
                    };
                }
            }
        }
        catch (error) {
            throw new Error(`Anthropic streaming error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'anthropic';
    }
    getMaxTokensForModel(model) {
        if (model.includes('claude-opus-4'))
            return 200000;
        if (model.includes('claude-sonnet-4'))
            return 200000;
        if (model.includes('claude-haiku-4'))
            return 200000;
        if (model.includes('claude-3-7-sonnet'))
            return 200000;
        if (model.includes('claude-3-5'))
            return 200000;
        if (model.includes('claude-3-opus'))
            return 200000;
        if (model.includes('claude-3-sonnet'))
            return 200000;
        if (model.includes('claude-3-haiku'))
            return 200000;
        if (model.includes('claude-2'))
            return 100000;
        return 200000;
    }
}

let _googleGenAI;
let _harmCategory;
let _harmBlockThreshold;
async function loadGoogleSDK() {
    if (!_googleGenAI) {
        try {
            const mod = await import('@google/genai');
            _googleGenAI = mod.GoogleGenAI;
            _harmCategory = mod.HarmCategory;
            _harmBlockThreshold = mod.HarmBlockThreshold;
        }
        catch {
            throw new Error('@google/genai is required to use GoogleProvider. Install it with: npm install @google/genai');
        }
    }
    return { GoogleGenAI: _googleGenAI, HarmCategory: _harmCategory, HarmBlockThreshold: _harmBlockThreshold };
}
class GoogleProvider extends BaseLLMProvider {
    constructor(config) {
        super(config);
    }
    static async create(config) {
        const provider = new GoogleProvider(config);
        const { GoogleGenAI } = await loadGoogleSDK();
        provider.client = new GoogleGenAI({ apiKey: config.apiKey });
        return provider;
    }
    async chat(messages, options) {
        try {
            const { HarmCategory, HarmBlockThreshold } = await loadGoogleSDK();
            const tools = this.buildTools(options);
            const systemMessage = messages.find((m) => m.role === 'system');
            const conversationMessages = messages.filter((m) => m.role !== 'system');
            const history = this.buildHistory(conversationMessages.slice(0, -1));
            const lastMessage = conversationMessages[conversationMessages.length - 1]?.content || '';
            const prompt = systemMessage
                ? `${systemMessage.content}\n\nUser: ${lastMessage}`
                : lastMessage;
            const chat = this.client.chats.create({
                model: this.model,
                history,
                config: {
                    temperature: options?.temperature,
                    maxOutputTokens: options?.max_tokens,
                    topP: options?.top_p,
                    stopSequences: options?.stop,
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    ],
                    ...(tools && { tools }),
                },
            });
            const response = await chat.sendMessage({ message: prompt });
            const functionCalls = response.functionCalls;
            const tool_calls = functionCalls?.map((fc, index) => ({
                id: `call_${Date.now()}_${index}`,
                type: 'function',
                function: {
                    name: fc.name,
                    arguments: JSON.stringify(fc.args),
                },
            }));
            const content = functionCalls && functionCalls.length > 0 ? '' : (response.text ?? '');
            return {
                content,
                model: this.model,
                finish_reason: response.candidates?.[0]?.finishReason || undefined,
                ...(tool_calls && tool_calls.length > 0 && { tool_calls }),
                usage: {
                    prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
                    completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
                    total_tokens: response.usageMetadata?.totalTokenCount || 0,
                },
            };
        }
        catch (error) {
            throw new Error(`Google API error: ${error.message}`);
        }
    }
    async *chatStream(messages, options) {
        try {
            const systemMessage = messages.find((m) => m.role === 'system');
            const conversationMessages = messages.filter((m) => m.role !== 'system');
            const history = this.buildHistory(conversationMessages.slice(0, -1));
            const lastMessage = conversationMessages[conversationMessages.length - 1]?.content || '';
            const prompt = systemMessage
                ? `${systemMessage.content}\n\nUser: ${lastMessage}`
                : lastMessage;
            const chat = this.client.chats.create({
                model: this.model,
                history,
                config: {
                    temperature: options?.temperature,
                    maxOutputTokens: options?.max_tokens,
                    topP: options?.top_p,
                    stopSequences: options?.stop,
                },
            });
            const stream = await chat.sendMessageStream({ message: prompt });
            for await (const chunk of stream) {
                const text = chunk.text;
                if (text) {
                    yield { content: text };
                }
            }
            yield { content: '', finish_reason: 'stop' };
        }
        catch (error) {
            throw new Error(`Google streaming error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'google';
    }
    getMaxTokensForModel(model) {
        if (model.includes('gemini-3'))
            return 1000000;
        if (model.includes('gemini-2.5'))
            return 1000000;
        if (model.includes('gemini-2.0-flash'))
            return 1000000;
        if (model.includes('gemini-1.5-pro'))
            return 2000000;
        if (model.includes('gemini-1.5-flash'))
            return 1000000;
        if (model.includes('gemini-pro'))
            return 32768;
        return 1000000;
    }
    buildTools(options) {
        if (!options?.tools)
            return undefined;
        return [
            {
                functionDeclarations: options.tools.map((t) => ({
                    name: t.function.name,
                    description: t.function.description || '',
                    parameters: t.function.parameters,
                })),
            },
        ];
    }
    buildHistory(messages) {
        return messages.map((m) => {
            if (m.role === 'assistant') {
                if (m.tool_calls && m.tool_calls.length > 0) {
                    return {
                        role: 'model',
                        parts: m.tool_calls.map((tc) => ({
                            functionCall: {
                                name: tc.function.name,
                                args: JSON.parse(tc.function.arguments || '{}'),
                            },
                        })),
                    };
                }
                return { role: 'model', parts: [{ text: m.content || '' }] };
            }
            else if (m.role === 'tool') {
                let responseData;
                try {
                    responseData = JSON.parse(m.content || '{}');
                }
                catch {
                    responseData = { result: m.content };
                }
                return {
                    role: 'user',
                    parts: [
                        {
                            functionResponse: {
                                name: m.name,
                                response: responseData,
                            },
                        },
                    ],
                };
            }
            else {
                return { role: 'user', parts: [{ text: m.content || '' }] };
            }
        });
    }
}

class OllamaProvider extends BaseLLMProvider {
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
    }
    async chat(messages, options) {
        try {
            const requestBody = {
                model: this.model,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content || '',
                })),
                stream: false,
                options: {
                    temperature: options?.temperature,
                    top_p: options?.top_p,
                    num_predict: options?.max_tokens,
                    stop: options?.stop,
                },
            };
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }
            const data = (await response.json());
            return {
                content: data.message.content,
                model: data.model,
                finish_reason: data.done ? 'stop' : undefined,
                usage: {
                    prompt_tokens: data.prompt_eval_count || 0,
                    completion_tokens: data.eval_count || 0,
                    total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                },
            };
        }
        catch (error) {
            throw new Error(`Ollama API error: ${error.message}`);
        }
    }
    async *chatStream(messages, options) {
        try {
            const requestBody = {
                model: this.model,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content || '',
                })),
                stream: true,
                options: {
                    temperature: options?.temperature,
                    top_p: options?.top_p,
                    num_predict: options?.max_tokens,
                    stop: options?.stop,
                },
            };
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }
            if (!response.body) {
                throw new Error('Response body is null');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter((line) => line.trim());
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message?.content) {
                            yield {
                                content: data.message.content,
                            };
                        }
                        if (data.done) {
                            yield {
                                content: '',
                                finish_reason: 'stop',
                            };
                        }
                    }
                    catch {
                        // Non-JSON line in stream (e.g. empty or partial), skip
                    }
                }
            }
        }
        catch (error) {
            throw new Error(`Ollama streaming error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'ollama';
    }
    getMaxTokensForModel(_model) {
        return 4096;
    }
}

let _OpenAI;
async function loadOpenAISDK() {
    if (!_OpenAI) {
        try {
            const mod = await import('openai');
            _OpenAI = mod.default || mod;
        }
        catch {
            throw new Error('openai is required to use OpenAIProvider. Install it with: npm install openai');
        }
    }
    return _OpenAI;
}
class OpenAIProvider extends BaseLLMProvider {
    constructor(config) {
        super(config);
    }
    static async create(config) {
        const provider = new OpenAIProvider(config);
        const OpenAI = await loadOpenAISDK();
        provider.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
            organization: config.organization,
        });
        return provider;
    }
    async chat(messages, options) {
        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                temperature: options?.temperature,
                max_tokens: options?.max_tokens,
                top_p: options?.top_p,
                frequency_penalty: options?.frequency_penalty,
                presence_penalty: options?.presence_penalty,
                stop: options?.stop,
                stream: false,
                tools: options?.tools,
            });
            return {
                content: response.choices[0]?.message?.content || '',
                model: response.model,
                finish_reason: response.choices[0]?.finish_reason || undefined,
                tool_calls: response.choices[0]?.message?.tool_calls?.filter((tc) => tc.type === 'function' && 'function' in tc),
                usage: response.usage
                    ? {
                        prompt_tokens: response.usage.prompt_tokens,
                        completion_tokens: response.usage.completion_tokens,
                        total_tokens: response.usage.total_tokens,
                    }
                    : undefined,
            };
        }
        catch (error) {
            throw new Error(`OpenAI API error: ${error.message}`);
        }
    }
    async *chatStream(messages, options) {
        try {
            const stream = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                temperature: options?.temperature,
                max_tokens: options?.max_tokens,
                top_p: options?.top_p,
                frequency_penalty: options?.frequency_penalty,
                presence_penalty: options?.presence_penalty,
                stop: options?.stop,
                stream: true,
            });
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                const finishReason = chunk.choices[0]?.finish_reason || undefined;
                if (content || finishReason) {
                    yield {
                        content,
                        finish_reason: finishReason,
                    };
                }
            }
        }
        catch (error) {
            throw new Error(`OpenAI streaming error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'openai';
    }
    getMaxTokensForModel(model) {
        if (model.includes('gpt-5'))
            return 1000000;
        if (model.includes('o4-mini'))
            return 200000;
        if (model.includes('o3'))
            return 200000;
        if (model.includes('o1'))
            return 200000;
        if (model.includes('gpt-4.1'))
            return 1000000;
        if (model.includes('gpt-4o-mini'))
            return 128000;
        if (model.includes('gpt-4o'))
            return 128000;
        if (model.includes('gpt-4-turbo') || model.includes('gpt-4-1106'))
            return 128000;
        if (model.includes('gpt-4-32k'))
            return 32768;
        if (model.includes('gpt-4'))
            return 8192;
        if (model.includes('gpt-3.5-turbo-16k'))
            return 16385;
        if (model.includes('gpt-3.5-turbo'))
            return 4096;
        return 1000000;
    }
}

/**
 * Create an LLM provider based on provider name
 */
async function createLLMProvider(provider, config) {
    const normalizedProvider = provider.toLowerCase();
    switch (normalizedProvider) {
        case 'openai':
            return OpenAIProvider.create(config);
        case 'anthropic':
            return AnthropicProvider.create(config);
        case 'google':
        case 'gemini':
            return GoogleProvider.create(config);
        case 'ollama':
            return new OllamaProvider(config);
        default:
            throw new Error(`Unknown LLM provider: ${provider}. Supported providers: openai, anthropic, google, ollama`);
    }
}
/**
 * Factory functions for easy LLM instantiation
 */
const llm = {
    openai: (config) => {
        return OpenAIProvider.create({
            ...config,
            model: config.model || 'gpt-5.2',
        });
    },
    anthropic: (config) => {
        return AnthropicProvider.create({
            ...config,
            model: config.model || 'claude-sonnet-4-6',
        });
    },
    google: (config) => {
        return GoogleProvider.create({
            ...config,
            model: config.model || 'gemini-3.1-pro-preview',
        });
    },
    ollama: (config) => {
        return new OllamaProvider({
            ...config,
            model: config.model || 'llama3.2',
        });
    },
};

class BaseMemoryStorage {
    constructor() {
        this._connected = false;
    }
    async connect() {
        this._connected = true;
    }
    async disconnect() {
        this._connected = false;
    }
    isConnected() {
        return this._connected;
    }
}

class InMemoryStorage extends BaseMemoryStorage {
    constructor() {
        super();
        this.storage = new Map();
        this._connected = true;
    }
    async add(sessionId, message) {
        if (!this.storage.has(sessionId)) {
            this.storage.set(sessionId, []);
        }
        this.storage.get(sessionId).push(message);
    }
    async get(sessionId, limit) {
        const messages = this.storage.get(sessionId) || [];
        if (limit) {
            return messages.slice(-limit);
        }
        return messages;
    }
    async clear(sessionId) {
        this.storage.set(sessionId, []);
    }
    async delete(sessionId) {
        this.storage.delete(sessionId);
    }
    async exists(sessionId) {
        return this.storage.has(sessionId);
    }
}

class PostgresStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.connectionPromise = null;
        this.tableName = config.tableName || 'sekuire_memory';
        this.config = config;
        if (!config.lazyConnect) {
            this.connectionPromise = this.connect();
        }
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise)
            return this.connectionPromise;
        this.connectionPromise = this.initPool();
        return this.connectionPromise;
    }
    async initPool() {
        try {
            const { Pool } = await import('pg');
            if (this.config.connectionString) {
                this.pool = new Pool({ connectionString: this.config.connectionString });
            }
            else {
                this.pool = new Pool({
                    host: this.config.host || 'localhost',
                    port: this.config.port || 5432,
                    database: this.config.database,
                    user: this.config.user,
                    password: this.config.password,
                });
            }
            await this.createTableIfNotExists();
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize Postgres: ${error}`);
        }
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    async createTableIfNotExists() {
        const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id ON ${this.tableName}(session_id);
    `;
        await this.pool.query(query);
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        const query = `
      INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `;
        await this.pool.query(query, [
            sessionId,
            message.role,
            message.content,
            message.timestamp,
            message.metadata ? JSON.stringify(message.metadata) : null,
        ]);
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        let query = `
      SELECT role, content, timestamp, metadata
      FROM ${this.tableName}
      WHERE session_id = $1
      ORDER BY timestamp ASC
    `;
        if (limit) {
            query += ` LIMIT ${limit}`;
        }
        const result = await this.pool.query(query, [sessionId]);
        return result.rows.map((row) => ({
            role: row.role,
            content: row.content,
            timestamp: row.timestamp,
            metadata: row.metadata,
        }));
    }
    async clear(sessionId) {
        await this.ensureConnected();
        const query = `DELETE FROM ${this.tableName} WHERE session_id = $1`;
        await this.pool.query(query, [sessionId]);
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureConnected();
        const query = `SELECT COUNT(*) FROM ${this.tableName} WHERE session_id = $1`;
        const result = await this.pool.query(query, [sessionId]);
        return parseInt(result.rows[0].count) > 0;
    }
    async disconnect() {
        if (this._connected && this.pool) {
            await this.pool.end();
            this._connected = false;
            this.connectionPromise = null;
        }
    }
}

class RedisStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.client = null;
        this.connectionPromise = null;
        this.keyPrefix = config.keyPrefix || 'sekuire:memory:';
        this.config = config;
        if (!config.lazyConnect) {
            this.connectionPromise = this.connect();
        }
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise)
            return this.connectionPromise;
        this.connectionPromise = this.initClient();
        return this.connectionPromise;
    }
    async initClient() {
        try {
            const { createClient } = await import('redis');
            if (this.config.url) {
                this.client = createClient({ url: this.config.url });
            }
            else {
                this.client = createClient({
                    socket: {
                        host: this.config.host || 'localhost',
                        port: this.config.port || 6379,
                    },
                    password: this.config.password,
                    database: this.config.db || 0,
                });
            }
            this.client.on('error', (err) => {
                console.error('Redis client error:', err);
            });
            await this.client.connect();
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize Redis: ${error}`);
        }
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    getKey(sessionId) {
        return `${this.keyPrefix}${sessionId}`;
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        await this.client.rPush(key, JSON.stringify(message));
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        const start = limit ? -limit : 0;
        const messages = await this.client.lRange(key, start, -1);
        return messages.map((msg) => JSON.parse(msg));
    }
    async clear(sessionId) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        await this.client.del(key);
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        return (await this.client.exists(key)) === 1;
    }
    async disconnect() {
        if (this._connected && this.client) {
            await this.client.quit();
            this._connected = false;
            this.connectionPromise = null;
        }
    }
}

class SQLiteStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.db = null;
        this.connectionPromise = null;
        this.config = config;
        this.tableName = config.tableName || 'sekuire_memory';
        this.connectionPromise = this.connect();
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise && !this._connected)
            return this.connectionPromise;
        try {
            const filename = this.config.filename;
            const dirname = path$1.dirname(filename);
            if (dirname && dirname !== '.') {
                await fs$3.mkdir(dirname, { recursive: true });
            }
            const Database = await this.loadDatabaseDriver();
            this.db = new Database(filename, {
                readonly: this.config.readonly || false,
            });
            this.db.pragma('journal_mode = WAL');
            this.ensureTableExists();
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize SQLite: ${error}`);
        }
    }
    async loadDatabaseDriver() {
        try {
            const requireFromCwd = node_module.createRequire(path$1.join(process.cwd(), 'package.json'));
            const loaded = requireFromCwd('better-sqlite3');
            return loaded.default ?? loaded;
        }
        catch {
            try {
                const loaded = await import('better-sqlite3');
                return loaded.default ?? loaded;
            }
            catch (error) {
                throw new Error(`Unable to load better-sqlite3. Install it in your agent project and rebuild native modules for the active Node version. ${error}`);
            }
        }
    }
    ensureTableExists() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id
      ON ${this.tableName}(session_id)
    `);
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(sessionId, message.role, message.content, message.timestamp, message.metadata ? JSON.stringify(message.metadata) : null);
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        let sql = `
      SELECT role, content, timestamp, metadata
      FROM ${this.tableName}
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `;
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(sessionId);
        return rows.map((row) => ({
            role: row.role,
            content: row.content,
            timestamp: row.timestamp,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        }));
    }
    async clear(sessionId) {
        await this.ensureConnected();
        const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE session_id = ?`);
        stmt.run(sessionId);
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureConnected();
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE session_id = ?`);
        const result = stmt.get(sessionId);
        return result.count > 0;
    }
    async disconnect() {
        if (this._connected && this.db) {
            this.db.close();
            this._connected = false;
            this.connectionPromise = null;
        }
    }
}

class FileStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.connectionPromise = null;
        this.data = {};
        this.config = config;
        this.connectionPromise = this.connect();
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise && !this._connected)
            return this.connectionPromise;
        this.connectionPromise = this.initialize();
        return this.connectionPromise;
    }
    async initialize() {
        try {
            const filename = this.config.path?.trim();
            if (!filename) {
                throw new Error('File memory path is required');
            }
            const dir = path$1.dirname(filename);
            if (dir && dir !== '.') {
                await fs$3.mkdir(dir, { recursive: true });
            }
            try {
                await fs$3.access(filename);
            }
            catch {
                await fs$3.writeFile(filename, '{}', 'utf-8');
            }
            const content = await fs$3.readFile(filename, 'utf-8');
            this.data = content.trim() ? JSON.parse(content) : {};
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize file memory: ${error}`);
        }
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    async flush() {
        await fs$3.writeFile(this.config.path, JSON.stringify(this.data, null, 2), 'utf-8');
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        if (!this.data[sessionId]) {
            this.data[sessionId] = [];
        }
        this.data[sessionId].push(message);
        await this.flush();
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        const messages = this.data[sessionId] || [];
        if (limit) {
            return messages.slice(-limit);
        }
        return [...messages];
    }
    async clear(sessionId) {
        await this.ensureConnected();
        this.data[sessionId] = [];
        await this.flush();
    }
    async delete(sessionId) {
        await this.ensureConnected();
        delete this.data[sessionId];
        await this.flush();
    }
    async exists(sessionId) {
        await this.ensureConnected();
        return Array.isArray(this.data[sessionId]) && this.data[sessionId].length > 0;
    }
    async disconnect() {
        if (this._connected) {
            await this.flush();
            this._connected = false;
            this.connectionPromise = null;
        }
    }
}

class UpstashStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.client = null;
        this.connectionPromise = null;
        this.keyPrefix = config.keyPrefix || 'sekuire:memory:';
        this.config = config;
        this.connectionPromise = this.connect();
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise && !this._connected)
            return this.connectionPromise;
        try {
            const { Redis } = await import('@upstash/redis');
            this.client = new Redis({
                url: this.config.url,
                token: this.config.token,
            });
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize Upstash Redis: ${error}`);
        }
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    getKey(sessionId) {
        return `${this.keyPrefix}${sessionId}`;
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        await this.client.rpush(key, JSON.stringify(message));
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        const start = limit ? -limit : 0;
        const messages = await this.client.lrange(key, start, -1);
        return messages.map((msg) => JSON.parse(msg));
    }
    async clear(sessionId) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        await this.client.del(key);
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureConnected();
        const key = this.getKey(sessionId);
        return (await this.client.exists(key)) === 1;
    }
    async disconnect() {
        this._connected = false;
        this.client = null;
        this.connectionPromise = null;
    }
}

class CloudflareKVStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.binding = null;
        this.config = config;
        this.keyPrefix = config.keyPrefix || 'sekuire:memory:';
        if (config.binding) {
            this.binding = config.binding;
            this.useRestApi = false;
            this._connected = true;
        }
        else if (config.accountId && config.namespaceId && config.apiToken) {
            this.useRestApi = true;
            this._connected = true;
        }
        else {
            throw new Error('CloudflareKVConfig requires either a binding (in Workers) or accountId, namespaceId, and apiToken (for REST API)');
        }
    }
    getKey(sessionId) {
        return `${this.keyPrefix}${sessionId}`;
    }
    async kvGet(key) {
        if (!this.useRestApi) {
            return this.binding.get(key);
        }
        const { accountId, namespaceId, apiToken } = this.config;
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${apiToken}` },
        });
        if (response.status === 404)
            return null;
        if (!response.ok)
            throw new Error(`KV GET failed: ${response.statusText}`);
        return response.text();
    }
    async kvPut(key, value) {
        if (!this.useRestApi) {
            await this.binding.put(key, value);
            return;
        }
        const { accountId, namespaceId, apiToken } = this.config;
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'text/plain',
            },
            body: value,
        });
        if (!response.ok)
            throw new Error(`KV PUT failed: ${response.statusText}`);
    }
    async kvDelete(key) {
        if (!this.useRestApi) {
            await this.binding.delete(key);
            return;
        }
        const { accountId, namespaceId, apiToken } = this.config;
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${apiToken}` },
        });
        if (!response.ok && response.status !== 404) {
            throw new Error(`KV DELETE failed: ${response.statusText}`);
        }
    }
    async add(sessionId, message) {
        const key = this.getKey(sessionId);
        const existing = await this.kvGet(key);
        const messages = existing ? JSON.parse(existing) : [];
        messages.push(message);
        await this.kvPut(key, JSON.stringify(messages));
    }
    async get(sessionId, limit) {
        const key = this.getKey(sessionId);
        const data = await this.kvGet(key);
        if (!data)
            return [];
        const messages = JSON.parse(data);
        if (limit) {
            return messages.slice(-limit);
        }
        return messages;
    }
    async clear(sessionId) {
        const key = this.getKey(sessionId);
        await this.kvDelete(key);
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        const key = this.getKey(sessionId);
        const data = await this.kvGet(key);
        return data !== null;
    }
    async disconnect() {
        this._connected = false;
    }
}

class CloudflareD1Storage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.binding = null;
        this.tableInitialized = false;
        this.config = config;
        this.tableName = config.tableName || 'sekuire_memory';
        if (config.binding) {
            this.binding = config.binding;
            this.useRestApi = false;
            this._connected = true;
        }
        else if (config.accountId && config.databaseId && config.apiToken) {
            this.useRestApi = true;
            this._connected = true;
        }
        else {
            throw new Error('CloudflareD1Config requires either a binding (in Workers) or accountId, databaseId, and apiToken (for REST API)');
        }
    }
    async executeQuery(sql, params = []) {
        if (!this.useRestApi) {
            const stmt = this.binding.prepare(sql);
            if (params.length > 0) {
                return stmt.bind(...params).all();
            }
            return stmt.all();
        }
        const { accountId, databaseId, apiToken } = this.config;
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sql, params }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`D1 query failed: ${response.statusText} - ${errorText}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(`D1 query failed: ${JSON.stringify(result.errors)}`);
        }
        return result.result?.[0] || { results: [] };
    }
    async ensureTableExists() {
        if (this.tableInitialized)
            return;
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;
        const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id ON ${this.tableName}(session_id)
    `;
        await this.executeQuery(createTableSQL);
        await this.executeQuery(createIndexSQL);
        this.tableInitialized = true;
    }
    async add(sessionId, message) {
        await this.ensureTableExists();
        const sql = `
      INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `;
        await this.executeQuery(sql, [
            sessionId,
            message.role,
            message.content,
            message.timestamp,
            message.metadata ? JSON.stringify(message.metadata) : null,
        ]);
    }
    async get(sessionId, limit) {
        await this.ensureTableExists();
        let sql = `
      SELECT role, content, timestamp, metadata
      FROM ${this.tableName}
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `;
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        const result = await this.executeQuery(sql, [sessionId]);
        return (result.results || []).map((row) => ({
            role: row.role,
            content: row.content,
            timestamp: row.timestamp,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        }));
    }
    async clear(sessionId) {
        await this.ensureTableExists();
        const sql = `DELETE FROM ${this.tableName} WHERE session_id = ?`;
        await this.executeQuery(sql, [sessionId]);
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureTableExists();
        const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE session_id = ?`;
        const result = await this.executeQuery(sql, [sessionId]);
        return (result.results?.[0]?.count || 0) > 0;
    }
    async disconnect() {
        this._connected = false;
    }
}

class DynamoDBStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.client = null;
        this.docClient = null;
        this.connectionPromise = null;
        this.tableReady = false;
        this.config = config;
        this.connectionPromise = this.connect();
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise && !this._connected)
            return this.connectionPromise;
        try {
            const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
            const { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
            const clientConfig = {
                region: this.config.region || process.env.AWS_REGION || 'us-east-1',
            };
            if (this.config.endpoint) {
                clientConfig.endpoint = this.config.endpoint;
            }
            if (this.config.credentials) {
                clientConfig.credentials = this.config.credentials;
            }
            this.client = new DynamoDBClient(clientConfig);
            this.docClient = DynamoDBDocumentClient.from(this.client);
            if (this.config.createTable) {
                await this.ensureTableExists();
            }
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize DynamoDB: ${error}`);
        }
    }
    async ensureTableExists() {
        if (this.tableReady)
            return;
        try {
            const { DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
            await this.client.send(new DescribeTableCommand({ TableName: this.config.tableName }));
            this.tableReady = true;
            return;
        }
        catch (error) {
            if (error.name !== 'ResourceNotFoundException') {
                throw error;
            }
        }
        const { CreateTableCommand } = await import('@aws-sdk/client-dynamodb');
        await this.client.send(new CreateTableCommand({
            TableName: this.config.tableName,
            KeySchema: [
                { AttributeName: 'sessionId', KeyType: 'HASH' },
                { AttributeName: 'timestamp', KeyType: 'RANGE' },
            ],
            AttributeDefinitions: [
                { AttributeName: 'sessionId', AttributeType: 'S' },
                { AttributeName: 'timestamp', AttributeType: 'N' },
            ],
            BillingMode: 'PAY_PER_REQUEST',
        }));
        const { waitUntilTableExists } = await import('@aws-sdk/client-dynamodb');
        await waitUntilTableExists({ client: this.client, maxWaitTime: 120 }, { TableName: this.config.tableName });
        this.tableReady = true;
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
        await this.docClient.send(new PutCommand({
            TableName: this.config.tableName,
            Item: {
                sessionId,
                timestamp: message.timestamp,
                role: message.role,
                content: message.content,
                metadata: message.metadata || {},
            },
        }));
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
        const params = {
            TableName: this.config.tableName,
            KeyConditionExpression: 'sessionId = :sid',
            ExpressionAttributeValues: {
                ':sid': sessionId,
            },
            ScanIndexForward: true,
        };
        if (limit) {
            params.Limit = limit;
            params.ScanIndexForward = false;
        }
        const result = await this.docClient.send(new QueryCommand(params));
        const items = result.Items || [];
        const messages = items.map((item) => ({
            role: item.role,
            content: item.content,
            timestamp: item.timestamp,
            metadata: item.metadata && Object.keys(item.metadata).length > 0 ? item.metadata : undefined,
        }));
        if (limit) {
            messages.reverse();
        }
        return messages;
    }
    async clear(sessionId) {
        await this.ensureConnected();
        const messages = await this.get(sessionId);
        const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
        for (const message of messages) {
            await this.docClient.send(new DeleteCommand({
                TableName: this.config.tableName,
                Key: {
                    sessionId,
                    timestamp: message.timestamp,
                },
            }));
        }
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureConnected();
        const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
        const result = await this.docClient.send(new QueryCommand({
            TableName: this.config.tableName,
            KeyConditionExpression: 'sessionId = :sid',
            ExpressionAttributeValues: {
                ':sid': sessionId,
            },
            Limit: 1,
            Select: 'COUNT',
        }));
        return (result.Count || 0) > 0;
    }
    async disconnect() {
        if (this._connected && this.client) {
            this.client.destroy();
            this._connected = false;
            this.connectionPromise = null;
        }
    }
}

class TursoStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.client = null;
        this.connectionPromise = null;
        this.tableInitialized = false;
        this.config = config;
        this.tableName = config.tableName || 'sekuire_memory';
        this.connectionPromise = this.connect();
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise && !this._connected)
            return this.connectionPromise;
        try {
            const { createClient } = await import('@libsql/client');
            this.client = createClient({
                url: this.config.url,
                authToken: this.config.authToken,
            });
            await this.ensureTableExists();
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize Turso: ${error}`);
        }
    }
    async ensureTableExists() {
        if (this.tableInitialized)
            return;
        await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id ON ${this.tableName}(session_id)
    `);
        this.tableInitialized = true;
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        await this.client.execute({
            sql: `
        INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?)
      `,
            args: [
                sessionId,
                message.role,
                message.content,
                message.timestamp,
                message.metadata ? JSON.stringify(message.metadata) : null,
            ],
        });
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        let sql = `
      SELECT role, content, timestamp, metadata
      FROM ${this.tableName}
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `;
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        const result = await this.client.execute({
            sql,
            args: [sessionId],
        });
        return result.rows.map((row) => ({
            role: row.role,
            content: row.content,
            timestamp: Number(row.timestamp),
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        }));
    }
    async clear(sessionId) {
        await this.ensureConnected();
        await this.client.execute({
            sql: `DELETE FROM ${this.tableName} WHERE session_id = ?`,
            args: [sessionId],
        });
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureConnected();
        const result = await this.client.execute({
            sql: `SELECT COUNT(*) as count FROM ${this.tableName} WHERE session_id = ?`,
            args: [sessionId],
        });
        return Number(result.rows[0]?.count || 0) > 0;
    }
    async disconnect() {
        if (this._connected && this.client) {
            this.client.close();
            this._connected = false;
            this.connectionPromise = null;
        }
    }
}

class ConvexStorage extends BaseMemoryStorage {
    constructor(config) {
        super();
        this.client = null;
        this.connectionPromise = null;
        this.config = config;
        this.connectionPromise = this.connect();
    }
    async connect() {
        if (this._connected)
            return;
        if (this.connectionPromise && !this._connected)
            return this.connectionPromise;
        try {
            const { ConvexHttpClient } = await import('convex/browser');
            this.client = new ConvexHttpClient(this.config.url);
            this._connected = true;
        }
        catch (error) {
            this.connectionPromise = null;
            throw new Error(`Failed to initialize Convex: ${error}`);
        }
    }
    async ensureConnected() {
        if (!this._connected) {
            await this.connect();
        }
    }
    async add(sessionId, message) {
        await this.ensureConnected();
        await this.client.mutation('sekuireMemory:add', {
            sessionId,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
            metadata: message.metadata || {},
        });
    }
    async get(sessionId, limit) {
        await this.ensureConnected();
        const messages = await this.client.query('sekuireMemory:get', {
            sessionId,
            limit,
        });
        return messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            metadata: msg.metadata && Object.keys(msg.metadata).length > 0 ? msg.metadata : undefined,
        }));
    }
    async clear(sessionId) {
        await this.ensureConnected();
        await this.client.mutation('sekuireMemory:clear', { sessionId });
    }
    async delete(sessionId) {
        await this.clear(sessionId);
    }
    async exists(sessionId) {
        await this.ensureConnected();
        return this.client.query('sekuireMemory:exists', { sessionId });
    }
    async disconnect() {
        this._connected = false;
        this.client = null;
        this.connectionPromise = null;
    }
}
const CONVEX_SCHEMA_TEMPLATE = `
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sekuireMemory: defineTable({
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  }).index("by_session", ["sessionId", "timestamp"]),
});
`;
const CONVEX_FUNCTIONS_TEMPLATE = `
// convex/sekuireMemory.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sekuireMemory", args);
  },
});

export const get = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("sekuireMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc");

    const messages = await query.collect();

    if (args.limit) {
      return messages.slice(-args.limit);
    }
    return messages;
  },
});

export const clear = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("sekuireMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  },
});

export const exists = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("sekuireMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    return message !== null;
  },
});
`;

const storageRegistry = new Map();
function registerStorage(type, factory, description) {
    if (storageRegistry.has(type)) {
        console.warn(`Storage type '${type}' is already registered. Overwriting.`);
    }
    storageRegistry.set(type, { factory, description });
}
function getStorageFactory(type) {
    const registration = storageRegistry.get(type);
    return registration?.factory;
}
function hasStorage(type) {
    return storageRegistry.has(type);
}
function listStorageTypes() {
    return Array.from(storageRegistry.keys());
}
function getStorageInfo() {
    return Array.from(storageRegistry.entries()).map(([type, reg]) => ({
        type,
        description: reg.description,
    }));
}

registerStorage('in-memory', () => new InMemoryStorage(), 'Simple in-memory storage using Map');
registerStorage('buffer', () => new InMemoryStorage(), 'Alias for in-memory storage');
registerStorage('redis', (config) => {
    if (!config.redis) {
        throw new Error('Redis config required for redis memory type');
    }
    return new RedisStorage(config.redis);
}, 'Self-hosted Redis for persistence and scaling');
registerStorage('postgres', (config) => {
    if (!config.postgres) {
        throw new Error('Postgres config required for postgres memory type');
    }
    return new PostgresStorage(config.postgres);
}, 'PostgreSQL with full SQL capabilities');
registerStorage('sqlite', (config) => {
    if (!config.sqlite) {
        throw new Error('SQLite config required for sqlite memory type');
    }
    return new SQLiteStorage(config.sqlite);
}, 'Local SQLite database for development and single-node deployments');
registerStorage('file', (config) => {
    if (!config.file) {
        throw new Error('File config required for file memory type');
    }
    return new FileStorage(config.file);
}, 'Local JSON file storage');
registerStorage('upstash', (config) => {
    if (!config.upstash) {
        throw new Error('Upstash config required for upstash memory type');
    }
    return new UpstashStorage(config.upstash);
}, 'Upstash Redis - serverless Redis with HTTP API');
registerStorage('cloudflare-kv', (config) => {
    if (!config.cloudflareKV) {
        throw new Error('CloudflareKV config required for cloudflare-kv memory type');
    }
    return new CloudflareKVStorage(config.cloudflareKV);
}, 'Cloudflare KV - edge key-value storage');
registerStorage('cloudflare-d1', (config) => {
    if (!config.cloudflareD1) {
        throw new Error('CloudflareD1 config required for cloudflare-d1 memory type');
    }
    return new CloudflareD1Storage(config.cloudflareD1);
}, 'Cloudflare D1 - edge SQLite database');
registerStorage('dynamodb', (config) => {
    if (!config.dynamodb) {
        throw new Error('DynamoDB config required for dynamodb memory type');
    }
    return new DynamoDBStorage(config.dynamodb);
}, 'AWS DynamoDB - serverless NoSQL database');
registerStorage('turso', (config) => {
    if (!config.turso) {
        throw new Error('Turso config required for turso memory type');
    }
    return new TursoStorage(config.turso);
}, 'Turso - edge SQLite with libSQL');
registerStorage('convex', (config) => {
    if (!config.convex) {
        throw new Error('Convex config required for convex memory type');
    }
    return new ConvexStorage(config.convex);
}, 'Convex - real-time backend platform');
function createMemoryStorage(config) {
    if (config.instance) {
        return config.instance;
    }
    const factory = getStorageFactory(config.type);
    if (factory) {
        return factory(config);
    }
    throw new Error(`Unknown memory type: ${config.type}. Available types: ${listStorageTypes().join(', ')}`);
}

let _otelCore;
function loadOtelCore() {
    if (!_otelCore) {
        try {
            _otelCore = require('@opentelemetry/core');
        }
        catch {
            throw new Error('@opentelemetry/core is required for telemetry. Install it with: npm install @opentelemetry/core');
        }
    }
    return _otelCore;
}
class SekuireSpanExporter {
    constructor(config) {
        this.pendingExport = null;
        this.config = config;
    }
    export(spans, resultCallback) {
        const { ExportResultCode } = loadOtelCore();
        const events = spans.map((span) => this.spanToEvent(span));
        if (events.length === 0) {
            resultCallback({ code: ExportResultCode.SUCCESS });
            return;
        }
        this.pendingExport = this.sendEvents(events)
            .then(() => {
            resultCallback({ code: ExportResultCode.SUCCESS });
        })
            .catch((error) => {
            console.debug('Failed to export spans to Sekuire:', error.message);
            resultCallback({ code: ExportResultCode.FAILED });
        })
            .finally(() => {
            this.pendingExport = null;
        });
    }
    spanToEvent(span) {
        const eventType = this.mapSpanToEventType(span.name);
        const severity = span.status.code === 2 ? 'error' : 'info';
        return {
            sekuire_id: this.config.agentId,
            session_id: span.spanContext().traceId,
            workspace_id: this.config.workspaceId,
            event_type: eventType,
            severity,
            event_timestamp: new Date(span.startTime[0] * 1000 + span.startTime[1] / 1e6).toISOString(),
            event_data: {
                message: span.name,
                duration_ms: this.getDurationMs(span),
                ...this.extractAttributes(span),
            },
            metadata: {
                sdk_version: 'typescript-sdk-otel',
                trace_id: span.spanContext().traceId,
                span_id: span.spanContext().spanId,
                parent_span_id: span.parentSpanId,
            },
        };
    }
    mapSpanToEventType(spanName) {
        if (spanName.startsWith('tool:'))
            return 'tool_execution';
        if (spanName.startsWith('chat'))
            return 'model_call';
        if (spanName.includes('policy'))
            return 'policy_check';
        return 'model_call';
    }
    getDurationMs(span) {
        const startMs = span.startTime[0] * 1000 + span.startTime[1] / 1e6;
        const endMs = span.endTime[0] * 1000 + span.endTime[1] / 1e6;
        return Math.round(endMs - startMs);
    }
    extractAttributes(span) {
        const attrs = {};
        for (const [key, value] of Object.entries(span.attributes)) {
            attrs[key] = value;
        }
        if (span.status.message) {
            attrs.status_message = span.status.message;
        }
        return attrs;
    }
    async sendEvents(events) {
        const url = `${this.config.apiUrl}/api/v1/agents/${this.config.agentId}/logs/batch`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.authToken && { Authorization: `Bearer ${this.config.authToken}` }),
            },
            body: JSON.stringify({ events }),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
    }
    async shutdown() {
        if (this.pendingExport) {
            await this.pendingExport;
        }
    }
    async forceFlush() {
        if (this.pendingExport) {
            await this.pendingExport;
        }
    }
}

let _otelApi;
let _otelExporter;
let _otelResources;
let _otelSdkTraceBase;
let _otelSemConv;
function loadOtelApi() {
    if (!_otelApi) {
        try {
            _otelApi = require('@opentelemetry/api');
        }
        catch {
            throw new Error('@opentelemetry/api is required for telemetry. Install OpenTelemetry packages: npm install @opentelemetry/api @opentelemetry/sdk-trace-base @opentelemetry/resources @opentelemetry/semantic-conventions');
        }
    }
    return _otelApi;
}
function loadOtelModules() {
    const api = loadOtelApi();
    if (!_otelResources) {
        try {
            _otelResources = require('@opentelemetry/resources');
        }
        catch {
            throw new Error('@opentelemetry/resources is required for telemetry. Install it with: npm install @opentelemetry/resources');
        }
    }
    if (!_otelSdkTraceBase) {
        try {
            _otelSdkTraceBase = require('@opentelemetry/sdk-trace-base');
        }
        catch {
            throw new Error('@opentelemetry/sdk-trace-base is required for telemetry. Install it with: npm install @opentelemetry/sdk-trace-base');
        }
    }
    if (!_otelSemConv) {
        try {
            _otelSemConv = require('@opentelemetry/semantic-conventions');
        }
        catch {
            throw new Error('@opentelemetry/semantic-conventions is required for telemetry. Install it with: npm install @opentelemetry/semantic-conventions');
        }
    }
    return { api, resources: _otelResources, sdkTraceBase: _otelSdkTraceBase, semConv: _otelSemConv };
}
function loadOtelExporter() {
    if (!_otelExporter) {
        try {
            _otelExporter = require('@opentelemetry/exporter-trace-otlp-http');
        }
        catch {
            throw new Error('@opentelemetry/exporter-trace-otlp-http is required for OTLP export. Install it with: npm install @opentelemetry/exporter-trace-otlp-http');
        }
    }
    return _otelExporter;
}
let globalProvider = null;
let globalTracer = null;
function initTelemetry(config) {
    const api = loadOtelApi();
    const envEnabled = process.env.SEKUIRE_TELEMETRY === 'true';
    if (!config.enabled && !envEnabled) {
        return api.trace.getTracer('sekuire-noop');
    }
    if (globalTracer) {
        return globalTracer;
    }
    const { resources, sdkTraceBase, semConv } = loadOtelModules();
    const resource = new resources.Resource({
        [semConv.ATTR_SERVICE_NAME]: 'sekuire-agent',
        [semConv.ATTR_SERVICE_VERSION]: '0.1.0',
        'sekuire.agent_id': config.agentId,
    });
    globalProvider = new sdkTraceBase.BasicTracerProvider({ resource });
    const batchConfig = {
        maxQueueSize: config.batchConfig?.maxQueueSize ?? 100,
        maxExportBatchSize: config.batchConfig?.maxExportBatchSize ?? 50,
        scheduledDelayMillis: config.batchConfig?.scheduledDelayMillis ?? 5000,
    };
    const exporterType = config.exporter ?? 'otlp';
    switch (exporterType) {
        case 'otlp': {
            const otlpMod = loadOtelExporter();
            const endpoint = config.otlpEndpoint ?? 'http://localhost:4318/v1/traces';
            const otlpExporter = new otlpMod.OTLPTraceExporter({ url: endpoint });
            globalProvider.addSpanProcessor(new sdkTraceBase.BatchSpanProcessor(otlpExporter, batchConfig));
            break;
        }
        case 'sekuire': {
            if (!config.sekuireApiUrl) {
                throw new Error('sekuireApiUrl required when using sekuire exporter');
            }
            const sekuireConfig = {
                apiUrl: config.sekuireApiUrl,
                agentId: config.agentId,
                authToken: config.authToken,
                workspaceId: config.workspaceId,
            };
            globalProvider.addSpanProcessor(new sdkTraceBase.BatchSpanProcessor(new SekuireSpanExporter(sekuireConfig), batchConfig));
            break;
        }
        case 'console':
            globalProvider.addSpanProcessor(new sdkTraceBase.SimpleSpanProcessor(new sdkTraceBase.ConsoleSpanExporter()));
            break;
    }
    if (config.debug && exporterType !== 'console') {
        globalProvider.addSpanProcessor(new sdkTraceBase.SimpleSpanProcessor(new sdkTraceBase.ConsoleSpanExporter()));
    }
    globalProvider.register();
    globalTracer = api.trace.getTracer('sekuire-agent');
    return globalTracer;
}
function getTracer() {
    if (globalTracer)
        return globalTracer;
    try {
        const api = loadOtelApi();
        return api.trace.getTracer('sekuire-noop');
    }
    catch {
        return { startActiveSpan: (_name, fn) => fn({ setAttribute: () => { }, setStatus: () => { }, end: () => { }, recordException: () => { } }) };
    }
}
async function shutdownTelemetry() {
    if (globalProvider) {
        await globalProvider.shutdown();
        globalProvider = null;
        globalTracer = null;
    }
}

class Tool {
    setPolicyEnforcer(enforcer) {
        this.policyEnforcer = enforcer;
    }
    validate(input) {
        for (const param of this.metadata.parameters) {
            if (param.required && !(param.name in input)) {
                throw new Error(`Missing required parameter: ${param.name}`);
            }
            if (param.name in input) {
                const value = input[param.name];
                const actualType = typeof value;
                if (param.type === 'object' && actualType !== 'object') {
                    throw new Error(`Parameter ${param.name} must be an object`);
                }
                if (param.type !== 'object' && actualType !== param.type) {
                    throw new Error(`Parameter ${param.name} must be of type ${param.type}`);
                }
            }
        }
        return true;
    }
    toSchema() {
        return {
            name: this.metadata.name,
            description: this.metadata.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(this.metadata.parameters.map((p) => [
                    p.name,
                    {
                        type: p.type,
                        description: p.description,
                        ...(p.default && { default: p.default }),
                    },
                ])),
                required: this.metadata.parameters.filter((p) => p.required).map((p) => p.name),
            },
        };
    }
}
class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.categories = new Map();
    }
    register(tool) {
        this.tools.set(tool.metadata.name, tool);
        // Track by category
        const category = tool.metadata.category || 'general';
        if (!this.categories.has(category)) {
            this.categories.set(category, new Set());
        }
        this.categories.get(category).add(tool.metadata.name);
    }
    get(name) {
        return this.tools.get(name);
    }
    getTool(name) {
        return this.get(name);
    }
    list() {
        return Array.from(this.tools.values());
    }
    getAllTools() {
        return this.list();
    }
    getSchemas() {
        return this.list().map((tool) => tool.toSchema());
    }
    getToolsByCategory(category) {
        const tools = this.categories.get(category);
        return tools ? Array.from(tools) : [];
    }
    getAllCategories() {
        return Array.from(this.categories.keys());
    }
    hasCategory(category) {
        return this.categories.has(category);
    }
}

/**
 * Agent Discovery Tool - Find other agents by capability
 */
class AgentDiscoveryTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'agent_discovery',
            description: 'Discover other agents in the workspace/organization by capability, tag, or category',
            parameters: [
                {
                    name: 'capability',
                    type: 'string',
                    description: 'Capability to search for (e.g., "github:repository_management")',
                    required: false,
                },
                {
                    name: 'tag',
                    type: 'string',
                    description: 'Tag to filter by (e.g., "code-analysis")',
                    required: false,
                },
                {
                    name: 'category',
                    type: 'string',
                    description: 'Category to filter by (e.g., "developer-tools")',
                    required: false,
                },
                {
                    name: 'verified_only',
                    type: 'boolean',
                    description: 'Only return verified agents',
                    required: false,
                    default: false,
                },
                {
                    name: 'scope',
                    type: 'string',
                    description: 'Search scope (workspace or organization)',
                    required: false,
                    default: 'workspace',
                },
            ],
            category: 'agent-orchestration',
        };
    }
    async execute(input) {
        const { capability, tag, category, verified_only = false, scope = 'workspace', } = input;
        try {
            const workspaceId = process.env.SEKUIRE_WORKSPACE_ID;
            const orgId = process.env.SEKUIRE_ORG_ID;
            if (!workspaceId && !orgId) {
                throw new Error('Workspace ID or Org ID not configured for agent discovery');
            }
            // Build query parameters
            const queryParams = new URLSearchParams();
            if (capability)
                queryParams.append('capability', String(capability));
            if (tag)
                queryParams.append('tag', String(tag));
            if (category)
                queryParams.append('category', String(category));
            if (verified_only)
                queryParams.append('verified', 'true');
            const endpoint = scope === 'workspace'
                ? `/api/v1/workspaces/${workspaceId}/agents/available`
                : `/api/v1/organizations/${orgId}/agents/available`;
            const apiUrl = process.env.SEKUIRE_API_URL || 'https://api.sekuire.com';
            const url = `${apiUrl}${endpoint}?${queryParams.toString()}`;
            const authToken = process.env.SEKUIRE_AUTH_TOKEN || '';
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`Agent discovery failed: ${response.statusText}`);
            }
            const data = await response.json();
            // Format response
            if (data.agents.length === 0) {
                return 'No agents found matching the criteria.';
            }
            const agentList = data.agents
                .map((agent) => `- ${agent.name} (${agent.sekuire_id}): ${agent.description || 'No description'}\n  Capabilities: ${agent.capabilities?.provides?.join(', ') || 'None listed'}`)
                .join('\n');
            return `Found ${data.agents.length} agent(s):\n\n${agentList}`;
        }
        catch (error) {
            return `❌ Agent discovery failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}
/**
 * Agent Delegation Tool - Delegate tasks to other agents
 */
class AgentDelegationTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'delegate_to_agent',
            description: 'Delegate a task to another agent in the workspace. Use this when another agent has specific capabilities you need.',
            parameters: [
                {
                    name: 'target_agent_id',
                    type: 'string',
                    description: 'Sekuire ID of the target agent to delegate to',
                    required: false,
                },
                {
                    name: 'capability',
                    type: 'string',
                    description: 'Required capability (alternative to target_agent_id - will find best agent with this capability)',
                    required: false,
                },
                {
                    name: 'task',
                    type: 'object',
                    description: 'Task specification to send to the agent',
                    required: true,
                },
                {
                    name: 'timeout_seconds',
                    type: 'number',
                    description: 'Maximum time to wait for response',
                    required: false,
                    default: 30,
                },
            ],
            category: 'agent-orchestration',
        };
    }
    async execute(input) {
        const { target_agent_id, capability, task, timeout_seconds = 30, } = input;
        try {
            let targetId = target_agent_id;
            let upstreamUrl = null;
            const agentId = process.env.SEKUIRE_AGENT_ID || 'unknown';
            const workspaceId = process.env.SEKUIRE_WORKSPACE_ID;
            const authToken = process.env.SEKUIRE_AUTH_TOKEN || '';
            const apiUrl = process.env.SEKUIRE_API_URL || 'https://api.sekuire.com';
            if (!targetId && capability) {
                const queryParams = new URLSearchParams({ capability: String(capability) });
                const discoveryUrl = `${apiUrl}/api/v1/discovery?${queryParams.toString()}`;
                const discoveryResp = await fetch(discoveryUrl, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${authToken}`,
                        'X-Workspace-Id': workspaceId || '',
                    },
                });
                if (discoveryResp.ok) {
                    const discoveryData = await discoveryResp.json();
                    if (discoveryData.agents && discoveryData.agents.length > 0) {
                        const agent = discoveryData.agents[0];
                        targetId = agent.sekuire_id || agent.agent_id;
                        upstreamUrl = agent.upstream_url || null;
                    }
                }
                if (!targetId) {
                    return `❌ No agent found with capability: ${capability}`;
                }
            }
            if (!targetId) {
                throw new Error('Must provide either target_agent_id or capability');
            }
            const delegationRequest = {
                delegation_id: `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                from_agent: agentId,
                to_agent: targetId,
                task,
                context: {
                    workspace_id: workspaceId,
                    original_request_id: `req_${Date.now()}`,
                    delegation_chain: [],
                },
                authorization: {
                    token: authToken,
                },
            };
            const headers = {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                'X-Workspace-Id': workspaceId || '',
                'X-Delegation-Chain': JSON.stringify([agentId]),
                'X-Context-Id': delegationRequest.context.original_request_id,
            };
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), Number(timeout_seconds) * 1000);
            let response = null;
            let usedProxy = false;
            if (upstreamUrl) {
                try {
                    const directUrl = `${upstreamUrl.replace(/\/$/, '')}/a2a/tasks`;
                    response = await fetch(directUrl, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(delegationRequest),
                        signal: controller.signal,
                    });
                }
                catch {
                    response = null;
                }
            }
            if (!response || !response.ok) {
                usedProxy = true;
                const proxyUrl = `${apiUrl}/a2a/${targetId}/tasks`;
                response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(delegationRequest),
                    signal: controller.signal,
                });
            }
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const reason = errorBody.reason || response.statusText;
                throw new Error(`Delegation failed: ${reason}`);
            }
            const result = await response.json();
            const routeInfo = usedProxy ? '(via proxy)' : '(direct)';
            return `✅ Task delegated to agent ${targetId} ${routeInfo}\n\nResult:\n${JSON.stringify(result.result || result, null, 2)}\n\nExecution time: ${result.execution_time_ms || 'N/A'}ms`;
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return `❌ Delegation timeout after ${timeout_seconds || 30} seconds`;
            }
            return `❌ Delegation failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}
/**
 * Agent Status Check Tool - Check if an agent is available
 */
class AgentStatusTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'check_agent_status',
            description: 'Check if another agent is online and available to accept tasks',
            parameters: [
                {
                    name: 'agent_id',
                    type: 'string',
                    description: 'Sekuire ID of the agent to check',
                    required: true,
                },
            ],
            category: 'agent-orchestration',
        };
    }
    async execute(input) {
        try {
            const { agent_id } = input;
            const apiUrl = process.env.SEKUIRE_API_URL || 'https://api.sekuire.com';
            const url = `${apiUrl}/api/v1/agents/${agent_id}/status`;
            const authToken = process.env.SEKUIRE_AUTH_TOKEN || '';
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                if (response.status === 404) {
                    return `❌ Agent ${agent_id} not found`;
                }
                throw new Error(`Status check failed: ${response.statusText}`);
            }
            const status = await response.json();
            return `Agent ${agent_id} status:
- Status: ${status.status}
- Available: ${status.available ? 'Yes' : 'No'}
- Load: ${status.current_load || 0}/${status.max_load || 100}
- Uptime: ${status.uptime_seconds || 0}s
- Last seen: ${status.last_seen || 'Unknown'}`;
        }
        catch (error) {
            return `❌ Status check failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

/**
 * Tool for invoking other Sekuire agents
 * Performs handshake and sends requests to verified agents
 */
class InvokeAgentTool extends Tool {
    constructor(privateKey, publicKey, registryUrl = 'https://api.sekuire.com') {
        super();
        this.metadata = {
            name: 'invoke_agent',
            description: 'Invoke another Sekuire agent by performing a secure handshake and sending a request. Use this to delegate tasks to specialized agents.',
            parameters: [
                {
                    name: 'agent_url',
                    type: 'string',
                    description: 'The base URL of the agent to invoke (e.g., https://agent.example.com)',
                    required: true,
                },
                {
                    name: 'agent_id',
                    type: 'string',
                    description: 'Optional: The expected agent ID for verification',
                    required: false,
                },
                {
                    name: 'request',
                    type: 'string',
                    description: 'The request/query to send to the agent',
                    required: true,
                },
                {
                    name: 'parameters',
                    type: 'object',
                    description: 'Optional: Additional parameters to pass to the agent',
                    required: false,
                },
            ],
            category: 'agent_communication',
        };
        this.client = null;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.registryUrl = registryUrl;
    }
    async execute(input) {
        const agent_url = input.agent_url;
        const agent_id = input.agent_id;
        const request = input.request;
        const parameters = input.parameters;
        if (!this.privateKey || !this.publicKey) {
            return JSON.stringify({
                success: false,
                error: "Agent invocation requires keypair. Run 'sekuire keygen' first.",
            });
        }
        try {
            // Initialize client if not already done
            if (!this.client) {
                this.client = new SekuireClient({ privateKey: this.privateKey, publicKey: this.publicKey }, { registryUrl: this.registryUrl });
            }
            // Perform handshake with target agent
            const handshakeResult = await this.client.connect(agent_url, agent_id);
            if (!handshakeResult.verified) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to verify agent identity during handshake',
                    agent_id: handshakeResult.agentId,
                });
            }
            // Send request to the agent
            const response = await fetch(`${agent_url}/agent/invoke`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Sekuire-Agent-Id': handshakeResult.agentId,
                },
                body: JSON.stringify({
                    request,
                    parameters: parameters || {},
                    credentials: handshakeResult.credentials,
                }),
            });
            if (!response.ok) {
                return JSON.stringify({
                    success: false,
                    error: `Agent returned error: ${response.status} ${response.statusText}`,
                    agent_id: handshakeResult.agentId,
                });
            }
            const result = await response.json();
            return JSON.stringify({
                success: true,
                agent_id: handshakeResult.agentId,
                verified: handshakeResult.verified,
                response: result,
            });
        }
        catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}
/**
 * Tool for searching the Sekuire registry for agents
 */
class SearchAgentsTool extends Tool {
    constructor(privateKey, publicKey, registryUrl = 'https://api.sekuire.com') {
        super();
        this.metadata = {
            name: 'search_agents',
            description: 'Search the Sekuire registry for agents by name, capability, or description. Returns a list of verified agents.',
            parameters: [
                {
                    name: 'query',
                    type: 'string',
                    description: 'Search query (agent name, capability, or description)',
                    required: true,
                },
                {
                    name: 'limit',
                    type: 'number',
                    description: 'Maximum number of results to return (default: 10)',
                    required: false,
                },
            ],
            category: 'agent_communication',
        };
        this.client = null;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.registryUrl = registryUrl;
    }
    async execute(input) {
        const query = input.query;
        const limit = input.limit || 10;
        try {
            // Initialize client if not already done
            if (!this.client) {
                if (!this.privateKey || !this.publicKey) {
                    // Create temporary keypair for registry access
                    const tempKeyPair = SekuireCrypto.generateKeyPair();
                    this.client = new SekuireClient(tempKeyPair, {
                        registryUrl: this.registryUrl,
                    });
                }
                else {
                    this.client = new SekuireClient({ privateKey: this.privateKey, publicKey: this.publicKey }, { registryUrl: this.registryUrl });
                }
            }
            const agents = await this.client.searchAgents(query);
            const limitedAgents = agents.slice(0, limit);
            return JSON.stringify({
                success: true,
                count: limitedAgents.length,
                agents: limitedAgents.map((agent) => ({
                    id: agent.sekuireId,
                    name: agent.name,
                    description: agent.description,
                    verification_status: agent.verificationStatus,
                })),
            });
        }
        catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                agents: [],
            });
        }
    }
}
/**
 * Tool for getting detailed information about a specific agent
 */
class GetAgentInfoTool extends Tool {
    constructor(privateKey, publicKey, registryUrl = 'https://api.sekuire.com') {
        super();
        this.metadata = {
            name: 'get_agent_info',
            description: 'Get detailed information about a specific Sekuire agent including its verification status, capabilities, and public key.',
            parameters: [
                {
                    name: 'agent_id',
                    type: 'string',
                    description: 'The unique identifier of the agent',
                    required: true,
                },
            ],
            category: 'agent_communication',
        };
        this.client = null;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.registryUrl = registryUrl;
    }
    async execute(input) {
        const agent_id = input.agent_id;
        try {
            // Initialize client if not already done
            if (!this.client) {
                if (!this.privateKey || !this.publicKey) {
                    // Create temporary keypair for registry access
                    const tempKeyPair = SekuireCrypto.generateKeyPair();
                    this.client = new SekuireClient(tempKeyPair, {
                        registryUrl: this.registryUrl,
                    });
                }
                else {
                    this.client = new SekuireClient({ privateKey: this.privateKey, publicKey: this.publicKey }, { registryUrl: this.registryUrl });
                }
            }
            const agent = await this.client.getAgentInfo(agent_id);
            return JSON.stringify({
                success: true,
                agent: {
                    id: agent.sekuireId,
                    name: agent.name,
                    description: agent.description,
                    author_key: agent.authorKey,
                    verification_status: agent.verificationStatus,
                    created_at: agent.createdAt,
                },
            });
        }
        catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}

class CalculatorTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'calculator',
            description: 'Perform mathematical calculations',
            parameters: [
                {
                    name: 'expression',
                    type: 'string',
                    description: 'Mathematical expression to evaluate (e.g., "2 + 2 * 3")',
                    required: true,
                },
            ],
            category: 'utility',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        this.validate(input);
        const expression = input.expression;
        // Basic validation to prevent code injection
        if (!/^[\d\s+\-*/.()]+$/.test(expression)) {
            throw new Error('Invalid expression. Only numbers and basic operators (+, -, *, /, .) are allowed');
        }
        try {
            // Safe evaluation using Function constructor with restricted scope
            const result = new Function('return ' + expression)();
            return `${expression} = ${result}`;
        }
        catch (error) {
            throw new Error(`Calculation failed: ${error instanceof Error ? error.message : 'Invalid expression'}`);
        }
    }
}

class AuditLogTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'audit_log',
            description: 'Log action for compliance audit trail',
            parameters: [],
            category: 'compliance',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: input.action,
            actor: input.actor || 'system',
            resource: input.resource,
            metadata: input.metadata,
        };
        // In production, send to logging service
        console.log('[AUDIT]', JSON.stringify(logEntry));
        return { logged: true };
    }
}
class PiiDetectTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'pii_detect',
            description: 'Detect personally identifiable information in text',
            parameters: [],
            category: 'compliance',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const patterns = {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            phone: /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
            ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
            creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
            ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
        };
        const detected = [];
        const matches = [];
        for (const [type, pattern] of Object.entries(patterns)) {
            const found = input.text.match(pattern);
            if (found && found.length > 0) {
                detected.push(type);
                matches.push({ type, count: found.length, samples: found.slice(0, 3) });
            }
        }
        return {
            detected: detected.length > 0,
            types: detected,
            matches,
        };
    }
}
class EncryptDataTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'encrypt_data',
            description: 'Encrypt sensitive data',
            parameters: [],
            category: 'compliance',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const key = input.key
            ? Buffer.from(crypto.createHash('sha256').update(input.key).digest('hex').slice(0, 32))
            : crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(input.data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return {
            encrypted,
            iv: iv.toString('hex'),
        };
    }
}
class DecryptDataTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'decrypt_data',
            description: 'Decrypt encrypted data (HIGH RISK)',
            parameters: [],
            category: 'compliance',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const key = Buffer.from(crypto.createHash('sha256').update(input.key).digest('hex').slice(0, 32));
        const iv = Buffer.from(input.iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(input.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

class JsonStringifyTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'json_stringify',
            description: 'Convert object to JSON string',
            parameters: [],
            category: 'data',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        return JSON.stringify(input.data, null, input.pretty ? 2 : 0);
    }
}
class CsvParseTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'csv_parse',
            description: 'Parse CSV string to array of objects',
            parameters: [],
            category: 'data',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const delimiter = input.delimiter || ',';
        const hasHeaders = input.headers !== false;
        const lines = input.csv.trim().split('\n');
        if (lines.length === 0)
            return [];
        const headers = hasHeaders
            ? lines[0].split(delimiter).map((h) => h.trim())
            : Array.from({ length: lines[0].split(delimiter).length }, (_, i) => `column${i}`);
        const startIndex = hasHeaders ? 1 : 0;
        return lines.slice(startIndex).map((line) => {
            const values = line.split(delimiter).map((v) => v.trim());
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = values[i] || '';
            });
            return obj;
        });
    }
}
class CsvWriteTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'csv_write',
            description: 'Convert array of objects to CSV string',
            parameters: [],
            category: 'data',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        if (!Array.isArray(input.data) || input.data.length === 0) {
            return '';
        }
        const delimiter = input.delimiter || ',';
        const includeHeaders = input.headers !== false;
        const headers = Object.keys(input.data[0]);
        const rows = [];
        if (includeHeaders) {
            rows.push(headers.join(delimiter));
        }
        for (const item of input.data) {
            const values = headers.map((header) => {
                const value = item[header]?.toString() || '';
                // Escape values containing delimiter or quotes
                return value.includes(delimiter) || value.includes('"')
                    ? `"${value.replace(/"/g, '""')}"`
                    : value;
            });
            rows.push(values.join(delimiter));
        }
        return rows.join('\n');
    }
}
class YamlParseTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'yaml_parse',
            description: 'Parse YAML string to object',
            parameters: [],
            category: 'data',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        // Simple YAML parser for basic cases
        // For production, use a proper YAML library
        const lines = input.yaml.split('\n');
        const result = {};
        let currentKey = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            if (trimmed.includes(':')) {
                const [key, ...valueParts] = trimmed.split(':');
                const value = valueParts.join(':').trim();
                currentKey = key.trim();
                if (value) {
                    // Parse value types
                    if (value === 'true')
                        result[currentKey] = true;
                    else if (value === 'false')
                        result[currentKey] = false;
                    else if (value === 'null')
                        result[currentKey] = null;
                    else if (!isNaN(Number(value)))
                        result[currentKey] = Number(value);
                    else
                        result[currentKey] = value.replace(/^["']|["']$/g, '');
                }
                else {
                    result[currentKey] = {};
                }
            }
        }
        return result;
    }
}
class XmlParseTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'xml_parse',
            description: 'Parse XML string to object',
            parameters: [],
            category: 'data',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        // Simple XML parser - for production use a proper XML library
        const tagRegex = /<(\w+)(?:\s+[^>]*)?>([^<]*)<\/\1>/g;
        const result = {};
        let match;
        while ((match = tagRegex.exec(input.xml)) !== null) {
            const [, tag, content] = match;
            result[tag] = content.trim();
        }
        return result;
    }
}

class JsonParseTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'json_parse',
            description: 'Parse and format JSON string',
            parameters: [
                {
                    name: 'json',
                    type: 'string',
                    description: 'JSON string to parse',
                    required: true,
                },
            ],
            category: 'data',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const jsonStr = input.json;
        try {
            const parsed = JSON.parse(jsonStr);
            return JSON.stringify(parsed, null, 2);
        }
        catch (error) {
            throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class Base64EncodeTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'base64_encode',
            description: 'Encode text to base64',
            parameters: [
                {
                    name: 'text',
                    type: 'string',
                    description: 'Text to encode',
                    required: true,
                },
            ],
            category: 'data',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const text = input.text;
        return Buffer.from(text).toString('base64');
    }
}
class Base64DecodeTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'base64_decode',
            description: 'Decode base64 string to text',
            parameters: [
                {
                    name: 'base64',
                    type: 'string',
                    description: 'Base64 string to decode',
                    required: true,
                },
            ],
            category: 'data',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const base64Str = input.base64;
        try {
            return Buffer.from(base64Str, 'base64').toString('utf-8');
        }
        catch (error) {
            throw new Error(`Invalid base64: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class HashTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'hash',
            description: 'Generate cryptographic hash (md5, sha256, sha512, etc.)',
            parameters: [
                {
                    name: 'text',
                    type: 'string',
                    description: 'Text to hash',
                    required: true,
                },
                {
                    name: 'algorithm',
                    type: 'string',
                    description: 'Hash algorithm (default: sha256)',
                    required: false,
                },
            ],
            category: 'data',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const text = input.text;
        const algorithm = input.algorithm || 'sha256';
        try {
            const hash = crypto__namespace.createHash(algorithm);
            hash.update(text);
            return hash.digest('hex');
        }
        catch (error) {
            throw new Error(`Hash generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

class DirectoryListTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_list',
            description: 'List contents of a directory',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the directory',
                    required: true,
                },
            ],
            category: 'directories',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const dirPath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(dirPath, 'read');
        }
        try {
            const files = await fs__namespace$1.readdir(dirPath, { withFileTypes: true });
            const formatted = files.map((file) => {
                const type = file.isDirectory() ? '[DIR]' : '[FILE]';
                return `${type} ${file.name}`;
            });
            return formatted.join('\n');
        }
        catch (error) {
            throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class DirectoryMkdirTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_mkdir',
            description: 'Create a new directory',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the directory to create',
                    required: true,
                },
                {
                    name: 'recursive',
                    type: 'boolean',
                    description: "Create parent directories if they don't exist",
                    required: false,
                },
            ],
            category: 'directories',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const dirPath = input.path;
        const recursive = input.recursive === true || input.recursive === 'true';
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(dirPath, 'write');
        }
        try {
            await fs__namespace$1.mkdir(dirPath, { recursive });
            return `Successfully created directory ${dirPath}`;
        }
        catch (error) {
            throw new Error(`Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class DirectoryRmdirTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_rmdir',
            description: 'Remove an empty directory',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the directory to remove',
                    required: true,
                },
            ],
            category: 'directories',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const dirPath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(dirPath, 'delete');
        }
        try {
            await fs__namespace$1.rmdir(dirPath);
            return `Successfully removed directory ${dirPath}`;
        }
        catch (error) {
            throw new Error(`Failed to remove directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class DirectoryRmRecursiveTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_rm_recursive',
            description: 'Remove a directory and all its contents (DANGEROUS - use with caution)',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the directory to remove recursively',
                    required: true,
                },
            ],
            category: 'directories',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const dirPath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(dirPath, 'delete');
        }
        try {
            await fs__namespace$1.rm(dirPath, { recursive: true, force: true });
            return `Successfully removed directory and contents: ${dirPath}`;
        }
        catch (error) {
            throw new Error(`Failed to remove directory recursively: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class DirectoryExistsTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_exists',
            description: 'Check if a directory exists',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to check',
                    required: true,
                },
            ],
            category: 'directories',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const dirPath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(dirPath, 'read');
        }
        try {
            const stats = await fs__namespace$1.stat(dirPath);
            return stats.isDirectory() ? 'true' : 'false';
        }
        catch {
            return 'false';
        }
    }
}
class DirectoryMoveTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_move',
            description: 'Move or rename directory',
            parameters: [],
            category: 'directories',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        await fs__namespace$1.rename(input.source, input.destination);
        return { moved: true };
    }
}
class DirectoryCopyTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_copy',
            description: 'Copy directory recursively',
            parameters: [],
            category: 'directories',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        await fs__namespace$1.cp(input.source, input.destination, { recursive: true });
        return { copied: true };
    }
}
class DirectoryTreeTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dir_tree',
            description: 'Get directory tree structure',
            parameters: [],
            category: 'directories',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const maxDepth = input.depth ?? 3;
        async function buildTree(dirPath, currentDepth) {
            if (currentDepth >= maxDepth)
                return null;
            const entries = await fs__namespace$1.readdir(dirPath, { withFileTypes: true });
            const tree = { name: path__namespace$1.basename(dirPath), children: [] };
            for (const entry of entries) {
                const fullPath = path__namespace$1.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    const subtree = await buildTree(fullPath, currentDepth + 1);
                    if (subtree) {
                        tree.children.push(subtree);
                    }
                }
                else {
                    tree.children.push({ name: entry.name, type: 'file' });
                }
            }
            return tree;
        }
        return buildTree(input.path, 0);
    }
}

class FileReadTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_read',
            description: 'Read contents of a file',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file to read',
                    required: true,
                },
            ],
            category: 'filesystem',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const filePath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(filePath, 'read');
        }
        try {
            const content = await fs__namespace$1.readFile(filePath, 'utf-8');
            return content;
        }
        catch (error) {
            throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileWriteTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_write',
            description: 'Write content to a file',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file to write',
                    required: true,
                },
                {
                    name: 'content',
                    type: 'string',
                    description: 'Content to write to the file',
                    required: true,
                },
            ],
            category: 'filesystem',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const filePath = input.path;
        const content = input.content;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(filePath, 'write');
        }
        try {
            await fs__namespace$1.writeFile(filePath, content, 'utf-8');
            return `Successfully wrote to ${filePath}`;
        }
        catch (error) {
            throw new Error(`Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileListTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_list',
            description: 'List files in a directory',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the directory',
                    required: true,
                },
            ],
            category: 'filesystem',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const dirPath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(dirPath, 'read');
        }
        try {
            const files = await fs__namespace$1.readdir(dirPath);
            return files.join('\n');
        }
        catch (error) {
            throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileAppendTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_append',
            description: 'Append content to the end of a file',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file',
                    required: true,
                },
                {
                    name: 'content',
                    type: 'string',
                    description: 'Content to append',
                    required: true,
                },
            ],
            category: 'files',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const filePath = input.path;
        const content = input.content;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(filePath, 'write');
        }
        try {
            await fs__namespace$1.appendFile(filePath, content, 'utf-8');
            return `Successfully appended to ${filePath}`;
        }
        catch (error) {
            throw new Error(`Failed to append to file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileDeleteTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_delete',
            description: 'Delete a file',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file to delete',
                    required: true,
                },
            ],
            category: 'files',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const filePath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(filePath, 'delete');
        }
        try {
            await fs__namespace$1.unlink(filePath);
            return `Successfully deleted ${filePath}`;
        }
        catch (error) {
            throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileMoveTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_move',
            description: 'Move or rename a file',
            parameters: [
                {
                    name: 'from',
                    type: 'string',
                    description: 'Source file path',
                    required: true,
                },
                {
                    name: 'to',
                    type: 'string',
                    description: 'Destination file path',
                    required: true,
                },
            ],
            category: 'files',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const fromPath = input.from;
        const toPath = input.to;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(fromPath, 'read');
            this.policyEnforcer.enforceFilesystem(toPath, 'write');
        }
        try {
            await fs__namespace$1.rename(fromPath, toPath);
            return `Successfully moved ${fromPath} to ${toPath}`;
        }
        catch (error) {
            throw new Error(`Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileCopyTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_copy',
            description: 'Copy a file to another location',
            parameters: [
                {
                    name: 'from',
                    type: 'string',
                    description: 'Source file path',
                    required: true,
                },
                {
                    name: 'to',
                    type: 'string',
                    description: 'Destination file path',
                    required: true,
                },
            ],
            category: 'files',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const fromPath = input.from;
        const toPath = input.to;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(fromPath, 'read');
            this.policyEnforcer.enforceFilesystem(toPath, 'write');
        }
        try {
            await fs__namespace$1.copyFile(fromPath, toPath);
            return `Successfully copied ${fromPath} to ${toPath}`;
        }
        catch (error) {
            throw new Error(`Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileStatTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_stat',
            description: 'Get file metadata (size, dates, type)',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file',
                    required: true,
                },
            ],
            category: 'files',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const filePath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(filePath, 'read');
        }
        try {
            const stats = await fs__namespace$1.stat(filePath);
            return JSON.stringify({
                size: stats.size,
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString(),
                accessed: stats.atime.toISOString(),
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                permissions: stats.mode.toString(8),
            }, null, 2);
        }
        catch (error) {
            throw new Error(`Failed to get file stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
class FileExistsTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_exists',
            description: 'Check if a file exists',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to check',
                    required: true,
                },
            ],
            category: 'files',
            compliance_level: 'internal',
        };
    }
    async execute(input) {
        this.validate(input);
        const filePath = input.path;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(filePath, 'read');
        }
        try {
            await fs__namespace$1.access(filePath);
            return 'true';
        }
        catch {
            return 'false';
        }
    }
}
class FileChmodTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'file_chmod',
            description: 'Change file permissions',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file',
                    required: true,
                },
                {
                    name: 'mode',
                    type: 'string',
                    description: 'Permission mode (octal string like "755" or number)',
                    required: true,
                },
            ],
            category: 'filesystem',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceFilesystem(input.path, 'write');
        }
        const mode = typeof input.mode === 'string' ? parseInt(input.mode, 8) : input.mode;
        await fs__namespace$1.chmod(input.path, mode);
        return { changed: true };
    }
}

class GoogleDocsCreateTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'google_docs_create',
            description: 'Create a Google Doc (optionally in a folder) and write initial content. Requires GOOGLE_ACCESS_TOKEN or GOOGLE_DRIVE_MOCK=true.',
            parameters: [
                {
                    name: 'title',
                    type: 'string',
                    description: 'Document title',
                    required: true,
                },
                {
                    name: 'content',
                    type: 'string',
                    description: 'Initial document body text',
                    required: false,
                },
                {
                    name: 'folder_id',
                    type: 'string',
                    description: 'Optional Google Drive folder ID (uses GOOGLE_DRIVE_FOLDER_ID if omitted)',
                    required: false,
                },
            ],
            category: 'google-workspace',
            compliance_level: 'restricted',
            requires_approval: false,
        };
    }
    async execute(input) {
        this.validate(input);
        const title = String(input.title);
        const content = typeof input.content === 'string' ? input.content : '';
        const folderId = typeof input.folder_id === 'string' ? input.folder_id : '';
        const mockMode = (process.env.GOOGLE_DRIVE_MOCK || '').toLowerCase() === 'true';
        if (mockMode) {
            const fakeId = `mock_${Date.now().toString(36)}`;
            return {
                documentId: fakeId,
                url: `https://docs.google.com/document/d/${fakeId}/edit`,
            };
        }
        const accessToken = (process.env.GOOGLE_ACCESS_TOKEN || '').trim();
        if (!accessToken) {
            throw new Error('Missing GOOGLE_ACCESS_TOKEN (or set GOOGLE_DRIVE_MOCK=true).');
        }
        const effectiveFolderId = (folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
        const driveCreateBody = {
            name: title,
            mimeType: 'application/vnd.google-apps.document',
        };
        if (effectiveFolderId) {
            driveCreateBody.parents = [effectiveFolderId];
        }
        const driveRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(driveCreateBody),
        });
        if (!driveRes.ok) {
            const text = await driveRes.text().catch(() => '');
            throw new Error(`Drive create failed: ${driveRes.status} ${driveRes.statusText} ${text}`);
        }
        const driveJson = (await driveRes.json());
        const documentId = driveJson.id;
        if (!documentId) {
            throw new Error('Drive create returned no file id');
        }
        if (content.trim().length > 0) {
            const docsRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: [
                        {
                            insertText: {
                                location: { index: 1 },
                                text: content,
                            },
                        },
                    ],
                }),
            });
            if (!docsRes.ok) {
                const text = await docsRes.text().catch(() => '');
                throw new Error(`Docs update failed: ${docsRes.status} ${docsRes.statusText} ${text}`);
            }
        }
        return {
            documentId,
            url: `https://docs.google.com/document/d/${documentId}/edit`,
        };
    }
}

class HttpRequestTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'http_request',
            description: 'Make HTTP requests to external APIs',
            parameters: [
                {
                    name: 'url',
                    type: 'string',
                    description: 'The URL to make the request to',
                    required: true,
                },
                {
                    name: 'method',
                    type: 'string',
                    description: 'HTTP method (GET, POST, PUT, DELETE)',
                    required: false,
                    default: 'GET',
                },
                {
                    name: 'headers',
                    type: 'object',
                    description: 'HTTP headers as key-value pairs',
                    required: false,
                },
                {
                    name: 'body',
                    type: 'object',
                    description: 'Request body for POST/PUT requests',
                    required: false,
                },
            ],
            category: 'network',
            compliance_level: 'internal',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        const url = input.url;
        const method = input.method?.toUpperCase() || 'GET';
        const headers = input.headers || {};
        const body = input.body;
        if (this.policyEnforcer) {
            try {
                const parsedUrl = new URL(url);
                // Remove trailing colon from protocol (e.g., 'https:' -> 'https')
                const protocol = parsedUrl.protocol.replace(':', '');
                this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
            }
            catch (e) {
                if (e instanceof Error && e.message.includes('Invalid URL')) {
                    throw new Error(`Invalid URL: ${url}`);
                }
                throw e;
            }
        }
        const config = {
            url,
            method,
            headers,
            ...(body && { data: body }),
        };
        try {
            const response = await axios(config);
            return {
                status: response.status,
                headers: response.headers,
                data: response.data,
            };
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`HTTP request failed: ${error.response?.status} - ${error.message}`);
            }
            throw new Error(`HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

class HttpPostTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'http_post',
            description: 'Send HTTP POST request',
            parameters: [
                {
                    name: 'url',
                    type: 'string',
                    description: 'URL to send request to',
                    required: true,
                },
                {
                    name: 'body',
                    type: 'object',
                    description: 'Request body',
                    required: false,
                },
                {
                    name: 'headers',
                    type: 'object',
                    description: 'Request headers',
                    required: false,
                },
            ],
            category: 'network',
            compliance_level: 'internal',
            requires_approval: true,
        };
    }
    async execute(input) {
        if (this.policyEnforcer) {
            const parsedUrl = new url.URL(input.url);
            const protocol = parsedUrl.protocol.replace(':', '');
            this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
        }
        const response = await fetch(input.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...input.headers,
            },
            body: input.body ? JSON.stringify(input.body) : undefined,
        });
        return {
            status: response.status,
            statusText: response.statusText,
            headers: (() => {
                const h = {};
                response.headers.forEach((v, k) => {
                    h[k] = v;
                });
                return h;
            })(),
            body: await response.text(),
        };
    }
}
class HttpPutTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'http_put',
            description: 'Send HTTP PUT request',
            parameters: [
                {
                    name: 'url',
                    type: 'string',
                    description: 'URL to send request to',
                    required: true,
                },
                {
                    name: 'body',
                    type: 'object',
                    description: 'Request body',
                    required: false,
                },
                {
                    name: 'headers',
                    type: 'object',
                    description: 'Request headers',
                    required: false,
                },
            ],
            category: 'network',
            compliance_level: 'internal',
            requires_approval: true,
        };
    }
    async execute(input) {
        if (this.policyEnforcer) {
            const parsedUrl = new url.URL(input.url);
            const protocol = parsedUrl.protocol.replace(':', '');
            this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
        }
        const response = await fetch(input.url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...input.headers,
            },
            body: input.body ? JSON.stringify(input.body) : undefined,
        });
        return {
            status: response.status,
            statusText: response.statusText,
            headers: (() => {
                const h = {};
                response.headers.forEach((v, k) => {
                    h[k] = v;
                });
                return h;
            })(),
            body: await response.text(),
        };
    }
}
class HttpDeleteTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'http_delete',
            description: 'Send HTTP DELETE request',
            parameters: [
                {
                    name: 'url',
                    type: 'string',
                    description: 'URL to send request to',
                    required: true,
                },
                {
                    name: 'headers',
                    type: 'object',
                    description: 'Request headers',
                    required: false,
                },
            ],
            category: 'network',
            compliance_level: 'internal',
            requires_approval: true,
        };
    }
    async execute(input) {
        if (this.policyEnforcer) {
            const parsedUrl = new url.URL(input.url);
            const protocol = parsedUrl.protocol.replace(':', '');
            this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
        }
        const response = await fetch(input.url, {
            method: 'DELETE',
            headers: input.headers,
        });
        return {
            status: response.status,
            statusText: response.statusText,
            headers: (() => {
                const h = {};
                response.headers.forEach((v, k) => {
                    h[k] = v;
                });
                return h;
            })(),
            body: await response.text(),
        };
    }
}
class DownloadFileTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'download_file',
            description: 'Download file from URL to local filesystem',
            parameters: [
                {
                    name: 'url',
                    type: 'string',
                    description: 'URL to download from',
                    required: true,
                },
                {
                    name: 'destination',
                    type: 'string',
                    description: 'Local file path to save to',
                    required: true,
                },
            ],
            category: 'network',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        const parsedUrl = new url.URL(input.url);
        if (this.policyEnforcer) {
            const protocol = parsedUrl.protocol.replace(':', '');
            this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
            this.policyEnforcer.enforceFilesystem(input.destination, 'write');
        }
        const protocol = parsedUrl.protocol === 'https:' ? https__namespace : http__namespace;
        return new Promise((resolve, reject) => {
            const file = fs__namespace.createWriteStream(input.destination);
            protocol
                .get(input.url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    const stats = fs__namespace.statSync(input.destination);
                    resolve({
                        path: input.destination,
                        size: stats.size,
                    });
                });
            })
                .on('error', (err) => {
                fs__namespace.unlinkSync(input.destination);
                reject(err);
            });
        });
    }
}
class DnsLookupTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'dns_lookup',
            description: 'Perform DNS lookup',
            parameters: [],
            category: 'network',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const dns = await import('dns/promises');
        const addresses = await dns.resolve4(input.hostname);
        return { addresses };
    }
}
class PingTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'ping',
            description: 'Ping a host',
            parameters: [],
            category: 'network',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const startTime = Date.now();
        try {
            // Simple TCP connect test as Node doesn't have native ICMP ping
            const dns = await import('dns/promises');
            await dns.resolve4(input.host);
            return {
                alive: true,
                time: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                alive: false,
            };
        }
    }
}

class ToolPatternParser {
    /**
     * Get the tool name prefix for a category
     * "files" -> "file"
     * "directories" -> "dir"
     * "network" -> "http" or "network"
     */
    static getCategoryPrefix(category) {
        const prefixMap = {
            files: 'file',
            directories: 'dir',
            utilities: 'util',
            agent_communication: 'agent',
        };
        return prefixMap[category] || category;
    }
    /**
     * Parse tool patterns:
     *   "calculator" => ["calculator"]
     *   "files:*" => ["file_read", "file_write", "file_delete", ...]
     *   "files:[read,write]" => ["file_read", "file_write"]
     */
    static parse(pattern, registry) {
        // Simple tool name (no colon)
        if (!pattern.includes(':')) {
            return [pattern];
        }
        const [category, operations] = pattern.split(':', 2);
        // Validate category exists
        if (!registry.hasCategory(category)) {
            throw new Error(`Unknown tool category: ${category}`);
        }
        // Wildcard: all tools in category
        if (operations === '*') {
            return registry.getToolsByCategory(category);
        }
        // Granular selection: [read,write,delete]
        if (operations.startsWith('[') && operations.endsWith(']')) {
            const ops = operations
                .slice(1, -1)
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            // Convert category to singular form for tool naming
            // "files" -> "file", "directories" -> "dir"
            const toolPrefix = ToolPatternParser.getCategoryPrefix(category);
            return ops.map((op) => `${toolPrefix}_${op}`);
        }
        throw new Error(`Invalid tool pattern: ${pattern}. Expected format: "category:*" or "category:[op1,op2]"`);
    }
    /**
     * Expand multiple patterns into unique tool names
     */
    static expandPatterns(patterns, registry) {
        const expanded = new Set();
        for (const pattern of patterns) {
            try {
                const tools = ToolPatternParser.parse(pattern, registry);
                tools.forEach((t) => expanded.add(t));
            }
            catch (error) {
                console.warn(`Failed to parse tool pattern "${pattern}": ${error}`);
            }
        }
        return Array.from(expanded);
    }
    /**
     * Filter allowed tools by removing blocked ones
     */
    static filterBlocked(allowedTools, blockedTools) {
        const blockedSet = new Set(blockedTools);
        return allowedTools.filter((tool) => !blockedSet.has(tool));
    }
}

class GetCwdTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'get_cwd',
            description: 'Get current working directory',
            parameters: [],
            category: 'system',
            compliance_level: 'public',
        };
    }
    async execute() {
        return process.cwd();
    }
}
class GetPlatformTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'get_platform',
            description: 'Get system platform information',
            parameters: [],
            category: 'system',
            compliance_level: 'public',
        };
    }
    async execute() {
        return {
            platform: os__namespace.platform(),
            arch: os__namespace.arch(),
            release: os__namespace.release(),
            type: os__namespace.type(),
            cpus: os__namespace.cpus().length,
            totalMemory: os__namespace.totalmem(),
            freeMemory: os__namespace.freemem(),
            uptime: os__namespace.uptime(),
            hostname: os__namespace.hostname(),
            nodeVersion: process.version,
        };
    }
}
class EnvGetTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'env_get',
            description: 'Get environment variable (read-only)',
            parameters: [
                {
                    name: 'key',
                    type: 'string',
                    description: 'Environment variable name',
                    required: true,
                },
            ],
            category: 'system',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceApi('env');
        }
        return process.env[input.key] || '';
    }
}
class EnvSetTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'env_set',
            description: 'Set environment variable (DANGEROUS - requires explicit approval)',
            parameters: [
                {
                    name: 'key',
                    type: 'string',
                    description: 'Environment variable name',
                    required: true,
                },
                {
                    name: 'value',
                    type: 'string',
                    description: 'Value to set',
                    required: true,
                },
            ],
            category: 'system',
            compliance_level: 'restricted',
            requires_approval: true,
        };
    }
    async execute(input) {
        this.validate(input);
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceApi('env');
        }
        process.env[input.key] = input.value;
        return { set: true };
    }
}

class DateFormatTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'date_format',
            description: 'Format dates in various formats',
            parameters: [],
            category: 'utils',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const date = input.date ? new Date(input.date) : new Date();
        const format = input.format || 'iso';
        switch (format.toLowerCase()) {
            case 'iso':
                return date.toISOString();
            case 'date':
                return date.toDateString();
            case 'time':
                return date.toTimeString();
            case 'locale':
                return date.toLocaleString();
            case 'utc':
                return date.toUTCString();
            case 'unix':
                return Math.floor(date.getTime() / 1000).toString();
            default:
                return date.toISOString();
        }
    }
}
class GenerateUuidTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'generate_uuid',
            description: 'Generate UUID v4',
            parameters: [],
            category: 'utils',
            compliance_level: 'public',
        };
    }
    async execute() {
        return crypto.randomBytes(16)
            .toString('hex')
            .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    }
}
class RandomNumberTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'random_number',
            description: 'Generate random number',
            parameters: [],
            category: 'utils',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const min = input.min ?? 0;
        const max = input.max ?? 100;
        return crypto.randomInt(min, max + 1).toString();
    }
}
class SleepTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'sleep',
            description: 'Delay execution for specified milliseconds',
            parameters: [],
            category: 'utils',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const ms = Math.min(input.milliseconds, 60000); // Max 60 seconds
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { slept: ms };
    }
}
class RegexMatchTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'regex_match',
            description: 'Match text against regular expression',
            parameters: [],
            category: 'utils',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        const regex = new RegExp(input.pattern, input.flags || 'g');
        const matches = [];
        const groups = [];
        let match;
        while ((match = regex.exec(input.text)) !== null) {
            matches.push(match[0]);
            if (match.length > 1) {
                groups.push(match.slice(1));
            }
        }
        return { matches, groups: groups.length > 0 ? groups : undefined };
    }
}
class UrlParseTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'url_parse',
            description: 'Parse URL into components',
            parameters: [],
            category: 'utils',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        try {
            const parsed = new URL(input.url);
            return {
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port,
                pathname: parsed.pathname,
                search: parsed.search,
                hash: parsed.hash,
                host: parsed.host,
                origin: parsed.origin,
                searchParams: Object.fromEntries(parsed.searchParams.entries()),
            };
        }
        catch (error) {
            throw new Error(`Invalid URL: ${input.url}`);
        }
    }
}

/**
 * ⚠️ CRITICAL SYSTEM TOOL - DO NOT EDIT OR DELETE ⚠️
 *
 * This tool is automatically included by Sekuire to verify agent compliance
 * and verification status. Removing or modifying this tool will prevent your
 * agent from being properly verified and may result in trust protocol violations.
 *
 * This tool queries the Sekuire registry to check:
 * - Agent verification status (verified/unverified/pending)
 * - Compliance framework adherence
 * - Security score and reputation
 * - Code review status
 */
class VerificationStatusTool extends Tool {
    constructor(registryUrl) {
        super();
        this.metadata = {
            name: 'get_verification_status',
            description: 'Check the verification and compliance status of this agent in the Sekuire registry. This tool is required for trust protocol compliance and must not be removed.',
            parameters: [
                {
                    name: 'sekuire_id',
                    type: 'string',
                    description: 'The Sekuire ID of the agent to check (defaults to current agent)',
                    required: false,
                },
                {
                    name: 'include_details',
                    type: 'boolean',
                    description: 'Include detailed verification information',
                    required: false,
                },
            ],
            category: 'compliance',
            compliance_level: 'system', // System-level tool that cannot be disabled
        };
        // Default to production registry, or use custom URL
        this.registryUrl = registryUrl || process.env.SEKUIRE_REGISTRY_URL || 'http://localhost:9300';
    }
    async execute(input) {
        this.validate(input);
        const sekuireId = input.sekuire_id || this.getAgentId();
        const includeDetails = input.include_details || false;
        if (!sekuireId) {
            throw new Error('No Sekuire ID provided and unable to determine current agent ID');
        }
        try {
            // Query the Sekuire registry API
            const response = await fetch(`${this.registryUrl}/api/v1/agents/${sekuireId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Sekuire-SDK/1.0',
                },
            });
            if (!response.ok) {
                if (response.status === 404) {
                    return JSON.stringify({
                        status: 'error',
                        message: `Agent ${sekuireId} not found in registry. This agent may not be registered or verified.`,
                        is_verified: false,
                        is_compliant: false,
                    });
                }
                throw new Error(`Registry API error: ${response.status}`);
            }
            const agentData = await response.json();
            // Build verification status response
            const result = {
                sekuire_id: agentData.sekuire_id,
                verification_status: agentData.verification_status || 'Unverified',
                reputation_score: agentData.reputation_score || 0,
                security_score: agentData.security_score,
                code_review_status: agentData.code_review_status,
                compliance_frameworks: this.extractComplianceFrameworks(agentData.manifest),
                is_compliant: this.isCompliant(agentData),
                last_verified: agentData.reviewed_at,
                verified_by: agentData.reviewed_by,
            };
            // Add detailed information if requested
            if (includeDetails) {
                result.verification_details = {
                    has_valid_signature: !!agentData.public_key,
                    repository_verified: agentData.repository_verified || false,
                    passes_security_checks: (agentData.security_score || 0) >= 70,
                    compliance_score: this.calculateComplianceScore(agentData),
                };
            }
            // Return formatted response
            return this.formatResponse(result);
        }
        catch (error) {
            return JSON.stringify({
                status: 'error',
                message: `Failed to verify agent status: ${error instanceof Error ? error.message : 'Unknown error'}`,
                is_verified: false,
                is_compliant: false,
                recommendation: "Unable to verify agent. Please ensure the agent is properly registered with 'sekuire publish'.",
            });
        }
    }
    /**
     * Get the current agent's Sekuire ID from environment or config
     */
    getAgentId() {
        // Try to get from environment variable
        const envId = process.env.SEKUIRE_AGENT_ID;
        if (envId)
            return envId;
        // Try to read from .sekuire directory
        try {
            const fs = require('node:fs');
            const path = require('node:path');
            const sekuirePath = path.join(process.cwd(), '.sekuire', 'agent.json');
            if (fs.existsSync(sekuirePath)) {
                const config = JSON.parse(fs.readFileSync(sekuirePath, 'utf-8'));
                return config.sekuire_id;
            }
        }
        catch {
            // Silent fail - we'll return null
        }
        return null;
    }
    /**
     * Extract compliance frameworks from manifest
     */
    extractComplianceFrameworks(manifest) {
        const frameworks = [];
        try {
            const manifestObj = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
            if (manifestObj?.agent?.compliance?.framework) {
                frameworks.push(manifestObj.agent.compliance.framework);
            }
        }
        catch {
            // Silent fail
        }
        return frameworks;
    }
    /**
     * Determine if agent is compliant based on verification status and checks
     */
    isCompliant(agentData) {
        const hasVerification = agentData.verification_status === 'Verified' || agentData.verification_status === 'Pending';
        const hasGoodReputation = (Number(agentData.reputation_score) || 0) >= 0;
        const hasSecurityScore = (Number(agentData.security_score) || 0) >= 60;
        return hasVerification && hasGoodReputation && hasSecurityScore;
    }
    /**
     * Calculate overall compliance score
     */
    calculateComplianceScore(agentData) {
        let score = 0;
        // Verification status (40 points)
        if (agentData.verification_status === 'Verified')
            score += 40;
        else if (agentData.verification_status === 'Pending')
            score += 20;
        // Reputation (30 points)
        const repScore = Math.min(30, Math.floor((Number(agentData.reputation_score) || 0) / 10));
        score += repScore;
        // Security score (20 points)
        const secScore = Math.min(20, Math.floor(((Number(agentData.security_score) || 0) / 100) * 20));
        score += secScore;
        // Code review (10 points)
        if (agentData.code_review_status === 'approved')
            score += 10;
        return score;
    }
    /**
     * Format the response for the agent
     */
    formatResponse(result) {
        const statusEmoji = result.verification_status === 'Verified'
            ? '✅'
            : result.verification_status === 'Pending'
                ? '⏳'
                : '⚠️';
        let response = `${statusEmoji} Agent Verification Status\n\n`;
        response += `Sekuire ID: ${result.sekuire_id}\n`;
        response += `Status: ${result.verification_status}\n`;
        response += `Reputation: ${result.reputation_score}\n`;
        if (result.security_score !== undefined) {
            response += `Security Score: ${result.security_score}/100\n`;
        }
        if (result.compliance_frameworks.length > 0) {
            response += `Compliance: ${result.compliance_frameworks.join(', ')}\n`;
        }
        response += `\nCompliant: ${result.is_compliant ? 'Yes ✓' : 'No ✗'}\n`;
        if (result.verification_details) {
            response += `\nDetailed Verification:\n`;
            response += `  • Valid Signature: ${result.verification_details.has_valid_signature ? '✓' : '✗'}\n`;
            response += `  • Repository Verified: ${result.verification_details.repository_verified ? '✓' : '✗'}\n`;
            response += `  • Security Checks: ${result.verification_details.passes_security_checks ? '✓' : '✗'}\n`;
            response += `  • Compliance Score: ${result.verification_details.compliance_score}/100\n`;
        }
        if (!result.is_compliant) {
            response += `\n⚠️  Warning: This agent is not fully compliant.\n`;
            response += `   Run 'sekuire verify' to initiate verification process.\n`;
        }
        return response;
    }
}

class WebSearchTool extends Tool {
    constructor() {
        super(...arguments);
        this.metadata = {
            name: 'web_search',
            description: 'Search the web for information using various search engines',
            parameters: [
                {
                    name: 'query',
                    type: 'string',
                    description: 'The search query',
                    required: true,
                },
                {
                    name: 'num_results',
                    type: 'number',
                    description: 'Number of results to return',
                    required: false,
                    default: 5,
                },
            ],
            category: 'web',
            compliance_level: 'public',
        };
    }
    async execute(input) {
        this.validate(input);
        const query = input.query;
        const numResults = input.num_results || 5;
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceNetwork('api.duckduckgo.com', 'https');
        }
        // Use DuckDuckGo Instant Answer API (no auth required)
        try {
            const response = await axios.get('https://api.duckduckgo.com/', {
                params: {
                    q: query,
                    format: 'json',
                    no_html: 1,
                },
            });
            const data = response.data;
            const results = [];
            if (data.AbstractText) {
                results.push(`Summary: ${data.AbstractText}`);
            }
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                data.RelatedTopics.slice(0, numResults).forEach((topic) => {
                    if (topic.Text && topic.FirstURL) {
                        results.push(`- ${topic.Text}\n  URL: ${topic.FirstURL}`);
                    }
                });
            }
            if (results.length === 0) {
                return `No results found for query: ${query}`;
            }
            return `Search results for "${query}":\n\n${results.join('\n\n')}`;
        }
        catch (error) {
            throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

function createDefaultToolRegistry(options) {
    const registry = new ToolRegistry();
    // Files category
    registry.register(new FileReadTool());
    registry.register(new FileWriteTool());
    registry.register(new FileAppendTool());
    registry.register(new FileDeleteTool());
    registry.register(new FileMoveTool());
    registry.register(new FileCopyTool());
    registry.register(new FileStatTool());
    registry.register(new FileExistsTool());
    registry.register(new FileListTool());
    registry.register(new FileChmodTool());
    // Directories category
    registry.register(new DirectoryListTool());
    registry.register(new DirectoryMkdirTool());
    registry.register(new DirectoryRmdirTool());
    registry.register(new DirectoryRmRecursiveTool());
    registry.register(new DirectoryExistsTool());
    registry.register(new DirectoryMoveTool());
    registry.register(new DirectoryCopyTool());
    registry.register(new DirectoryTreeTool());
    // Network category
    registry.register(new WebSearchTool());
    registry.register(new HttpRequestTool());
    registry.register(new HttpPostTool());
    registry.register(new HttpPutTool());
    registry.register(new HttpDeleteTool());
    registry.register(new DownloadFileTool());
    registry.register(new DnsLookupTool());
    registry.register(new PingTool());
    // Google Workspace category
    registry.register(new GoogleDocsCreateTool());
    // Data category
    registry.register(new JsonParseTool());
    registry.register(new JsonStringifyTool());
    registry.register(new CsvParseTool());
    registry.register(new CsvWriteTool());
    registry.register(new YamlParseTool());
    registry.register(new XmlParseTool());
    registry.register(new Base64EncodeTool());
    registry.register(new Base64DecodeTool());
    registry.register(new HashTool());
    // Utilities category
    registry.register(new CalculatorTool());
    registry.register(new DateFormatTool());
    registry.register(new GenerateUuidTool());
    registry.register(new RandomNumberTool());
    registry.register(new SleepTool());
    registry.register(new RegexMatchTool());
    registry.register(new UrlParseTool());
    // System category
    registry.register(new GetCwdTool());
    registry.register(new GetPlatformTool());
    registry.register(new EnvGetTool());
    registry.register(new EnvSetTool());
    // Compliance category
    registry.register(new AuditLogTool());
    registry.register(new PiiDetectTool());
    registry.register(new EncryptDataTool());
    registry.register(new DecryptDataTool());
    // Agent Communication category
    registry.register(new SearchAgentsTool(options?.privateKey, options?.publicKey, options?.registryUrl));
    registry.register(new GetAgentInfoTool(options?.privateKey, options?.publicKey, options?.registryUrl));
    registry.register(new InvokeAgentTool(options?.privateKey, options?.publicKey, options?.registryUrl));
    // Agent Orchestration category
    registry.register(new AgentDiscoveryTool());
    registry.register(new AgentDelegationTool());
    registry.register(new AgentStatusTool());
    // CRITICAL: Always register verification status tool (required for compliance)
    registry.register(new VerificationStatusTool());
    return registry;
}
const builtInTools = {
    // Files
    FileReadTool,
    FileWriteTool,
    FileAppendTool,
    FileDeleteTool,
    FileMoveTool,
    FileCopyTool,
    FileStatTool,
    FileExistsTool,
    FileListTool,
    FileChmodTool,
    // Directories
    DirectoryListTool,
    DirectoryMkdirTool,
    DirectoryRmdirTool,
    DirectoryRmRecursiveTool,
    DirectoryExistsTool,
    DirectoryMoveTool,
    DirectoryCopyTool,
    DirectoryTreeTool,
    // Network
    WebSearchTool,
    HttpRequestTool,
    HttpPostTool,
    HttpPutTool,
    HttpDeleteTool,
    DownloadFileTool,
    DnsLookupTool,
    PingTool,
    // Google Workspace
    GoogleDocsCreateTool,
    // Data
    JsonParseTool,
    JsonStringifyTool,
    CsvParseTool,
    CsvWriteTool,
    YamlParseTool,
    XmlParseTool,
    Base64EncodeTool,
    Base64DecodeTool,
    HashTool,
    // Utilities
    CalculatorTool,
    DateFormatTool,
    GenerateUuidTool,
    RandomNumberTool,
    SleepTool,
    RegexMatchTool,
    UrlParseTool,
    // System
    GetCwdTool,
    GetPlatformTool,
    EnvGetTool,
    EnvSetTool,
    // Agent Communication
    SearchAgentsTool,
    GetAgentInfoTool,
    InvokeAgentTool,
    // Agent Orchestration
    AgentDiscoveryTool,
    AgentDelegationTool,
    AgentStatusTool,
    // Compliance
    VerificationStatusTool,
    AuditLogTool,
    PiiDetectTool,
    EncryptDataTool,
    DecryptDataTool,
};

try {
    const dotenv = require('dotenv');
    dotenv.config();
}
catch {
    // dotenv is optional - env vars can be set externally
}
// Global cache for policy files to prevent repetitive disk I/O
const policyCache = new Map();
let ctaShown = false;
function asObject(value) {
    return value !== null && typeof value === 'object' ? value : undefined;
}
function readString(source, keys) {
    if (!source)
        return undefined;
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}
function readNumber(source, keys) {
    if (!source)
        return undefined;
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return undefined;
}
function readBoolean(source, keys) {
    if (!source)
        return undefined;
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true')
                return true;
            if (normalized === 'false')
                return false;
        }
    }
    return undefined;
}
function readStringArray(source) {
    if (!Array.isArray(source))
        return [];
    return source
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}
function dedupeCaseInsensitive(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const normalized = value.toLowerCase();
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        result.push(value);
    }
    return result;
}
function normalizeDomainPatterns(values) {
    const normalized = values
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
        if (entry.startsWith('*.')) {
            return entry;
        }
        try {
            return new URL(entry).hostname;
        }
        catch {
            const withoutScheme = entry.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
            return withoutScheme.split('/')[0] || withoutScheme;
        }
    })
        .filter((entry) => entry.length > 0);
    return dedupeCaseInsensitive(normalized);
}
function buildToolsPolicy(agentConfig) {
    const toolsetAllow = (agentConfig.toolsets?.allowed_tools || [])
        .map((entry) => entry?.name?.trim())
        .filter((entry) => !!entry);
    const legacyAllow = readStringArray(agentConfig.allowed_tools);
    const allowedTools = dedupeCaseInsensitive([...toolsetAllow, ...legacyAllow]).map((name) => ({
        name,
    }));
    const toolsetBlocked = readStringArray(agentConfig.toolsets?.blocked_tools);
    const legacyBlocked = readStringArray(agentConfig.blocked_tools);
    const blockedTools = dedupeCaseInsensitive([...toolsetBlocked, ...legacyBlocked]);
    return {
        allowed_tools: allowedTools,
        blocked_tools: blockedTools,
    };
}
function buildPermissionsPolicy(config, agentConfig) {
    const rootNetwork = config.permissions?.network;
    const rootFilesystem = config.permissions?.filesystem;
    const rootApi = config.permissions?.api;
    const legacyNetwork = agentConfig.network;
    const legacyFs = agentConfig.filesystem;
    const allowedDomains = normalizeDomainPatterns([
        ...readStringArray(rootNetwork?.allowed_domains),
        ...readStringArray(legacyNetwork?.allow),
    ]);
    const blockedDomains = normalizeDomainPatterns([
        ...readStringArray(rootNetwork?.blocked_domains),
        ...readStringArray(legacyNetwork?.block),
    ]);
    const allowedPaths = dedupeCaseInsensitive([
        ...readStringArray(rootFilesystem?.allowed_paths),
        ...readStringArray(legacyFs?.allow_read),
        ...readStringArray(legacyFs?.allow_write),
    ]);
    const blockedPaths = dedupeCaseInsensitive([
        ...readStringArray(rootFilesystem?.blocked_paths),
        ...readStringArray(legacyFs?.block_all),
    ]);
    const allowedExtensions = dedupeCaseInsensitive([
        ...readStringArray(rootFilesystem?.allowed_extensions),
        ...readStringArray(legacyFs?.allowed_extensions),
    ]);
    const hasNetworkConfig = !!rootNetwork ||
        !!legacyNetwork ||
        allowedDomains.length > 0 ||
        blockedDomains.length > 0;
    const networkEnabled = rootNetwork?.enabled ?? legacyNetwork?.enabled;
    const networkRequireTls = rootNetwork?.require_tls ?? legacyNetwork?.require_tls ?? false;
    const hasFilesystemConfig = !!rootFilesystem ||
        !!legacyFs ||
        allowedPaths.length > 0 ||
        blockedPaths.length > 0 ||
        allowedExtensions.length > 0;
    const filesystemEnabled = rootFilesystem?.enabled ?? legacyFs?.enabled;
    const permissions = {};
    if (hasNetworkConfig) {
        permissions.network = {
            enabled: networkEnabled ?? true,
            require_tls: networkRequireTls,
            ...(allowedDomains.length > 0 ? { allowed_domains: allowedDomains } : {}),
            ...(blockedDomains.length > 0 ? { blocked_domains: blockedDomains } : {}),
        };
    }
    if (hasFilesystemConfig) {
        permissions.filesystem = {
            enabled: filesystemEnabled ?? true,
            ...(allowedPaths.length > 0 ? { allowed_paths: allowedPaths } : {}),
            ...(blockedPaths.length > 0 ? { blocked_paths: blockedPaths } : {}),
            ...(allowedExtensions.length > 0 ? { allowed_extensions: allowedExtensions } : {}),
        };
    }
    if (rootApi) {
        permissions.api = rootApi;
    }
    return permissions;
}
function buildConfigBackedPolicy(config, agentConfig) {
    return {
        policy_id: `${config.project.name}-policy`,
        workspace_id: 'local',
        version: config.project.version || '1.0.0',
        status: 'active',
        hash: 'config-based',
        content: {
            agent: {
                models: agentConfig.models || {},
            },
            tools: buildToolsPolicy(agentConfig),
            permissions: buildPermissionsPolicy(config, agentConfig),
            rate_limits: config.rate_limits || {},
        },
    };
}
function normalizeMemoryFactoryConfig(memoryConfig) {
    if (!memoryConfig)
        return undefined;
    const cfg = asObject(memoryConfig.config);
    const type = memoryConfig.type || 'in-memory';
    const sqlite = memoryConfig.sqlite ||
        (() => {
            const filename = readString(cfg, ['filename']);
            if (!filename)
                return undefined;
            return {
                filename,
                tableName: readString(cfg, ['tableName', 'table_name']),
                readonly: readBoolean(cfg, ['readonly']),
            };
        })();
    const file = memoryConfig.file ||
        (() => {
            const filePath = readString(cfg, ['path']);
            if (!filePath)
                return undefined;
            return { path: filePath };
        })();
    const redis = memoryConfig.redis ||
        (() => {
            const url = readString(cfg, ['url']);
            const host = readString(cfg, ['host']);
            const port = readNumber(cfg, ['port']);
            if (!url && !host && port === undefined)
                return undefined;
            return {
                url,
                host,
                port,
                password: readString(cfg, ['password']),
                db: readNumber(cfg, ['db']),
                keyPrefix: readString(cfg, ['keyPrefix']),
            };
        })();
    const postgres = memoryConfig.postgres ||
        (() => {
            const connectionString = readString(cfg, ['connectionString', 'connection_string', 'url']);
            const host = readString(cfg, ['host']);
            const port = readNumber(cfg, ['port']);
            if (!connectionString && !host && port === undefined)
                return undefined;
            return {
                connectionString,
                host,
                port,
                database: readString(cfg, ['database']),
                user: readString(cfg, ['user']),
                password: readString(cfg, ['password']),
                tableName: readString(cfg, ['tableName', 'table_name']),
            };
        })();
    const upstash = memoryConfig.upstash ||
        (() => {
            const url = readString(cfg, ['url']);
            const token = readString(cfg, ['token']);
            if (!url || !token)
                return undefined;
            return {
                url,
                token,
                keyPrefix: readString(cfg, ['keyPrefix']),
            };
        })();
    const cloudflareKV = memoryConfig.cloudflareKV ||
        (() => {
            const namespaceId = readString(cfg, ['namespaceId', 'namespace_id']);
            const accountId = readString(cfg, ['accountId', 'account_id']);
            const apiToken = readString(cfg, ['apiToken', 'api_token']);
            if (!namespaceId && !accountId && !apiToken)
                return undefined;
            return {
                namespaceId,
                accountId,
                apiToken,
                keyPrefix: readString(cfg, ['keyPrefix']),
            };
        })();
    const cloudflareD1 = memoryConfig.cloudflareD1 ||
        (() => {
            const databaseId = readString(cfg, ['databaseId', 'database_id']);
            const accountId = readString(cfg, ['accountId', 'account_id']);
            const apiToken = readString(cfg, ['apiToken', 'api_token']);
            if (!databaseId && !accountId && !apiToken)
                return undefined;
            return {
                databaseId,
                accountId,
                apiToken,
                tableName: readString(cfg, ['tableName', 'table_name']),
            };
        })();
    const dynamodb = memoryConfig.dynamodb ||
        (() => {
            const tableName = readString(cfg, ['tableName', 'table_name']);
            if (!tableName)
                return undefined;
            return {
                tableName,
                region: readString(cfg, ['region']),
                endpoint: readString(cfg, ['endpoint']),
                createTable: readBoolean(cfg, ['createTable', 'create_table']),
            };
        })();
    const turso = memoryConfig.turso ||
        (() => {
            const url = readString(cfg, ['url']);
            if (!url)
                return undefined;
            return {
                url,
                authToken: readString(cfg, ['authToken', 'auth_token']),
                tableName: readString(cfg, ['tableName', 'table_name']),
            };
        })();
    const convex = memoryConfig.convex ||
        (() => {
            const url = readString(cfg, ['url']);
            if (!url)
                return undefined;
            return {
                url,
                adminKey: readString(cfg, ['adminKey', 'admin_key']),
            };
        })();
    return {
        type,
        redis,
        postgres,
        sqlite,
        file,
        upstash,
        cloudflareKV,
        cloudflareD1,
        dynamodb,
        turso,
        convex,
    };
}
/**
 * Sekuire Agent - Config-first AI agent
 */
class SekuireAgent {
    constructor(config) {
        this.sessionId = 'default';
        this.maxHistoryMessages = 10;
        this.name = config.name;
        this.llm = config.llm;
        this.systemPrompt = config.systemPrompt;
        this.tools = config.tools;
        this.memory = config.memory;
        this.maxHistoryMessages = config.maxHistoryMessages || 10;
        this.policyEnforcer = config.policyEnforcer;
    }
    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }
    /**
     * Chat with the agent
     */
    async chat(userMessage, options) {
        const tracer = getTracer();
        return tracer.startActiveSpan('chat', async (span) => {
            try {
                span.setAttribute('user_message_length', userMessage.length);
                if (this.policyEnforcer) {
                    this.policyEnforcer.enforceModel(this.getModelName());
                    this.policyEnforcer.enforceRateLimit('request');
                }
                let historyMessages = [];
                if (this.memory) {
                    const memoryMessages = await this.memory.get(this.sessionId, this.maxHistoryMessages);
                    historyMessages = memoryMessages.map((m) => ({
                        role: m.role,
                        content: m.content
                    }));
                }
                const messages = [
                    { role: 'system', content: this.systemPrompt },
                    ...historyMessages,
                    { role: 'user', content: userMessage },
                ];
                if (this.memory) {
                    await this.memory.add(this.sessionId, {
                        role: 'user',
                        content: userMessage,
                        timestamp: Date.now()
                    });
                }
                let turns = 0;
                const MAX_TURNS = 5;
                while (turns < MAX_TURNS) {
                    const tools = this.getTools().map(t => ({
                        type: "function",
                        function: {
                            name: t.name,
                            description: t.description,
                            parameters: t.schema
                        }
                    }));
                    const response = await this.llm.chat(messages, {
                        ...options,
                        tools: tools.length > 0 ? tools : undefined
                    });
                    if (response.tool_calls && response.tool_calls.length > 0) {
                        const assistantMessage = {
                            role: 'assistant',
                            content: response.content || null,
                            tool_calls: response.tool_calls
                        };
                        messages.push(assistantMessage);
                        for (const call of response.tool_calls) {
                            try {
                                const args = JSON.parse(call.function.arguments);
                                const result = await this.executeTool(call.function.name, args);
                                messages.push({
                                    role: 'tool',
                                    tool_call_id: call.id,
                                    content: typeof result === 'string' ? result : JSON.stringify(result),
                                    name: call.function.name
                                });
                            }
                            catch (error) {
                                messages.push({
                                    role: 'tool',
                                    tool_call_id: call.id,
                                    content: `Error: ${error.message}`,
                                    name: call.function.name
                                });
                            }
                        }
                        turns++;
                    }
                    else {
                        if (this.memory) {
                            await this.memory.add(this.sessionId, {
                                role: 'assistant',
                                content: response.content,
                                timestamp: Date.now()
                            });
                        }
                        span.setAttribute('response_length', response.content.length);
                        span.end();
                        return response.content;
                    }
                }
                span.end();
                return "Error: Maximum conversation turns reached.";
            }
            catch (error) {
                span.recordException(error);
                span.end();
                throw error;
            }
        });
    }
    /**
     * Execute a tool by name
     */
    async executeTool(name, args) {
        const tracer = getTracer();
        return tracer.startActiveSpan(`tool:${name}`, async (span) => {
            try {
                span.setAttribute('tool.name', name);
                span.setAttribute('tool.args', JSON.stringify(args));
                if (this.policyEnforcer) {
                    this.policyEnforcer.enforceTool(name);
                }
                const toolRegistry = createDefaultToolRegistry();
                const toolInstance = toolRegistry.get(name);
                if (!toolInstance) {
                    throw new Error(`Tool implementation not found for: ${name}`);
                }
                if (this.policyEnforcer) {
                    toolInstance.setPolicyEnforcer(this.policyEnforcer);
                }
                const result = await toolInstance.execute(args);
                span.end();
                return result;
            }
            catch (error) {
                span.recordException(error);
                span.end();
                throw error;
            }
        });
    }
    /**
     * Stream chat response
     */
    async *chatStream(userMessage, options) {
        // 1. Enforce Policy
        if (this.policyEnforcer) {
            this.policyEnforcer.enforceModel(this.getModelName());
            this.policyEnforcer.enforceRateLimit('request');
        }
        // Streaming doesn't easily support tool loops in this simple implementation
        // Pass tools anyway, but if tool_calls happen, we might not handle them gracefully in stream
        // For MVP, assume simple chat for stream.
        // Get conversation history from memory
        const history = this.memory
            ? await this.memory.get(this.sessionId, this.maxHistoryMessages)
            : [];
        // Build messages array
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
        ];
        let fullResponse = '';
        // Stream response from LLM
        for await (const chunk of this.llm.chatStream(messages, options)) {
            fullResponse += chunk.content;
            yield chunk.content;
        }
        // Store in memory
        if (this.memory) {
            await this.memory.add(this.sessionId, { role: 'user', content: userMessage, timestamp: Date.now() });
            await this.memory.add(this.sessionId, { role: 'assistant', content: fullResponse, timestamp: Date.now() });
        }
    }
    /**
     * Clear conversation history
     */
    async clearHistory() {
        if (this.memory) {
            await this.memory.clear(this.sessionId);
        }
    }
    /**
     * Get conversation history
     */
    async getHistory() {
        if (!this.memory)
            return [];
        const history = await this.memory.get(this.sessionId);
        return history.map((m) => ({ role: m.role, content: m.content }));
    }
    /**
     * Get LLM provider name
     */
    getLLMProvider() {
        return this.llm.getProviderName();
    }
    /**
     * Get LLM model name
     */
    getModelName() {
        return this.llm.getModelName();
    }
    /**
     * Get available tools
     */
    getTools() {
        // Filter tools if policy is present
        if (this.policyEnforcer) {
            const allowedTools = [];
            for (const tool of this.tools) {
                try {
                    // If enforceTool throws, it's not allowed
                    this.policyEnforcer.enforceTool(tool.name);
                    allowedTools.push(tool);
                }
                catch (e) {
                    // Tool blocked by policy, skip it
                }
            }
            return allowedTools;
        }
        return [...this.tools];
    }
    /**
     * Get the active policy enforcer
     */
    getPolicyEnforcer() {
        return this.policyEnforcer;
    }
}
/**
 * Load an agent from sekuire.yml configuration
 *
 * @param agentName - Name of the agent to load (for multi-agent configs)
 * @param overrides - Optional overrides for agent configuration
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns Initialized agent instance
 *
 * @example
 * ```typescript
 * // Load agent from config
 * const agent = await getAgent('my-agent-openai');
 *
 * // Chat with the agent
 * const response = await agent.chat('Hello!');
 * console.log(response);
 * ```
 */
async function getAgent(agentName, overrides, configPath) {
    // Load configuration
    const config = await loadConfig(configPath);
    // Get agent configuration
    const agentConfig = getAgentConfig(config, agentName);
    // Create LLM provider
    const llmProvider = overrides?.llm || (await createLLMProviderFromConfig(agentConfig.llm));
    // Load system prompt
    const systemPrompt = overrides?.systemPrompt || (await loadSystemPrompt(agentConfig.system_prompt));
    // Helper to convert Tool instance to ToolDefinition
    const convertToolToDefinition = (tool) => ({
        name: tool.metadata.name,
        description: tool.metadata.description,
        category: tool.metadata.category,
        schema: {
            type: 'object',
            properties: Object.fromEntries(tool.metadata.parameters.map(p => [
                p.name,
                {
                    type: p.type,
                    description: p.description,
                    ...(p.default && { default: p.default }),
                },
            ])),
            required: tool.metadata.parameters.filter(p => p.required).map(p => p.name),
        },
        implementation: 'builtin',
    });
    // Load tools
    const toolsSchema = await loadTools(agentConfig.tools);
    const customTools = overrides?.tools || toolsSchema.tools || [];
    // Load builtin tools based on toolsets configuration
    const allTools = [...customTools];
    if (agentConfig.toolsets?.allowed_tools) {
        const toolRegistry = createDefaultToolRegistry();
        for (const toolConfig of agentConfig.toolsets.allowed_tools) {
            const toolName = toolConfig.name;
            // Check if it's a category pattern (e.g., "files:*" or "files")
            if (toolName.includes(':') && toolName.endsWith('*')) {
                const category = toolName.replace(':*', '');
                const toolNames = toolRegistry.getToolsByCategory(category);
                for (const name of toolNames) {
                    const tool = toolRegistry.get(name);
                    if (tool) {
                        allTools.push(convertToolToDefinition(tool));
                    }
                }
            }
            else if (toolName.includes(':')) {
                // Specific tool in category (e.g., "files:read")
                const tool = toolRegistry.get(toolName);
                if (tool) {
                    allTools.push(convertToolToDefinition(tool));
                }
            }
            else {
                // Check if it's just a category name (backward compatibility)
                const toolNames = toolRegistry.getToolsByCategory(toolName);
                if (toolNames.length > 0) {
                    for (const name of toolNames) {
                        const tool = toolRegistry.get(name);
                        if (tool) {
                            allTools.push(convertToolToDefinition(tool));
                        }
                    }
                }
                else {
                    // Exact tool name
                    const tool = toolRegistry.get(toolName);
                    if (tool) {
                        allTools.push(convertToolToDefinition(tool));
                    }
                }
            }
        }
    }
    const seenNames = new Set();
    const tools = allTools.filter(t => {
        if (seenNames.has(t.name))
            return false;
        seenNames.add(t.name);
        return true;
    });
    // Create memory storage
    let memory;
    if (overrides?.memory) {
        memory = overrides.memory;
    }
    else {
        const memoryFactoryConfig = normalizeMemoryFactoryConfig(agentConfig.memory);
        if (memoryFactoryConfig) {
            memory = createMemoryStorage(memoryFactoryConfig);
        }
    }
    // Get memory config
    const maxHistoryMessages = agentConfig.memory?.max_messages || 10;
    // Load Policy from config or separate file
    let policyEnforcer;
    try {
        let activePolicy;
        // Option 1: Try to load from separate policy.json file (backward compatibility)
        const policyPath = overrides?.policyPath || 'policy.json';
        try {
            if (policyCache.has(policyPath)) {
                activePolicy = policyCache.get(policyPath);
            }
            else {
                const policyContent = await fs$1.readFile(policyPath, 'utf-8');
                activePolicy = JSON.parse(policyContent);
                policyCache.set(policyPath, activePolicy);
            }
        }
        catch (fileError) {
            // Option 2: Build policy from sekuire.yml config.
            activePolicy = buildConfigBackedPolicy(config, agentConfig);
        }
        policyEnforcer = new PolicyEnforcer(activePolicy);
    }
    catch (error) {
        // No policy configured - proceed without enforcement
        // console.warn(`⚠️  No policy configured. Running in unrestricted mode.`);
    }
    if (!ctaShown && !process.env.SEKUIRE_INSTALL_TOKEN && process.env.SEKUIRE_NO_CTA !== 'true') {
        ctaShown = true;
        console.info('[sekuire] Running in standalone mode. Add SEKUIRE_INSTALL_TOKEN for central governance, audit, and fleet management. https://sekuire.ai/docs/guides/developer/upgrade-from-standalone');
    }
    // Create and return agent
    return new SekuireAgent({
        name: agentConfig.name,
        llm: llmProvider,
        systemPrompt,
        tools,
        memory,
        maxHistoryMessages,
        policyEnforcer,
    });
}
/**
 * Create LLM provider from configuration
 */
async function createLLMProviderFromConfig(llmConfig) {
    const provider = llmConfig.provider.toLowerCase();
    const requiresApiKey = provider !== 'ollama';
    const apiKey = process.env[llmConfig.api_key_env];
    if (requiresApiKey && !apiKey) {
        throw new Error(`API key not found: ${llmConfig.api_key_env}. ` +
            `Please set this environment variable.`);
    }
    // Create provider
    return createLLMProvider(llmConfig.provider, {
        apiKey: apiKey || '',
        model: llmConfig.model,
        baseUrl: llmConfig.base_url,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.max_tokens,
    });
}
/**
 * Load all agents from configuration
 *
 * @param configPath - Path to sekuire.yml
 * @returns Map of agent name to agent instance
 *
 * @example
 * ```typescript
 * const agents = await getAgents();
 * const openai = agents.get('my-agent-openai');
 * const claude = agents.get('my-agent-claude');
 * ```
 */
async function getAgents(configPath) {
    const config = await loadConfig(configPath);
    const agentsMap = new Map();
    if (config.agents) {
        // Multi-agent configuration
        for (const agentName of Object.keys(config.agents)) {
            const agent = await getAgent(agentName, undefined, configPath);
            agentsMap.set(agentName, agent);
        }
    }
    else if (config.agent) {
        // Single agent configuration
        const agent = await getAgent(undefined, undefined, configPath);
        agentsMap.set(config.project.name, agent);
    }
    return agentsMap;
}
/**
 * Get system prompt for a specific agent from configuration
 *
 * @param agentName - Name of the agent (optional for single-agent configs)
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns The system prompt content
 *
 * @example
 * ```typescript
 * const prompt = await getSystemPrompt('my-agent-openai');
 * console.log(prompt);
 * ```
 */
async function getSystemPrompt(agentName, configPath) {
    const config = await loadConfig(configPath);
    const agentConfig = getAgentConfig(config, agentName);
    return await loadSystemPrompt(agentConfig.system_prompt);
}
/**
 * Get tools for a specific agent from configuration
 *
 * @param agentName - Name of the agent (optional for single-agent configs)
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns The tools schema with tool definitions
 *
 * @example
 * ```typescript
 * const toolsSchema = await getTools('my-agent-openai');
 * console.log(toolsSchema.tools);
 * ```
 */
async function getTools(agentName, configPath) {
    const config = await loadConfig(configPath);
    const agentConfig = getAgentConfig(config, agentName);
    const toolsSchema = await loadTools(agentConfig.tools);
    return toolsSchema.tools || [];
}

/**
 * Base class for implementing Sekuire protocol servers
 */
class SekuireServer {
    constructor(agentId, keyPair) {
        this.agentId = agentId;
        this.keyPair = keyPair;
        this.pendingHandshakes = new Map();
        this.activeSessions = new Map();
    }
    purgeExpiredHandshakes() {
        const now = Date.now();
        for (const [clientNonce, pending] of this.pendingHandshakes) {
            if (now - pending.createdAt > SekuireServer.HANDSHAKE_TTL_MS) {
                this.pendingHandshakes.delete(clientNonce);
            }
        }
    }
    purgeExpiredSessions() {
        const now = Date.now();
        for (const [sessionToken, session] of this.activeSessions) {
            if (now - session.createdAt > SekuireServer.SESSION_TTL_MS) {
                this.activeSessions.delete(sessionToken);
            }
        }
    }
    firstHeaderValue(value) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return String(Math.floor(value));
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
        if (Array.isArray(value) && value.length > 0) {
            return this.firstHeaderValue(value[0]);
        }
        return undefined;
    }
    parseTimestamp(value) {
        const trimmed = value.trim();
        if (!trimmed) {
            throw new ProtocolError("Missing request timestamp");
        }
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return Math.floor(numeric);
        }
        const parsedDate = Date.parse(trimmed);
        if (Number.isNaN(parsedDate)) {
            throw new ProtocolError("Invalid request timestamp");
        }
        return parsedDate;
    }
    buildRequestSignatureMessage(method, path, timestampMs, body) {
        const normalizedBody = body === undefined ? "" : JSON.stringify(body);
        const bodyHash = SekuireCrypto.hash(normalizedBody);
        return `${method.toUpperCase()}\n${path}\n${timestampMs}\n${bodyHash}`;
    }
    /**
     * Handle the HELLO handshake message
     */
    async handleHello(hello) {
        try {
            // Validate client nonce
            if (!SekuireCrypto.isValidNonce(hello.clientNonce)) {
                throw new ProtocolError("Invalid client nonce format");
            }
            // Generate agent nonce
            const agentNonce = SekuireCrypto.generateNonce();
            this.purgeExpiredHandshakes();
            this.pendingHandshakes.set(hello.clientNonce, {
                agentNonce,
                createdAt: Date.now(),
            });
            // Sign the client nonce
            const signatureC = SekuireCrypto.sign(hello.clientNonce, this.keyPair.privateKey);
            // Return welcome message
            return {
                agentId: this.agentId,
                agentNonce,
                signatureC,
                agentPublicKey: this.keyPair.publicKey,
                credentials: [], // TODO: Add verifiable credentials support
            };
        }
        catch (error) {
            if (error instanceof ProtocolError || error instanceof CryptoError) {
                throw error;
            }
            throw new NetworkError(`Failed to handle HELLO: ${error.message}`, error);
        }
    }
    /**
     * Handle the AUTH handshake message
     */
    async handleAuth(auth, clientNonce) {
        try {
            if (!SekuireCrypto.isValidHex(auth.signatureA)) {
                throw new ProtocolError("Invalid signature format");
            }
            if (!SekuireCrypto.isValidNonce(clientNonce)) {
                throw new ProtocolError("Invalid client nonce format");
            }
            if (auth.clientNonce && auth.clientNonce !== clientNonce) {
                throw new ProtocolError("Client nonce mismatch");
            }
            if (!auth.clientPublicKey) {
                throw new ProtocolError("Missing client public key");
            }
            if (!SekuireCrypto.isValidPublicKey(auth.clientPublicKey)) {
                throw new ProtocolError("Invalid client public key format");
            }
            this.purgeExpiredHandshakes();
            const pending = this.pendingHandshakes.get(clientNonce);
            if (!pending) {
                throw new ProtocolError("Handshake not found or expired");
            }
            const verified = SekuireCrypto.verify(pending.agentNonce, auth.signatureA, auth.clientPublicKey);
            if (!verified) {
                throw new ProtocolError("Client signature verification failed");
            }
            this.pendingHandshakes.delete(clientNonce);
            this.purgeExpiredSessions();
            const sessionToken = SekuireCrypto.generateNonce();
            const now = Date.now();
            this.activeSessions.set(sessionToken, {
                clientPublicKey: auth.clientPublicKey,
                createdAt: now,
                lastSeenAt: now,
            });
            return {
                success: true,
                sessionToken,
                expiresInSeconds: Math.floor(SekuireServer.SESSION_TTL_MS / 1000),
            };
        }
        catch (error) {
            if (error instanceof ProtocolError || error instanceof CryptoError) {
                throw error;
            }
            throw new NetworkError(`Failed to handle AUTH: ${error.message}`, error);
        }
    }
    /**
     * Verify a signed request for protected application endpoints (for example /chat, /webhook).
     * Requires a valid handshake session token and Ed25519 signature by the authenticated client key.
     */
    async verifySignedRequest(input) {
        try {
            const sessionToken = this.firstHeaderValue(input.sessionToken);
            const signature = this.firstHeaderValue(input.signature);
            const timestampRaw = this.firstHeaderValue(input.timestamp);
            if (!sessionToken) {
                throw new ProtocolError("Missing session token");
            }
            if (!signature) {
                throw new ProtocolError("Missing request signature");
            }
            if (!timestampRaw) {
                throw new ProtocolError("Missing request timestamp");
            }
            if (!SekuireCrypto.isValidHex(signature)) {
                throw new ProtocolError("Invalid signature format");
            }
            const timestampMs = this.parseTimestamp(timestampRaw);
            const now = Date.now();
            if (Math.abs(now - timestampMs) > SekuireServer.REQUEST_CLOCK_SKEW_MS) {
                throw new ProtocolError("Request timestamp is outside allowed skew");
            }
            this.purgeExpiredSessions();
            const session = this.activeSessions.get(sessionToken);
            if (!session) {
                throw new ProtocolError("Invalid or expired session token");
            }
            const message = this.buildRequestSignatureMessage(input.method, input.path, timestampMs, input.body);
            const verified = SekuireCrypto.verify(message, signature, session.clientPublicKey);
            if (!verified) {
                throw new ProtocolError("Request signature verification failed");
            }
            session.lastSeenAt = now;
            this.activeSessions.set(sessionToken, session);
            return {
                sessionToken,
                clientPublicKey: session.clientPublicKey,
                timestampMs,
            };
        }
        catch (error) {
            if (error instanceof ProtocolError || error instanceof CryptoError) {
                throw error;
            }
            throw new NetworkError(`Failed to verify signed request: ${error.message}`, error);
        }
    }
    /**
     * Get the agent's public key
     */
    getPublicKey() {
        return this.keyPair.publicKey;
    }
    /**
     * Get the agent's ID
     */
    getAgentId() {
        return this.agentId;
    }
    /**
     * Handle incoming webhooks from other agents
     */
    async handleWebhook(payload, signature) {
        // In a real implementation, we would verify the signature
        // For now, we just pass the payload through to be handled by the implementation
        return { received: true };
    }
}
SekuireServer.HANDSHAKE_TTL_MS = 5 * 60 * 1000;
SekuireServer.SESSION_TTL_MS = 60 * 60 * 1000;
SekuireServer.REQUEST_CLOCK_SKEW_MS = 5 * 60 * 1000;
/**
 * Express.js middleware for Sekuire protocol
 */
function createSekuireExpressMiddleware(server) {
    const bodyParser = require("body-parser").json();
    return [
        bodyParser,
        async (req, res, next) => {
            try {
                if (req.path === "/sekuire/hello" && req.method === "POST") {
                    const result = await server.handleHello(req.body);
                    return res.json(result);
                }
                else if (req.path === "/sekuire/auth" && req.method === "POST") {
                    const nonceFromBody = req.body?.clientNonce;
                    const nonceFromHeader = req.headers["x-client-nonce"];
                    const rawNonce = nonceFromBody ?? nonceFromHeader;
                    const clientNonce = Array.isArray(rawNonce) ? rawNonce[0] : rawNonce;
                    if (!clientNonce) {
                        return res.status(400).json({ error: "Missing client nonce" });
                    }
                    const result = await server.handleAuth(req.body, clientNonce);
                    return res.json(result);
                }
                else if (req.path === "/sekuire/webhook" && req.method === "POST") {
                    const signature = req.headers["x-sekuire-signature"];
                    const result = await server.handleWebhook(req.body, signature);
                    return res.json(result);
                }
                next();
            }
            catch (error) {
                const statusCode = error instanceof ProtocolError ? 400 : 500;
                const message = error.message || "Internal server error";
                return res.status(statusCode).json({ error: message });
            }
        },
    ];
}
function normalizeRequestPath(path) {
    return path.split("?")[0] || path;
}
function isProtectedPath(path, protectedPaths) {
    const normalized = normalizeRequestPath(path);
    return protectedPaths.includes(normalized);
}
/**
 * Express middleware that enforces signed-request authentication for protected paths.
 * Defaults to protecting POST /chat and POST /webhook.
 */
function createSekuireExpressRequestAuthMiddleware(server, options) {
    const protectedPaths = options?.protectedPaths ?? ["/chat", "/webhook"];
    return async (req, res, next) => {
        if (req.method !== "POST" ||
            !isProtectedPath(req.path || req.url || "", protectedPaths)) {
            return next();
        }
        try {
            await server.verifySignedRequest({
                method: req.method,
                path: req.path || req.url,
                body: req.body,
                sessionToken: req.headers["x-sekuire-session"],
                timestamp: req.headers["x-sekuire-timestamp"],
                signature: req.headers["x-sekuire-signature"],
            });
            return next();
        }
        catch (error) {
            return res.status(401).json({ error: error.message });
        }
    };
}
/**
 * Fastify plugin for Sekuire protocol
 */
function createSekuireFastifyPlugin(server) {
    return async (fastify, options) => {
        fastify.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
            try {
                done(null, JSON.parse(body));
            }
            catch (err) {
                done(err);
            }
        });
        fastify.post("/sekuire/hello", async (request, reply) => {
            try {
                const result = await server.handleHello(request.body);
                // Store client nonce for auth step (in real implementation, use session)
                reply.header("x-client-nonce", request.body.clientNonce);
                return result;
            }
            catch (error) {
                const statusCode = error instanceof ProtocolError ? 400 : 500;
                reply.code(statusCode);
                return { error: error.message };
            }
        });
        fastify.post("/sekuire/auth", async (request, reply) => {
            try {
                const nonceFromBody = request.body?.clientNonce;
                const nonceFromHeader = request.headers["x-client-nonce"];
                const rawNonce = nonceFromBody ?? nonceFromHeader;
                const clientNonce = Array.isArray(rawNonce) ? rawNonce[0] : rawNonce;
                if (!clientNonce) {
                    reply.code(400);
                    return { error: "Missing client nonce" };
                }
                const result = await server.handleAuth(request.body, clientNonce);
                return result;
            }
            catch (error) {
                const statusCode = error instanceof ProtocolError ? 400 : 500;
                reply.code(statusCode);
                return { error: error.message };
            }
        });
        fastify.post("/sekuire/webhook", async (request, reply) => {
            try {
                const signature = request.headers["x-sekuire-signature"];
                const result = await server.handleWebhook(request.body, signature);
                return result;
            }
            catch (error) {
                reply.code(500);
                return { error: error.message };
            }
        });
    };
}
/**
 * Fastify preHandler that enforces signed-request authentication for protected paths.
 * Defaults to protecting POST /chat and POST /webhook.
 */
function createSekuireFastifyRequestAuthHook(server, options) {
    const protectedPaths = options?.protectedPaths ?? ["/chat", "/webhook"];
    return async (request, reply) => {
        if (request.method !== "POST" ||
            !isProtectedPath(request.url || "", protectedPaths)) {
            return;
        }
        try {
            await server.verifySignedRequest({
                method: request.method,
                path: normalizeRequestPath(request.url || ""),
                body: request.body,
                sessionToken: request.headers["x-sekuire-session"],
                timestamp: request.headers["x-sekuire-timestamp"],
                signature: request.headers["x-sekuire-signature"],
            });
        }
        catch (error) {
            reply.code(401);
            reply.send({ error: error.message });
            return;
        }
    };
}

/**
 * Create a tool for discovering other agents in the Sekuire network
 */
function createDiscoveryTool(client) {
    return {
        name: 'discover_agents',
        description: "Search for other AI agents in the Sekuire network by capability or name. Use this to find agents that can help with specific tasks (e.g., 'jira', 'google drive').",
        schema: zod.z.object({
            query: zod.z.string().describe("The search query (e.g., 'jira', 'drive', 'github')"),
        }),
        execute: async ({ query }) => {
            try {
                const agents = await client.searchAgents(query);
                if (agents.length === 0) {
                    return `No agents found matching '${query}'.`;
                }
                return agents.map((a) => ({
                    name: a.name,
                    id: a.sekuireId,
                    description: a.description,
                    status: a.verificationStatus,
                }));
            }
            catch (error) {
                return `Error searching for agents: ${error.message}`;
            }
        },
    };
}
/**
 * Create a tool for delegating tasks to other agents
 */
function createDelegationTool(client) {
    return {
        name: 'delegate_task',
        description: "Delegate a task to another agent. Requires the target agent's Sekuire ID (found via discover_agents).",
        schema: zod.z.object({
            agent_id: zod.z.string().describe('The Sekuire ID of the target agent'),
            task: zod.z.string().describe('The task description or message to send to the agent'),
            context: zod.z.record(zod.z.any()).optional().describe('Optional context data to pass'),
        }),
        execute: async ({ agent_id, task, context }) => {
            try {
                // 1. Get Agent Info
                const agentInfo = await client.getAgentInfo(agent_id);
                // 2. Perform Handshake & Auth (Simulated for this phase as we don't have dynamic URLs yet)
                // In a real scenario:
                // const handshake = await client.connect(agentInfo.url);
                // 3. Send Task
                // const result = await client.sendTask(handshake.session, { task, context });
                // For the demo/prototype phase without dynamic routing:
                // We simulate the success message. The actual inter-process communication
                // would happen here via HTTP/WebSocket.
                return {
                    status: 'success',
                    message: `Task successfully delegated to ${agentInfo.name || agent_id}`,
                    details: {
                        recipient: agent_id,
                        task_summary: task.substring(0, 50) + '...',
                    },
                };
            }
            catch (error) {
                return `Error delegating task to agent ${agent_id}: ${error.message}`;
            }
        },
    };
}

/**
 * Generate a new Ed25519 keypair for Sekuire operations
 */
function generateKeyPair() {
    return SekuireCrypto.generateKeyPair();
}
/**
 * Calculate Sekuire ID from agent configuration (canonical V2 algorithm).
 *
 * projectName and projectVersion are accepted for backwards compatibility
 * but are NOT used in the ID computation.
 */
function calculateSekuireId(params) {
    return SekuireCrypto.calculateSekuireId(params);
}
/**
 * @deprecated Use calculateSekuireId (V2) instead.
 */
function calculateSekuireIdLegacy(params) {
    return SekuireCrypto.calculateSekuireIdLegacy(params);
}
/**
 * Create a SekuireClient with sensible defaults
 */
function createSekuireClient(keyPair, registryUrl, options) {
    const config = {
        registryUrl: registryUrl || "https://registry.sekuire.ai",
        timeout: 30000,
        retries: 3,
        ...options,
    };
    return new SekuireClient(keyPair, config);
}

/**
 * A2A Protocol Server
 *
 * Server implementation for creating A2A-compliant agents with streaming support.
 */
class A2AServer {
    constructor(options) {
        this.tasks = new Map();
        this.card = options.card;
        this.identity = options.identity;
        this.handlers = options.handlers;
        this.streamingHandlers = options.streamingHandlers || {};
    }
    /**
     * Start sending heartbeats to the registry
     * @param publicUrl The public URL where this agent is reachable
     * @param registryUrl The registry API base URL (default: http://localhost:3000)
     */
    async startHeartbeat(publicUrl, registryUrl = "http://localhost:3000") {
        if (!this.identity) {
            console.warn("Cannot start heartbeat: No AgentIdentity provided");
            return;
        }
        const sendHeartbeat = async () => {
            try {
                const timestamp = new Date().toISOString();
                const payload = {
                    sekuire_id: this.identity.sekuireId,
                    endpoint: {
                        url: publicUrl,
                        protocol: "http",
                    },
                    status: "online",
                    timestamp,
                };
                // Create signature: sekuire_id + url + timestamp
                const message = `${payload.sekuire_id}${publicUrl}${timestamp}`;
                // Note: AgentIdentity.sign needs to support byte arrays or string input for real Ed25519
                // Currently it mocks it.
                const signature = await this.identity.sign(message);
                await fetch(`${registryUrl}/api/v1/agents/heartbeat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...payload,
                        signature,
                    }),
                });
            }
            catch (err) {
                console.error("Heartbeat failed:", err);
            }
        };
        // Send immediately
        void sendHeartbeat();
        // Then every 60s
        this.heartbeatInterval = setInterval(sendHeartbeat, 60000);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
    }
    getAgentCard() {
        return this.card;
    }
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
    async handleRequest(request) {
        if (request.jsonrpc !== "2.0") {
            return this.error(request.id, -32600, "Invalid JSON-RPC version");
        }
        try {
            switch (request.method) {
                case "tasks/send":
                    return this.handleTasksSend(request);
                case "tasks/get":
                    return this.handleTasksGet(request);
                case "tasks/cancel":
                    return this.handleTasksCancel(request);
                case "tasks/sendSubscribe":
                    return this.error(request.id, -32601, "Use handleStreamingRequest for tasks/sendSubscribe");
                default:
                    return this.error(request.id, -32601, `Method not found: ${request.method}`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            return this.error(request.id, -32603, message);
        }
    }
    async *handleStreamingRequest(request) {
        if (request.method !== "tasks/sendSubscribe") {
            throw new Error("Only tasks/sendSubscribe supports streaming");
        }
        const params = request.params;
        if (!params?.message) {
            throw new Error("Missing message parameter");
        }
        const taskId = params.taskId || this.generateId();
        let task = this.tasks.get(taskId);
        if (!task) {
            task = {
                id: taskId,
                contextId: undefined,
                status: "submitted",
                history: [],
                artifacts: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                subscribers: new Set(),
            };
            this.tasks.set(taskId, task);
        }
        task.history.push(params.message);
        task.status = "working";
        task.updatedAt = new Date();
        yield this.createUpdateEvent(task);
        const streamingHandler = this.findStreamingHandler(params.message);
        const regularHandler = this.findHandler(params.message);
        if (streamingHandler) {
            const context = {
                taskId,
                history: task.history,
                emit: () => { },
            };
            try {
                for await (const update of streamingHandler(params.message, context)) {
                    task.updatedAt = new Date();
                    switch (update.type) {
                        case "progress":
                            yield {
                                taskId,
                                status: "working",
                                updatedAt: task.updatedAt.toISOString(),
                                message: {
                                    role: "agent",
                                    parts: [{ type: "text", text: update.message }],
                                },
                            };
                            break;
                        case "artifact":
                            task.artifacts.push(update.artifact);
                            yield {
                                taskId,
                                status: "working",
                                updatedAt: task.updatedAt.toISOString(),
                                artifacts: [update.artifact],
                            };
                            break;
                        case "message":
                            task.history.push(update.message);
                            yield {
                                taskId,
                                status: "working",
                                updatedAt: task.updatedAt.toISOString(),
                                message: update.message,
                            };
                            break;
                        case "status":
                            task.status = update.status;
                            yield this.createUpdateEvent(task);
                            break;
                    }
                }
                if (task.status === "working") {
                    task.status = "completed";
                }
            }
            catch (err) {
                task.status = "failed";
                const errorMessage = err instanceof Error ? err.message : "Handler failed";
                task.history.push({
                    role: "agent",
                    parts: [{ type: "text", text: `Error: ${errorMessage}` }],
                });
            }
        }
        else if (regularHandler) {
            try {
                const result = await regularHandler(params.message, {
                    taskId,
                    history: task.history,
                });
                if (Array.isArray(result)) {
                    task.artifacts = result;
                }
                else {
                    task.history.push(result);
                }
                task.status = "completed";
            }
            catch (err) {
                task.status = "failed";
                const errorMessage = err instanceof Error ? err.message : "Handler failed";
                task.history.push({
                    role: "agent",
                    parts: [{ type: "text", text: `Error: ${errorMessage}` }],
                });
            }
        }
        else {
            task.status = "failed";
            task.history.push({
                role: "agent",
                parts: [{ type: "text", text: "No handler found for this request" }],
            });
        }
        task.updatedAt = new Date();
        yield this.createUpdateEvent(task);
    }
    subscribeToTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return null;
        const self = this;
        return (async function* () {
            yield self.createUpdateEvent(task);
            if (["completed", "failed", "canceled"].includes(task.status)) {
                return;
            }
            const queue = [];
            let resolve = null;
            const subscriber = (event) => {
                queue.push(event);
                if (resolve) {
                    resolve();
                    resolve = null;
                }
            };
            task.subscribers.add(subscriber);
            try {
                while (true) {
                    while (queue.length > 0) {
                        const event = queue.shift();
                        yield event;
                        if (["completed", "failed", "canceled"].includes(event.status)) {
                            return;
                        }
                    }
                    await new Promise((r) => {
                        resolve = r;
                    });
                }
            }
            finally {
                task.subscribers.delete(subscriber);
            }
        })();
    }
    formatSSE(event) {
        return `event: task_update\ndata: ${JSON.stringify(event)}\n\n`;
    }
    notifySubscribers(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return;
        const event = this.createUpdateEvent(task);
        for (const subscriber of task.subscribers) {
            subscriber(event);
        }
    }
    async handleTasksSend(request) {
        const params = request.params;
        if (!params?.message) {
            return this.error(request.id, -32602, "Missing message parameter");
        }
        const taskId = params.taskId || this.generateId();
        let task = this.tasks.get(taskId);
        if (!task) {
            task = {
                id: taskId,
                contextId: params.contextId,
                status: "submitted",
                history: [],
                artifacts: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                subscribers: new Set(),
            };
            this.tasks.set(taskId, task);
        }
        task.history.push(params.message);
        task.status = "working";
        task.updatedAt = new Date();
        this.notifySubscribers(taskId);
        const handler = this.findHandler(params.message);
        if (handler) {
            try {
                const result = await handler(params.message, {
                    taskId,
                    contextId: params.contextId,
                    history: task.history,
                });
                if (Array.isArray(result)) {
                    task.artifacts = result;
                }
                else {
                    task.history.push(result);
                }
                task.status = "completed";
            }
            catch (err) {
                task.status = "failed";
                const errorMessage = err instanceof Error ? err.message : "Handler failed";
                task.history.push({
                    role: "agent",
                    parts: [{ type: "text", text: `Error: ${errorMessage}` }],
                });
            }
        }
        else {
            task.status = "failed";
            task.history.push({
                role: "agent",
                parts: [{ type: "text", text: "No handler found for this request" }],
            });
        }
        task.updatedAt = new Date();
        this.notifySubscribers(taskId);
        return this.success(request.id, this.taskToResponse(task));
    }
    handleTasksGet(request) {
        const params = request.params;
        if (!params?.taskId) {
            return this.error(request.id, -32602, "Missing taskId parameter");
        }
        const task = this.tasks.get(params.taskId);
        if (!task) {
            return this.error(request.id, -32001, "Task not found");
        }
        return this.success(request.id, this.taskToResponse(task));
    }
    handleTasksCancel(request) {
        const params = request.params;
        if (!params?.taskId) {
            return this.error(request.id, -32602, "Missing taskId parameter");
        }
        const task = this.tasks.get(params.taskId);
        if (!task) {
            return this.error(request.id, -32001, "Task not found");
        }
        if (["completed", "failed", "canceled"].includes(task.status)) {
            return this.error(request.id, -32001, "Task already completed");
        }
        task.status = "canceled";
        task.updatedAt = new Date();
        this.notifySubscribers(task.id);
        return this.success(request.id, this.taskToResponse(task));
    }
    findHandler(message) {
        return this.findHandlerInMap(this.handlers, message);
    }
    findStreamingHandler(message) {
        return this.findHandlerInMap(this.streamingHandlers, message);
    }
    findHandlerInMap(map, message) {
        const text = this.extractText(message);
        for (const skill of this.card.skills) {
            if (map[skill.id]) {
                if (text.toLowerCase().includes(skill.id.split(":")[1] || skill.id)) {
                    return map[skill.id];
                }
            }
        }
        for (const skill of this.card.skills) {
            if (map[skill.id]) {
                return map[skill.id];
            }
        }
        const handlerIds = Object.keys(map);
        if (handlerIds.length > 0) {
            return map[handlerIds[0]];
        }
        return undefined;
    }
    extractText(message) {
        return message.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(" ");
    }
    createUpdateEvent(task) {
        return {
            taskId: task.id,
            status: task.status,
            updatedAt: task.updatedAt.toISOString(),
            message: task.history[task.history.length - 1],
            artifacts: task.artifacts.length > 0 ? task.artifacts : undefined,
        };
    }
    taskToResponse(task) {
        return {
            taskId: task.id,
            contextId: task.contextId,
            status: {
                state: task.status,
                timestamp: task.updatedAt.toISOString(),
            },
            artifacts: task.artifacts,
            history: task.history,
        };
    }
    success(id, result) {
        return { jsonrpc: "2.0", id, result };
    }
    error(id, code, message) {
        return { jsonrpc: "2.0", id, error: { code, message } };
    }
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}

exports.A2AClient = A2AClient;
exports.A2AError = A2AError;
exports.A2AServer = A2AServer;
exports.A2ATaskDelegator = A2ATaskDelegator;
exports.Agent = SekuireAgent;
exports.AgentIdentity = AgentIdentity;
exports.AnthropicProvider = AnthropicProvider;
exports.BaseMemoryStorage = BaseMemoryStorage;
exports.Beacon = Beacon;
exports.CONVEX_FUNCTIONS_TEMPLATE = CONVEX_FUNCTIONS_TEMPLATE;
exports.CONVEX_SCHEMA_TEMPLATE = CONVEX_SCHEMA_TEMPLATE;
exports.CloudflareD1Storage = CloudflareD1Storage;
exports.CloudflareKVStorage = CloudflareKVStorage;
exports.ComplianceError = ComplianceError;
exports.ComplianceMonitor = ComplianceMonitor;
exports.ContentPolicyError = ContentPolicyError;
exports.ConvexStorage = ConvexStorage;
exports.CryptoError = CryptoError;
exports.DEFAULT_API_URL = DEFAULT_API_URL;
exports.DynamoDBStorage = DynamoDBStorage;
exports.FileAccessError = FileAccessError;
exports.GoogleProvider = GoogleProvider;
exports.InMemoryStorage = InMemoryStorage;
exports.NetworkComplianceError = NetworkComplianceError;
exports.NetworkError = NetworkError;
exports.OllamaProvider = OllamaProvider;
exports.OpenAIProvider = OpenAIProvider;
exports.PolicyClient = PolicyClient;
exports.PolicyEnforcer = PolicyEnforcer;
exports.PolicyGateway = PolicyGateway;
exports.PolicyViolationError = PolicyViolationError;
exports.PostgresStorage = PostgresStorage;
exports.ProtocolError = ProtocolError;
exports.RedisStorage = RedisStorage;
exports.RuntimeCredentialsStore = RuntimeCredentialsStore;
exports.SQLiteStorage = SQLiteStorage;
exports.SekuireAgent = SekuireAgent$1;
exports.SekuireAgentBuilder = SekuireAgentBuilder;
exports.SekuireClient = SekuireClient;
exports.SekuireCrypto = SekuireCrypto;
exports.SekuireError = SekuireError;
exports.SekuireLogger = SekuireLogger;
exports.SekuireRegistryClient = SekuireRegistryClient;
exports.SekuireSDK = SekuireSDK;
exports.SekuireServer = SekuireServer;
exports.SekuireSpanExporter = SekuireSpanExporter;
exports.TaskWorker = TaskWorker;
exports.ToolPatternParser = ToolPatternParser;
exports.ToolRegistry = ToolRegistry;
exports.ToolUsageError = ToolUsageError;
exports.TursoStorage = TursoStorage;
exports.UpstashStorage = UpstashStorage;
exports.applyBootstrapResponse = applyBootstrapResponse;
exports.builtInTools = builtInTools;
exports.calculateSekuireId = calculateSekuireId;
exports.calculateSekuireIdLegacy = calculateSekuireIdLegacy;
exports.createAgent = createAgent;
exports.createBeacon = createBeacon;
exports.createDefaultToolRegistry = createDefaultToolRegistry;
exports.createDelegationTool = createDelegationTool;
exports.createDelegator = createDelegator;
exports.createDiscoveryTool = createDiscoveryTool;
exports.createLLMProvider = createLLMProvider;
exports.createMemoryStorage = createMemoryStorage;
exports.createRegistryClient = createRegistryClient;
exports.createSekuireClient = createSekuireClient;
exports.createSekuireExpressMiddleware = createSekuireExpressMiddleware;
exports.createSekuireExpressRequestAuthMiddleware = createSekuireExpressRequestAuthMiddleware;
exports.createSekuireFastifyPlugin = createSekuireFastifyPlugin;
exports.createSekuireFastifyRequestAuthHook = createSekuireFastifyRequestAuthHook;
exports.createWorker = createWorker;
exports.detectDeploymentUrl = detectDeploymentUrl;
exports.generateKeyPair = generateKeyPair;
exports.getAgent = getAgent;
exports.getAgentConfig = getAgentConfig;
exports.getAgents = getAgents;
exports.getLegacyTools = getTools$1;
exports.getStorageInfo = getStorageInfo;
exports.getSystemPrompt = getSystemPrompt;
exports.getTools = getTools;
exports.getTracer = getTracer;
exports.hasStorage = hasStorage;
exports.initTelemetry = initTelemetry;
exports.listStorageTypes = listStorageTypes;
exports.llm = llm;
exports.loadConfig = loadConfig;
exports.loadSystemPrompt = loadSystemPrompt;
exports.loadTools = loadTools;
exports.registerStorage = registerStorage;
exports.shutdownTelemetry = shutdownTelemetry;
exports.tool = tool;
exports.tools = tools;
