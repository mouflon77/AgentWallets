import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Turnkey } from "@turnkey/sdk-server";
import { generateP256KeyPair } from "@turnkey/crypto";

/** Turnkey credentials stored in GCP Secret Manager. */
export interface TurnkeySecrets {
  apiPublicKey: string;
  apiPrivateKey: string;
  /** Parent org used to create sub-organizations. */
  organizationId: string;
}

/** Secret resource IDs inside GCP Secret Manager (not full paths). */
export interface GcpSecretNames {
  apiPublicKey: string;
  apiPrivateKey: string;
  organizationId: string;
}

/** Sensible defaults — override via config or env. */
export const DEFAULT_GCP_SECRET_NAMES: GcpSecretNames = {
  apiPublicKey: "turnkey-api-public-key",
  apiPrivateKey: "turnkey-api-private-key",
  organizationId: "turnkey-organization-id",
};

export interface GcpAgentConfig {
  projectId: string;
  secretNames?: Partial<GcpSecretNames>;
}

export interface AgentKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * GCP Secret Manager integration for the Agent identity.
 *
 * Authenticates via Application Default Credentials (ADC):
 *   • Local dev  → `gcloud auth application-default login`
 *   • Cloud Run  → attached service account (automatic)
 *   • Vercel     → `GCP_SERVICE_ACCOUNT_JSON` env var (full service account JSON)
 *
 * Never reads Turnkey keys from `.env` at runtime — only from Secret Manager.
 */
function createSecretManagerClient(): SecretManagerServiceClient {
  const json = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (json) {
    return new SecretManagerServiceClient({
      credentials: JSON.parse(json) as Record<string, unknown>,
    });
  }

  return new SecretManagerServiceClient();
}

/**
 * GCP Secret Manager integration for the Agent identity.
 */
export class GcpAgent {
  private readonly secretClient: SecretManagerServiceClient;
  private readonly secretNames: GcpSecretNames;

  constructor(private readonly config: GcpAgentConfig) {
    this.secretClient = createSecretManagerClient();
    this.secretNames = {
      ...DEFAULT_GCP_SECRET_NAMES,
      ...config.secretNames,
    };
  }

  /** Build config from environment variables. */
  static fromEnv(overrides?: Partial<GcpAgentConfig>): GcpAgent {
    const projectId = overrides?.projectId ?? process.env.GCP_PROJECT_ID;

    if (!projectId) {
      throw new Error(
        "GCP_PROJECT_ID is required. Set it in the environment or pass projectId explicitly.",
      );
    }

    return new GcpAgent({
      projectId,
      secretNames: {
        apiPublicKey:
          process.env.GCP_SECRET_TURNKEY_API_PUBLIC_KEY ??
          DEFAULT_GCP_SECRET_NAMES.apiPublicKey,
        apiPrivateKey:
          process.env.GCP_SECRET_TURNKEY_API_PRIVATE_KEY ??
          DEFAULT_GCP_SECRET_NAMES.apiPrivateKey,
        organizationId:
          process.env.GCP_SECRET_TURNKEY_ORG_ID ??
          DEFAULT_GCP_SECRET_NAMES.organizationId,
      },
      ...overrides,
    });
  }

  /** Verify ADC + Secret Manager access before running the agent. */
  async verifyAccess(): Promise<void> {
    await this.secretClient.listSecrets({
      parent: `projects/${this.config.projectId}`,
      pageSize: 1,
    });
  }

  private secretPath(secretId: string): string {
    return `projects/${this.config.projectId}/secrets/${secretId}`;
  }

  private secretVersionPath(secretId: string, version = "latest"): string {
    return `${this.secretPath(secretId)}/versions/${version}`;
  }

  /** Fetch a single secret value as UTF-8 text. */
  async readSecret(secretId: string): Promise<string> {
    const [version] = await this.secretClient.accessSecretVersion({
      name: this.secretVersionPath(secretId),
    });

    const payload = version.payload?.data;
    if (!payload) {
      throw new Error(`Secret "${secretId}" is empty or missing.`);
    }

    return payload.toString();
  }

  /** Create the secret container if it does not exist yet. */
  async ensureSecretExists(secretId: string): Promise<void> {
    try {
      await this.secretClient.getSecret({
        name: this.secretPath(secretId),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("NOT_FOUND") && !message.includes("Not found")) {
        throw error;
      }

      await this.secretClient.createSecret({
        parent: `projects/${this.config.projectId}`,
        secretId,
        secret: {
          replication: { automatic: {} },
          labels: {
            managed_by: "agentwallets",
            purpose: "turnkey-credentials",
          },
        },
      });
    }
  }

  /** Write a new secret version (append-only in Secret Manager). */
  async writeSecret(secretId: string, value: string): Promise<void> {
    await this.ensureSecretExists(secretId);

    await this.secretClient.addSecretVersion({
      parent: this.secretPath(secretId),
      payload: { data: Buffer.from(value, "utf8") },
    });
  }

  /**
   * One-time bootstrap: upload Turnkey parent-org credentials into Secret Manager.
   * Run locally once, then delete the values from your shell history / .env.
   */
  async bootstrapTurnkeySecrets(secrets: TurnkeySecrets): Promise<void> {
    const { secretNames } = this;

    await Promise.all([
      this.writeSecret(secretNames.apiPublicKey, secrets.apiPublicKey),
      this.writeSecret(secretNames.apiPrivateKey, secrets.apiPrivateKey),
      this.writeSecret(secretNames.organizationId, secrets.organizationId),
    ]);
  }

  /** Load parent-org Turnkey credentials from Secret Manager. */
  async loadTurnkeySecrets(): Promise<TurnkeySecrets> {
    const { secretNames } = this;

    const [apiPublicKey, apiPrivateKey, organizationId] = await Promise.all([
      this.readSecret(secretNames.apiPublicKey),
      this.readSecret(secretNames.apiPrivateKey),
      this.readSecret(secretNames.organizationId),
    ]);

    return { apiPublicKey, apiPrivateKey, organizationId };
  }

  /** Turnkey client for the parent organization (creates sub-orgs). */
  createParentClient(secrets: TurnkeySecrets): Turnkey {
    return new Turnkey({
      apiBaseUrl: process.env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com",
      apiPublicKey: secrets.apiPublicKey,
      apiPrivateKey: secrets.apiPrivateKey,
      defaultOrganizationId: secrets.organizationId,
    });
  }

  /**
   * Turnkey client scoped to a wallet sub-org using the agent's API key.
   * This is the key that auto-signs small transactions.
   */
  createSubOrgAgentClient(
    subOrganizationId: string,
    agentApiPublicKey: string,
    agentApiPrivateKey: string,
  ): Turnkey {
    return new Turnkey({
      apiBaseUrl: process.env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com",
      apiPublicKey: agentApiPublicKey,
      apiPrivateKey: agentApiPrivateKey,
      defaultOrganizationId: subOrganizationId,
    });
  }

  /** Generate a fresh P-256 API key pair for a new wallet agent. */
  generateAgentKeyPair(): AgentKeyPair {
    const pair = generateP256KeyPair();
    return { publicKey: pair.publicKey, privateKey: pair.privateKey };
  }

  /** Load JSON payload from a secret. */
  async loadJsonSecret<T>(secretId: string): Promise<T> {
    const raw = await this.readSecret(secretId);
    return JSON.parse(raw) as T;
  }

  /** Store JSON payload as a new secret version. */
  async storeJsonSecret(secretId: string, data: unknown): Promise<void> {
    await this.writeSecret(secretId, JSON.stringify(data));
  }

  /** Persist per-wallet agent keys (JSON) in Secret Manager. */
  async storeAgentKeys(secretId: string, keys: AgentKeyPair): Promise<void> {
    await this.writeSecret(secretId, JSON.stringify(keys));
  }

  /** Load per-wallet agent keys previously stored by `storeAgentKeys`. */
  async loadAgentKeys(secretId: string): Promise<AgentKeyPair> {
    const raw = await this.readSecret(secretId);
    const parsed = JSON.parse(raw) as AgentKeyPair;

    if (!parsed.publicKey || !parsed.privateKey) {
      throw new Error(`Secret "${secretId}" is not a valid agent key pair.`);
    }

    return parsed;
  }
}
