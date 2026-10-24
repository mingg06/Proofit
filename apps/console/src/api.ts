import { z } from "zod";
import {
  sessionSchema,
  requestSchema,
  resourceSchema,
  caseSchema,
  validationViewSchema,
  replaySchema,
  operationViewSchema,
} from "../../../packages/contracts/console.ts";
import type { Action } from "../../../packages/contracts/index.ts";
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
class ApiClient {
  private csrf: string | null = null;
  private generation = 0;
  clear() {
    this.csrf = null;
    this.generation++;
  }
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const generation = this.generation;
    const response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(signal ? { signal } : {}),
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" && this.csrf ? { "X-CSRF-Token": this.csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data: unknown = await response.json();
    if (signal?.aborted || generation !== this.generation)
      throw new DOMException("Account changed", "AbortError");
    if (!response.ok) {
      if (response.status === 401) {
        this.clear();
        window.dispatchEvent(new Event("proofit:session-ended"));
      }
      const parsed = z.object({ error: z.string() }).safeParse(data);
      throw new ApiError(
        response.status,
        parsed.success
          ? parsed.data.error
          : "The request could not be completed.",
      );
    }
    return data;
  }
  async session() {
    const session = sessionSchema.parse(await this.request("/session"));
    this.csrf = session.csrfToken;
    return session.actor;
  }
  async login(email: string, password: string) {
    this.clear();
    const result = z
      .object({ csrfToken: z.string() })
      .parse(await this.request("/login", "POST", { email, password }));
    this.csrf = result.csrfToken;
    return this.session();
  }
  async logout() {
    await this.request("/logout", "POST", {});
    this.clear();
  }
  async requests(signal?: AbortSignal) {
    return z
      .array(requestSchema)
      .parse(await this.request("/requests", "GET", undefined, signal));
  }
  async resources(signal?: AbortSignal) {
    return z
      .array(resourceSchema)
      .parse(await this.request("/resources", "GET", undefined, signal));
  }
  async case(id: string, version: number, signal?: AbortSignal) {
    return caseSchema.parse(
      await this.request(
        "/requests/" + encodeURIComponent(id) + "?version=" + version,
        "GET",
        undefined,
        signal,
      ),
    );
  }
  async create(text: string) {
    return requestSchema.parse(
      await this.request("/requests", "POST", { text }),
    );
  }
  async amend(id: string, version: number, text: string) {
    return requestSchema.parse(
      await this.request(
        "/requests/" + encodeURIComponent(id) + "/versions",
        "POST",
        { text, version },
      ),
    );
  }
  confirm(requestId: string, requestVersion: number, action: Action) {
    return this.request("/confirm", "POST", {
      requestId,
      requestVersion,
      action,
    });
  }
  propose(
    requestId: string,
    requestVersion: number,
    proposal: Action,
    conversation: string,
  ) {
    return this.request("/proposals", "POST", {
      requestId,
      requestVersion,
      proposal,
      conversation,
    });
  }
  approve(receiptId: string) {
    return this.request("/approvals", "POST", { receiptId });
  }
  async validate(proposalId: string) {
    return validationViewSchema.parse(
      await this.request("/validations", "POST", { proposalId }),
    );
  }
  investigate(proposalId: string) {
    return this.request("/investigations", "POST", { proposalId });
  }
  async replay(id: string, signal?: AbortSignal) {
    return replaySchema.parse(
      await this.request(
        "/investigations/" + encodeURIComponent(id),
        "GET",
        undefined,
        signal,
      ),
    );
  }
  async operation(id: string, signal?: AbortSignal) {
    return operationViewSchema.parse(
      await this.request(
        "/operations/" + encodeURIComponent(id),
        "GET",
        undefined,
        signal,
      ),
    );
  }
}
export const api = new ApiClient();
export function errorText(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error && error.name === "AbortError"
      ? "The request was canceled."
      : "Unable to load the response. Check the connection and try again.";
}
