# Project: Secure Solana Agent Signer (MPC 2-of-3)

## Objective
To eliminate the use of raw private keys in AI agent `.env` files by using a distributed custody model.

## Repo layout
```
src/core/     SafeAgentSigner, TurnkeyAgentSigner, recovery share
src/agent/    AgentEngine — LLM tool calling
src/cli/      setup, QR, gcp:bootstrap
portal/       Next.js mobile approval app
plugins/      ElizaOS turnkey provider (copy-paste)
character.json  Sample ElizaOS character (no private keys)
```

## The 3-Part Split
1. **The Agent (GCP):** Authenticates via Google Cloud Service Account. Holds the Turnkey API Key in Secret Manager. Used for automated, low-value signing.
2. **The User (Phone/Mobile):** Authenticates via WebAuthn (Passkeys). Used for high-value approvals and wallet recovery.
3. **The Enclave (Turnkey):** The MPC provider that holds the key material in an AWS Nitro Enclave. It only signs if the defined Policy (GCP or GCP+Phone) is met.

## Tech Stack
- **MPC/Enclave:** Turnkey (@turnkey/sdk-server, @turnkey/solana)
- **Identity:** Google Cloud Secret Manager (@google-cloud/secret-manager)
- **Blockchain:** Solana (@solana/web3.js)
- **User Auth:** WebAuthn / Passkeys
- **Frontend:** Next.js approval portal (`portal/`)
- **LLM integration:** `AgentEngine` in `src/agent/` — tool calling → `SafeAgentSigner`

## Key Workflows
- **Initialization (`npm run setup`):**
  1. CLI creates a Turnkey **sub-org** for this agent
  2. CLI generates a **Solana wallet** inside the sub-org
  3. CLI prints a **recovery mnemonic** (write down — shown once)
  4. CLI prints the **Agent Public Key** (fund with SOL)
  5. CLI prints a **QR code** → user scans on phone → Passkey registers as **Guardian**
- **Drop-in signing:** `TurnkeyAgentSigner` — `{ publicKey, signTransaction }` for Eliza / LangChain / custom bots
- **Signing:** Agent simulates txs on-chain, then Turnkey enclave evaluates synced policies. Large txs need portal + Passkey.
- **Policies:** `syncPolicy()` / `syncPoliciesToTurnkey()` push limits to Turnkey at setup and on demand.
- **LLM agent (`AgentEngine.run`):** LLM calls `execute_solana_transfer` → `SafeAgentSigner.requestSignature()` → auto-sign or Guardian approval (same threshold as above).

## Security layers
1. **Tool surface** — only `execute_solana_transfer` is exposed to the LLM
2. **App threshold** — `AUTO_SIGN_THRESHOLD_SOL` in `SafeAgentSigner`
3. **Turnkey policies** — `agentAutoSignPolicy` + `humanApprovalPolicy` in `src/core/policies.ts` (installed at setup)
