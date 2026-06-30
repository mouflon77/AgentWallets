<p align="center">
  <img src="./assets/logo.png" alt="Agent Solana Wallet" width="120" />
</p>

# Agent Solana Wallet

**Give your AI agent a Solana wallet — no private key in `.env`.**

MPC custody via [Turnkey](https://turnkey.com). Your agent auto-signs small txs; your phone co-signs big ones with **Face ID / Touch ID**.

**New wallet?** Follow the 6 steps below.  
**Already have a wallet?** Same 6 steps, then [import via Turnkey’s iframe](#already-have-a-wallet-with-funds) — never paste your seed into code or env files.

---

## What you need

1. **Node.js 18+**
2. A **Turnkey** account — [setup guide below](#never-used-turnkey-start-here) if you’ve never used it
3. A **Google Cloud** project with Secret Manager ([free tier works](https://cloud.google.com/secret-manager))
4. A **phone** (or laptop with Touch ID / Windows Hello) for Guardian approvals

---

## Repo layout

```
AgentWallets/
├── src/
│   ├── core/          # SafeAgentSigner — MPC signing (Turnkey + GCP)
│   ├── agent/         # AgentEngine — LLM tool calling
│   └── cli/           # setup, QR, gcp:bootstrap
├── portal/            # Mobile approval app — deploy THIS to Vercel
├── plugins/           # ElizaOS, LangChain — copy-paste integrations
├── character.json     # Sample ElizaOS character file
├── package.json       # npm run setup, gcp:bootstrap
└── README.md
```

| Path | What it is |
|------|------------|
| **`src/core/`** | MPC wallet logic — `SafeAgentSigner`, Turnkey policies, transfers |
| **`src/agent/`** | LLM brain — `AgentEngine` + `execute_solana_transfer` tool |
| **`src/cli/`** | Setup scripts + terminal QR code |
| **`portal/`** | Phone approval app — **Vercel Root Directory** |
| **`plugins/`** | Framework plugins — start with `eliza-turnkey-provider.ts` |

```bash
npm run dev:portal              # Approval portal (local)
npm run setup                   # Create wallet + QR
```

There is **no** `npm run dev` at the repo root.

---

## Never used Turnkey? Start here

**Turnkey** is the service that holds your wallet keys inside a secure enclave (MPC). Your agent and your phone never get a raw private key — they ask Turnkey to sign.

You need **one Turnkey account** and **three values** from the dashboard. Agent Solana Wallet creates the actual agent wallet for you later (`npm run setup`) — you do **not** create a Solana wallet manually in Turnkey.

### 1. Create an account

1. Go to **[app.turnkey.com](https://app.turnkey.com)** and sign up.
2. Confirm your email and follow the prompts (add a Passkey / authenticator for your Turnkey login).
3. You land on the **Welcome** page.

### 2. Pick the right path on Welcome

Turnkey shows two cards. **Use Company Wallets** — that’s the agent / server / treasury path.

| Card | Use it? | Why |
|------|---------|-----|
| **Company Wallets** | **Yes — this one** | Programmatic wallets for agents and ops. This repo uses the **TypeScript (Server)** SDK from that card. |
| Embedded Wallets | No (for now) | For apps that embed Turnkey’s full auth UI. We ship our own approval portal instead. |

You can click **Quickstart** on Company Wallets to skim Turnkey’s docs, or skip straight to step 3 below.

### 3. Copy your Organization ID

1. Click your **profile / user menu** (top right of the dashboard).
2. Copy **Organization ID** — a long UUID.

This is your **parent organization**. Every agent wallet will be a **sub-org** created automatically by `npm run setup`.

→ Save as `TURNKEY_ORGANIZATION_ID` and `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` (same value in both).

### 4. Create an API key (for the agent server)

This is a **Turnkey API password** — not your wallet seed.

1. Open **My Profile** from the user menu.
2. Click **Create an API key** (or **New API key**).
3. Name it something like `agentwallets-dev`.
4. Approve with your Turnkey Passkey when prompted.
5. **Copy both keys immediately:**
   - **Public key** → `TURNKEY_API_PUBLIC_KEY`
   - **Private key** → `TURNKEY_API_PRIVATE_KEY` (shown once — store it somewhere safe)

These keys let your **server** call Turnkey to create sub-orgs and sign small transactions. They are **not** your Solana wallet secret.

### 5. Map Turnkey values → this repo

| From Turnkey dashboard | Put it in | Used by |
|------------------------|-----------|---------|
| Organization ID | `TURNKEY_ORGANIZATION_ID` | Agent CLI, portal server |
| Organization ID | `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` | Portal browser (Passkeys) |
| API public key | `TURNKEY_API_PUBLIC_KEY` | Agent + portal server |
| API private key | `TURNKEY_API_PRIVATE_KEY` | Agent + portal server |

**First time:** paste them into your shell for `npm run gcp:bootstrap` (Step 2 below), then into `.env.local` / Vercel for the portal.

**You do not need to:**
- Create a wallet in the Turnkey UI
- Paste a seed phrase anywhere in Turnkey’s dashboard for a new wallet
- Touch **Embedded Wallets → Configuration** unless you later switch to Turnkey’s hosted auth

### 6. After you deploy the portal (Vercel)

Passkeys only work on a **real domain** (not `localhost` on your phone).

1. In the Turnkey dashboard sidebar → **Organization Settings** (or **Embedded Wallets → Configuration** if you use Auth Proxy later).
2. Add your portal URL to **Allowed origins** — exact URL, e.g. `https://agent-wallets.vercel.app`.
3. Set `NEXT_PUBLIC_RP_ID` to the hostname only: `agent-wallets.vercel.app` (no `https://`).

### Turnkey help links

- [Account setup (org ID + API key)](https://docs.turnkey.com/getting-started/quickstart)
- [Company Wallets quickstart](https://docs.turnkey.com/getting-started/company-wallets-quickstart)
- [Import an existing wallet (seed via iframe)](https://docs.turnkey.com/features/wallets/import-wallets)

---

## Setup in 6 steps

### Step 1 — Install

```bash
cd AgentWallets
npm install
npm run build
```

---

### Step 2 — Save Turnkey keys in Google Cloud (one time)

If you haven’t done [Turnkey setup](#never-used-turnkey-start-here) yet, do that first — you need Organization ID + API keys.

Your agent reads Turnkey credentials from **Secret Manager**, not from `.env`.

```bash
export GCP_PROJECT_ID=your-gcp-project-id

# Paste your Turnkey parent-org keys (one time only)
export TURNKEY_API_PUBLIC_KEY=...
export TURNKEY_API_PRIVATE_KEY=...
export TURNKEY_ORGANIZATION_ID=...

npm run gcp:bootstrap
```

Then clear those three `TURNKEY_*` vars from your shell.

---

### Step 3 — Configure the approval portal

```bash
cd portal
npm install
cp .env.local.example .env.local
```

Edit `.env.local` with your **Turnkey dashboard API keys** and **GCP project ID**.

> **This is not where your wallet seed goes.**  
> `.env.local.example` is an empty checklist of settings — no secrets, safe to commit.  
> Your real values go in `.env.local` (gitignored).  
> **Never** put a seed phrase, mnemonic, or Solana private key in any `.env` file.  
> Import an existing wallet only via [Turnkey’s Import Iframe](#already-have-a-wallet-with-funds).

See [portal README](./portal/README.md) for each variable.

---

### Step 4 — Deploy the approval portal (Vercel)

**Use your phone? Deploy first.** `localhost` only works on the same laptop.

Push to GitHub, deploy **`portal/`** on Vercel. Full guide: [Deploy the approval portal](#deploy-the-guardian-app-vercel).

After deploy you’ll have a URL like `https://agent-wallets.vercel.app`. Use that for setup:

```bash
export APPROVAL_PORTAL_URL=https://agent-wallets.vercel.app
npm run setup -- --user-name Alice --wallet-name "Alice Agent Wallet"
```

**Laptop-only testing (optional):** `npm run dev:portal` → open `http://localhost:3000` on the same machine.

---

### Step 5 — Create the wallet + link your phone

With the portal **deployed** (Step 4), run setup at the repo root:

```bash
cd AgentWallets
npm run setup -- --user-name Alice --wallet-name "Alice Agent Wallet"
```

The script does five things:

1. **Creates a sub-org** — a private Turnkey space for this agent  
2. **Creates a Solana wallet** — a new address inside that sub-org  
3. **Prints a recovery share** — BIP-39 mnemonic to write down (shown once)  
4. **Prints the address** — send SOL here to fund the agent  
5. **Prints a QR code** — scan it with your phone  

On your phone: open the link → tap **Register Device** → confirm with Face ID / Touch ID.  
Your phone is now the **Guardian** for this wallet.

---

### Step 6 — Use it in your agent

**Direct signing** (your code builds the transaction):

```typescript
import { SafeAgentSigner } from "agentwallets";

const signer = await SafeAgentSigner.init();
await signer.loadWallet("wallet-<subOrgId>");   // printed during setup

const result = await signer.requestSignature(tx);
// small tx  → signed automatically
// big tx    → waits for phone approval
```

**LLM agent** (OpenAI / Claude / Gemini with tool calling):

```typescript
import { AgentEngine, SafeAgentSigner } from "agentwallets";

const signer = await SafeAgentSigner.init();
await signer.loadWallet("wallet-<subOrgId>");

const engine = new AgentEngine({
  signer,
  provider: "openai", // recommended — best tool-calling support
  // apiKey: process.env.OPENAI_API_KEY,
});

const { text, transfers } = await engine.run(
  "Send 0.1 SOL to 7xKX...abc for the API invoice.",
);
console.log(text, transfers);
```

When the LLM decides to move funds, it calls the **`execute_solana_transfer`** tool. The handler builds the transaction and passes it to `SafeAgentSigner` — same auto-sign vs Guardian flow as above.

The secret ID (`wallet-<subOrgId>`) is printed when you run `npm run setup`.

---

## Already have a wallet with funds?

**Do not** paste your seed phrase into the agent, `.env`, or your code. Ever.

Use Turnkey’s **Import Iframe** instead.

### What to do

1. Complete **Steps 1–4** above (same as a new wallet).
2. Run setup and scan the QR on your phone:

   ```bash
   npm run setup -- --user-name Alice --wallet-name "Alice Agent Wallet"
   ```

3. In the approval portal, use the **Import** flow — this opens Turnkey’s Import Iframe (not a text field in this repo).
4. Type your seed phrase into **Turnkey’s Import Iframe** — a secure window hosted by Turnkey (`import.turnkey.com`), not by this repo.
5. Your seed is **encrypted in the browser** before it leaves your device. It goes straight to Turnkey’s enclave.
6. Register your Passkey (Guardian) — same as Step 5 for a new wallet.

### What you get

Your old wallet becomes an **MPC wallet**. Same address, same funds. The agent can use it, but the agent **never sees the seed**.

> **Why this is safe:** Neither this app nor the agent touches your seed in plain text. Only you (in the iframe) and Turnkey’s secure enclave are involved.  
> How Turnkey import works: [docs.turnkey.com/features/wallets/import-wallets](https://docs.turnkey.com/features/wallets/import-wallets)

---

## Quick command reference

| What you want | Command | Where |
|---------------|---------|-------|
| Install + build | `npm install && npm run build` | repo root |
| Save Turnkey keys to GCP | `npm run gcp:bootstrap` | repo root |
| New wallet + QR | `npm run setup` | repo root |
| Start Guardian app (local) | `npm run dev:guardian` | repo root |

---

## Deploy the Guardian app (Vercel)

Deploy **`portal/`** — not the repo root.

### 1. Push to GitHub

```bash
cd AgentWallets
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/AgentWallets.git
git push -u origin main
```

### 2. Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → import your **GitHub** repo
2. **Before clicking Deploy** — open **Root Directory** → **Edit**
3. Type: **`portal`** → **Continue**
4. Confirm **Framework Preset** = Next.js

```
AgentWallets/
├── src/                 ← SDK (stays on your machine / Cloud Run)
└── portal/              ← ✅ Vercel Root Directory
```

Vercel runs `portal/vercel.json` (builds the SDK first, then the approval portal).

### 3. Add environment variables

In Vercel → **Settings → Environment Variables**, add everything from `portal/.env.local.example`:

| Variable | Example | Notes |
|----------|---------|-------|
| `GCP_PROJECT_ID` | `my-gcp-project` | Same project as Step 2 |
| `GCP_SERVICE_ACCOUNT_JSON` | `{…}` | Full service account JSON (Secret Manager accessor) |
| `TURNKEY_API_PUBLIC_KEY` | `…` | Turnkey parent org |
| `TURNKEY_API_PRIVATE_KEY` | `…` | Server only — never prefix with `NEXT_PUBLIC_` |
| `TURNKEY_ORGANIZATION_ID` | `…` | Turnkey parent org |
| `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` | same as above | Browser Passkey client |
| `NEXT_PUBLIC_RP_ID` | `agent-wallets.vercel.app` | **Your Vercel domain** — no `https://` |
| `AUTO_SIGN_THRESHOLD_SOL` | `0.5` | Optional |

**GCP on Vercel:** create a GCP **service account** with `Secret Manager Secret Accessor`, download its JSON key, and paste the **entire JSON** into Vercel as `GCP_SERVICE_ACCOUNT_JSON`.

### 4. Allow your domain in Turnkey

See [Turnkey setup § After you deploy](#6-after-you-deploy-the-portal-vercel): add your Vercel URL to **Allowed origins** and match `NEXT_PUBLIC_RP_ID` to your hostname.

### 5. Deploy and run setup

Click **Deploy**. Then on your laptop:

```bash
export APPROVAL_PORTAL_URL=https://YOUR-APP.vercel.app
npm run setup -- --user-name Alice --wallet-name "Alice Agent Wallet"
```

Scan the QR on your phone — it opens your **live** portal. Register with Face ID / Touch ID.

---

## How signing works

```
User prompt → LLM (AgentEngine)
                    │
                    ▼
         execute_solana_transfer tool
                    │
                    ▼
            SafeAgentSigner.requestSignature()
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  Amount < threshold      Amount ≥ threshold
  Agent auto-signs        Guardian app → Face ID
```

Details: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Security model — Policy as Infrastructure (not security theater)

Your agent never holds a raw **Solana** private key. A stolen GCP secret gives an attacker a **Turnkey API credential** — not a seed phrase — and Turnkey **policies in the enclave** still cap what that key can sign.

| Layer | Strong or UX? | What it does |
|-------|---------------|--------------|
| **Turnkey enclave policies** | **Strong** — cannot be patched by compromising the agent | Spend limits uploaded via `syncPolicy()`; enclave refuses invalid signatures |
| **On-chain simulation** | **Strong** — catches bad txs before signing | Every sign path simulates against Solana RPC first |
| **App `requestSignature()` threshold** | UX only | Queues large txs for the portal; Turnkey already blocks agent-only large signs |
| **LLM tool surface** | Defense in depth | Only `execute_solana_transfer` exposed to the LLM |

### API key ≠ seed phrase

| | Seed phrase | Turnkey agent API key |
|--|-------------|------------------------|
| Revocable | No | Yes — delete/rotate in Turnkey |
| Scoped | No | Yes — policies limit which txs it can sign |
| Bypasses phone for large txs | Yes (full control) | **No** — enclave requires Passkey consensus above threshold |
| Stored in this repo | Never | GCP Secret Manager only |

Even if someone steals the GCP agent API secret, they **cannot** sign transfers above `AUTO_SIGN_THRESHOLD_SOL` after policies are synced — they do not have your Passkey.

### Turnkey policies (enclave — authoritative)

During `npm run setup`, the SDK calls **`syncPolicy()`** and pushes rules to Turnkey immediately (before guardian registration). After you register your phone, it syncs the human-approval policy too.

```typescript
await signer.loadWallet("wallet-<subOrgId>");
await signer.syncPolicy(); // re-push after changing AUTO_SIGN_THRESHOLD_SOL
```

**Agent auto-sign (low value)** — only the GCP agent user, only below threshold:

```json
{
  "policyName": "Agent auto-sign (low value)",
  "effect": "EFFECT_ALLOW",
  "consensus": "approvers.any(user, user.id == '<agentUserId>')",
  "condition": "solana.tx.transfers.all(transfer, transfer.amount < 500000000)"
}
```

**Human approval (high value)** — Passkey holder required at or above threshold:

```json
{
  "policyName": "Human approval (high value)",
  "effect": "EFFECT_ALLOW",
  "consensus": "approvers.any(user, user.id == '<humanUserId>')",
  "condition": "solana.tx.transfers.any(transfer, transfer.amount >= 500000000)"
}
```

Local TypeScript checks are **not** the security boundary — patching `if (amount > 0.1)` in agent code does nothing. Turnkey's enclave evaluates the condition above on every signature request.

### Emergency recovery (vendor exit)

`npm run setup` calls `generateRecoveryMnemonic()` — a BIP-39 phrase printed **once**. Store offline. If Turnkey is unavailable, import it into Phantom/Solflare to recover funds. See [Recovery share](#recovery-share-setup).

### Anti-phishing (Guardian registration)

The setup terminal prints **Sub-Org ID + wallet address** before the QR code. The portal requires you to confirm they match before Passkey registration. Never scan a QR if the portal shows different values.

### Recommended LLM provider

| Provider | Tool calling | Notes |
|----------|--------------|-------|
| **OpenAI** (`gpt-4o-mini`) | ✅ Best supported | Default in `AgentEngine` |
| Anthropic (Claude) | ✅ Supported | Set `provider: "anthropic"`, `ANTHROPIC_API_KEY` |
| Google (Gemini) | ✅ Supported | Set `provider: "gemini"`, `GEMINI_API_KEY` |

OpenAI is the default because its function-calling API is the most battle-tested for agent wallets. Claude and Gemini work via the same `execute_solana_transfer` tool — all paths end at `SafeAgentSigner`.

---

## Drop-in signer (`TurnkeyAgentSigner`)

Use `TurnkeyAgentSigner` anywhere a bot expects `{ publicKey, signTransaction }` — Eliza, LangChain, or custom Solana code. No local `secretKey` (MPC only).

```typescript
import { TurnkeyAgentSigner } from "agentwallets";
// or: import { TurnkeyAgentSigner } from "agentwallets/signer";

const signer = await TurnkeyAgentSigner.init();
// env: GCP_PROJECT_ID, WALLET_SECRET_ID

const tx = new Transaction().add(/* ... */);
tx.feePayer = signer.publicKey;
const signed = await signer.signTransaction(tx);
await connection.sendRawTransaction(signed.serialize());
```

---

## Using Eliza?

Instead of putting your key in `character.json`, use our **Turnkey Provider**.

1. Copy [`plugins/eliza-turnkey-provider.ts`](./plugins/eliza-turnkey-provider.ts) to your Eliza project
2. Set your environment (no `SOLANA_PRIVATE_KEY`):

```bash
GCP_PROJECT_ID=your-gcp-project
WALLET_SECRET_ID=wallet-<subOrgId>      # from npm run setup
TURNKEY_ORGANIZATION_ID=your-parent-org  # from Turnkey dashboard / gcp:bootstrap
APPROVAL_PORTAL_URL=https://your-portal.vercel.app
```

3. Register the plugin in your character or `ProjectAgent`:

```typescript
import { turnkeySolanaPlugin } from "./plugins/eliza-turnkey-provider";

export const character = {
  name: "MyAgent",
  plugins: ["@elizaos/plugin-sql", "@elizaos/plugin-openai", turnkeySolanaPlugin.name],
};
```

Your agent now uses **MPC automatically** — same `TurnkeyAgentSigner` as the SDK.

Optional: merge [`character.json`](./character.json) for personality/settings (never put a seed or private key there).

### AgentEngine (LLM tool calling)

For OpenAI / Claude / Gemini agents that call tools:

```typescript
import { AgentEngine, SafeAgentSigner } from "agentwallets";

const signer = await SafeAgentSigner.init();
await signer.loadWallet(process.env.WALLET_SECRET_ID!);
const engine = new AgentEngine({ signer });
await engine.run("Send 0.1 SOL to …");
```

---

## Recovery share (setup)

During `npm run setup`, the SDK calls **`generateRecoveryMnemonic()`** — exports a BIP-39 phrase from Turnkey and prints it **once** in your terminal.

- **Write it down** and store offline (safe, paper, offline vault)
- **Never** put it in `.env`, `character.json`, GitHub, or your LLM
- If Turnkey is ever unavailable, import the phrase into any standard Solana wallet to recover funds

This is generated locally during setup and is **not** saved to GCP.

---

## `npm audit` warnings

If `npm audit` shows issues after `npm install`, **do not** run `npm audit fix --force` — it breaks Turnkey/Solana packages.

This repo pins safe versions in `package.json` → `overrides`. After pulling:

```bash
npm install
npm audit    # should show 0 vulnerabilities
```

The `allow-scripts` warning about `bufferutil` is normal for Solana — not a security problem.

---

## FAQ

### Is a stolen GCP / Turnkey API secret as bad as a seed phrase?

**No.** A seed phrase grants full, permanent control. A stolen Turnkey **agent API key** is:

- **Revocable** — rotate or delete it in Turnkey without moving funds
- **Policy-scoped** — the enclave only allows signatures that match uploaded policies
- **Insufficient for large txs** — above `AUTO_SIGN_THRESHOLD_SOL`, the Passkey on your phone must co-sign (2-of-3)

The agent API key authenticates *requests* to Turnkey. It is not the Solana private key.

---

### Can a hacker bypass the spend limit by editing my TypeScript?

**Not if policies are synced.** Local `if (amount > 0.5)` checks are UX hints only. The real limit lives in Turnkey's enclave (`syncPolicy()` during setup). Patching agent code cannot change what Turnkey will sign.

Re-sync after changing limits:

```typescript
await signer.syncPolicy();
```

---

### What if Turnkey goes down or shuts down?

Run setup once and **write down the recovery mnemonic** (`generateRecoveryMnemonic()`). Import it into any standard Solana wallet (Phantom, Solflare) to recover funds without Turnkey. This is your non-custodial exit path.

---

### How do I know the QR code isn't phishing?

Before scanning, your **terminal** prints Sub-Org ID and wallet address. The **portal** shows the same values and requires a confirmation checkbox. If they don't match exactly, stop — do not register your Passkey.

---

### Are TEE / MPC wallets 100% unbreakable?

No system is perfect. TEEs (AWS Nitro) add strong isolation; MPC splits the key so a single enclave breach doesn't necessarily expose the full key. Layered with Passkey co-signing and offline recovery mnemonic, this is a practical **hot wallet** design — not a replacement for cold storage of life savings.

---

### What is Face ID / Touch ID doing here?

When you **Register Device** or tap **Approve**, your phone or laptop asks for **Face ID**, **Touch ID**, or **Windows Hello**. That unlocks a **Passkey** — a cryptographic key stored in your device’s secure chip (Secure Enclave on iPhone, equivalent on Android/Windows).

The Passkey proves you are the **Guardian** for this wallet. Turnkey checks the signature; the agent never gets your biometric data or the Passkey itself.

---

### How does my phone secure the wallet?

Two separate things:

1. **The portal** (your Vercel URL) is the UI — buttons, pending transactions, etc.
2. **The Passkey** lives on your phone in the **Secure Enclave / Keychain**. Face ID unlocks it.

When you tap **Approve**, the browser asks for Face ID, your Passkey signs a challenge, and **Turnkey** checks it matches the Guardian you registered. The agent never sees your biometrics or Passkey.

---

### Why doesn’t the QR code work on my phone with `localhost`?

`localhost` on your phone means **the phone itself** — not your laptop. A QR with `http://localhost:3000` will not reach your dev machine.

**Use a deployed URL instead.** Follow [Deploy the approval portal (Vercel)](#deploy-the-approval-portal-vercel), then:

```bash
export APPROVAL_PORTAL_URL=https://YOUR-APP.vercel.app
npm run setup -- --user-name Alice
```

**Laptop-only?** Run `npm run dev:portal` and open `http://localhost:3000` on the **same computer** (Touch ID / Windows Hello on that machine).

---

### What is stored on my phone? What survives a restart?

| Stored where | What it is | Survives restarting the portal? |
|--------------|------------|----------------------------------|
| **Phone Keychain / Secure Enclave** | Passkey (the real crypto key behind Face ID) | Yes |
| **Browser localStorage** | Your name + wallet IDs (which wallet you’re Guardian for) | Yes (same browser, until you clear site data) |
| **Browser IndexedDB** | Turnkey browser session keys | Yes (same browser) |
| **Turnkey cloud** | MPC wallet + your Passkey’s **public** key | Yes (always) |
| **GCP Secret Manager** | Agent API key (server-side only) | Yes (always) |

Restarting `npm run dev:portal` does **not** wipe any of this. Closing the browser tab does **not** either — unless you clear the site’s storage.

The portal does **not** store your seed phrase, private key, or Face ID data.

---

### How does the portal know it’s me after I come back?

**Remembering you** = browser reads `localStorage` (“you’re Guardian for wallet X”).

**Proving it’s you** = every approval triggers Face ID again. The Passkey signs a fresh challenge; Turnkey verifies it against the Guardian registered at setup.

So: the page remembers *which* wallet. Face ID proves *you* are the Guardian.

---

### What if I restart the portal or my browser?

| What you restart | What happens |
|------------------|--------------|
| Next.js dev server | No change — browser still remembers you |
| Browser tab | No change — localStorage persists |
| Clear browser data for the site | Session info gone — may need to open the portal again; Passkey may still exist in Keychain |
| Different phone or browser | Not registered as Guardian on that device |

Turnkey login sessions expire after ~1 hour. That’s fine — tapping **Approve** logs you in again and prompts Face ID.

---

### Where does the agent’s key live? Can it approve big transactions alone?

The agent’s **Turnkey API key** lives in **GCP Secret Manager** (never in `.env` at runtime). Turnkey **enclave policies** — not local code — allow it to auto-sign **small** transactions only.

Big transactions need **both** the agent key **and** your Passkey approval. The agent cannot bypass your phone, even with a stolen GCP secret.

---

## Need more detail?

- **Turnkey first-time setup** → [Never used Turnkey? Start here](#never-used-turnkey-start-here)
- Deploy Guardian app → [Deploy the Guardian app (Vercel)](#deploy-the-guardian-app-vercel)
- Portal env vars → [portal/README.md](./portal/README.md)
- Security model → [ARCHITECTURE.md](./ARCHITECTURE.md)

---

Made & powered by [ChewieTech](https://chewie.io)
