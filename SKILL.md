# Tab — spend discipline skill

Money is a project constraint like latency. Treat it as one.

## The rule

**No paid inference without a printed estimate.** Before any run expected to exceed ~20k tokens (or any run on a paid model), print one line:

```
est: <provider/model> in=<n> out=<n> → ~$<x>  (via: tab price …)
```

Use `node bin/tab.mjs price` for the estimate — live OpenRouter rates, $0 for free tiers. Never invent prices from memory.

## Auto-downgrade ladder

When the estimate exceeds what the task deserves, step down before asking:

1. Same task on the cheapest capable **free** model (see freeload chains).
2. Shrink context: fewer files, tighter grep, no full-repo dumps.
3. Split the task: cheap model drafts, strong model reviews only the diff.
4. Only then: ask the user to approve the paid run, showing the estimate and what steps 1–3 would save.

## After the run

For sessions that matter, export and receipt:

```bash
opencode export <sessionID> --sanitize > receipt.json
node bin/tab.mjs audit receipt.json
```

Report `cost` alongside completion. If the receipt contradicts your estimate by >2x, say why (cache miss? runaway loop? wrong model?) — that's the feedback loop that makes estimates better.

## Never

- Never quote prices from memory — always `tab price`.
- Never silently retry paid calls on quota errors — fail over to free (freeload discipline).
- Never present token counts without converting to $ — nobody feels "tokens".
