export interface RuntimeCredentials {
  installationId?: string;
  runtimeToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface BootstrapResponseData {
  installation_id: string;
  runtime_token: string;
  refresh_token?: string;
  expires_at: string;
}

export interface BootstrapTarget {
  installationId: string | null;
  runtimeToken: string | null;
  refreshToken: string | null;
  credentialsStore?: RuntimeCredentialsStore | null;
}

export function applyBootstrapResponse(
  target: BootstrapTarget,
  data: BootstrapResponseData
): void {
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

export class RuntimeCredentialsStore {
  private installationId?: string;
  private runtimeToken?: string;
  private refreshToken?: string;
  private expiresAt?: string;
  private apiBaseUrl?: string;
  private inflightRefresh: Promise<void> | null = null;

  constructor(initial?: RuntimeCredentials & { apiBaseUrl?: string }) {
    if (initial) {
      this.update(initial);
    }
    if (initial?.apiBaseUrl) {
      this.apiBaseUrl = initial.apiBaseUrl;
    }
  }

  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url;
  }

  update(partial: RuntimeCredentials): void {
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

  setRuntimeToken(runtimeToken: string, expiresAt?: string): void {
    this.runtimeToken = runtimeToken;
    if (expiresAt !== undefined) {
      this.expiresAt = expiresAt;
    }
  }

  setInstallationId(installationId: string): void {
    this.installationId = installationId;
  }

  setRefreshToken(refreshToken: string): void {
    this.refreshToken = refreshToken;
  }

  getInstallationId(): string | undefined {
    return this.installationId;
  }

  getRuntimeToken(): string | undefined {
    return this.runtimeToken;
  }

  getRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  getExpiresAt(): string | undefined {
    return this.expiresAt;
  }

  getAll(): RuntimeCredentials {
    return {
      installationId: this.installationId,
      runtimeToken: this.runtimeToken,
      refreshToken: this.refreshToken,
      expiresAt: this.expiresAt,
    };
  }

  hasRecoveryCredentials(): boolean {
    return !!(this.installationId && this.refreshToken);
  }

  hasRuntimeToken(): boolean {
    return !!this.runtimeToken;
  }

  async refreshRuntimeToken(caller?: string): Promise<void> {
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }

    this.inflightRefresh = this.doRefresh(caller).finally(() => {
      this.inflightRefresh = null;
    });

    return this.inflightRefresh;
  }

  private async doRefresh(caller?: string): Promise<void> {
    const installationId = this.installationId;
    const refreshToken = this.refreshToken;
    const apiBaseUrl = this.apiBaseUrl;

    if (!installationId || !refreshToken) {
      throw new Error("Cannot refresh token - missing installation ID or refresh token");
    }
    if (!apiBaseUrl) {
      throw new Error("Cannot refresh token - missing API base URL");
    }

    const response = await fetch(
      `${apiBaseUrl}/api/v1/installations/${installationId}/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );

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
