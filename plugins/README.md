# Framework plugins

Copy-paste integrations for popular AI agent frameworks. No raw private keys — all paths use Turnkey MPC.

| Plugin | Framework | File |
|--------|-----------|------|
| Turnkey Provider | [ElizaOS](https://docs.elizaos.ai/) | [`eliza-turnkey-provider.ts`](./eliza-turnkey-provider.ts) |

## ElizaOS

Instead of `SOLANA_PRIVATE_KEY` in `character.json`:

1. Copy `eliza-turnkey-provider.ts` into your Eliza project
2. Set environment variables:

```bash
GCP_PROJECT_ID=your-gcp-project
WALLET_SECRET_ID=wallet-<subOrgId>   # from npm run setup
TURNKEY_ORGANIZATION_ID=...          # parent org (bootstrap)
OPENAI_API_KEY=...
APPROVAL_PORTAL_URL=https://your-portal.vercel.app
```

3. Register the plugin in your character or `ProjectAgent`

See the root [README](../README.md#using-eliza) for the full walkthrough.
