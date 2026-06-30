# Approval Portal

<p align="center">
  <img src="../assets/logo.png" alt="Agent Solana Wallet" width="96" />
</p>

**Mobile approval portal for [Agent Solana Wallet](../README.md)** — your phone co-signs your AI agent's wallet with Face ID / Touch ID.

Deploy this folder to Vercel. **Root Directory = `portal`**

---

## What this is

| Component | Path | Runs on |
|-----------|------|---------|
| **Agent SDK + CLI** | repo root (`src/core`, `src/agent`, `src/cli`) | Your machine / Cloud Run |
| **This app** | `portal/` | Vercel + your phone browser |

The agent handles small Solana txs automatically. Large txs show up here — you tap **Approve** and confirm with Face ID.

---

## Before you start

At the **repo root**:

```bash
npm install
npm run build
npm run gcp:bootstrap    # one-time — see root README
```

**New to Turnkey?** → [Turnkey setup guide](../README.md#never-used-turnkey-start-here)

---

## Setup

### 1. Install

```bash
cd portal
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`. **Never put a seed phrase here** — only Turnkey dashboard API keys and GCP project ID.

| ⛔ Never in `.env` | ✅ What goes here |
|--------------------|-------------------|
| Wallet seed phrase | Turnkey dashboard API keys |
| Solana private key | `GCP_PROJECT_ID` |
| Agent wallet secret | `NEXT_PUBLIC_RP_ID` (your Vercel domain) |

### 2. Deploy on Vercel

See [Deploy the approval portal](../README.md#deploy-the-guardian-app-vercel) in the root README.

### 3. Link your phone

```bash
# repo root
export APPROVAL_PORTAL_URL=https://YOUR-APP.vercel.app
npm run setup -- --user-name Alice --wallet-name "Alice Agent Wallet"
```

Scan the QR → register Passkey → you're the Guardian.

---

## Local dev (same laptop only)

```bash
npm run dev:portal    # from repo root
# or
cd portal && npm run dev
```

Open `http://localhost:3000` on **this machine** only. For a real phone, deploy to Vercel first.

---

## Scripts

| Command | Where |
|---------|-------|
| `npm run dev` | `portal/` |
| `npm run build` | `portal/` |
| `npm run setup` | repo root |
| `npm run dev:portal` | repo root |

---

Made & powered by [ChewieTech](https://chewie.io)
