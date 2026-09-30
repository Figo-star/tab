#!/usr/bin/env node
// tab — keep a tab on every token. Pre-flight estimates + session receipts.
// Zero dependencies, Node 18+.
// Usage:
//   node bin/tab.mjs price <provider/model> <input-tokens> <output-tokens>
//   node bin/tab.mjs audit <opencode-export.json>
import { readFileSync } from "node:fs";

function readJson(file) {
  const raw = readFileSync(file);
  let text;
  if (raw[0] === 0xff && raw[1] === 0xfe) text = raw.toString("utf16le"); // opencode exports UTF-16
  else text = raw.toString("utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

function splitRef(ref) {
  // provider is the FIRST segment; the rest is the model id
  // ("openrouter/anthropic/claude-sonnet-4" → openrouter + anthropic/claude-sonnet-4)
  const i = ref.indexOf("/");
  if (i === -1) throw new Error(`bad model ref (want provider/model): ${ref}`);
  return [ref.slice(0, i), ref.slice(i + 1)];
}

const FREE = [
  { match: (p, m) => m.endsWith(":free"), note: "OpenRouter free tier" },
  { match: (p) => p === "pollinations", note: "Pollinations anonymous tier" },
  { match: (p, m) => p === "opencode" && m === "big-pickle", note: "Zen free model (assumed $0)" },
];

let catalog = null;
async function openRouterCatalog() {
  if (!catalog) {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
    catalog = new Map((await res.json()).data.map((m) => [m.id, m]));
  }
  return catalog;
}

function money(x) {
  if (x === 0) return "$0.00";
  if (x < 0.01) return "$" + x.toFixed(6);
  return "$" + x.toFixed(4);
}

async function priceFor(provider, model) {
  for (const f of FREE) {
    if (f.match(provider, model)) return { prompt: 0, completion: 0, note: f.note };
  }
  if (provider === "openrouter") {
    const cat = await openRouterCatalog();
    const m = cat.get(model);
    if (!m) throw new Error(`model not in OpenRouter catalog: ${model}`);
    return { prompt: Number(m.pricing.prompt), completion: Number(m.pricing.completion), note: "live OpenRouter pricing" };
  }
  return null; // unknown — caller reports tokens only
}

async function cmdPrice([ref, inS, outS]) {
  if (!ref || inS === undefined || outS === undefined) {
    console.error("tab: usage: price <provider/model> <input-tokens> <output-tokens>");
    process.exit(1);
  }
  const [provider, model] = splitRef(ref);
  const input = Number(inS), output = Number(outS);
  if (!Number.isFinite(input) || !Number.isFinite(output)) {
    console.error("tab: token counts must be numbers");
    process.exit(1);
  }
  const p = await priceFor(provider, model);
  if (!p) {
    console.log(`${ref} — no live pricing (input=${input} output=${output}). Add it or use an OpenRouter id.`);
    return;
  }
  const cost = input * p.prompt + output * p.completion;
  console.log(`${ref} — in=${input} out=${output} → ${money(cost)} (${p.note})`);
}

async function cmdAudit([file]) {
  if (!file) {
    console.error("tab: usage: audit <opencode-export.json>  (get it via: opencode export <sessionID> --sanitize)");
    process.exit(1);
  }
  const exp = readJson(file);
  const info = exp.info ?? exp;
  const t = info.tokens ?? {};
  const input = (t.input ?? 0) + (t.cache?.read ?? 0);
  const output = (t.output ?? 0) + (t.reasoning ?? 0);
  const provider = info.model?.providerID ?? "?";
  const model = info.model?.id ?? "?";
  const p = await priceFor(provider, model);
  console.log(`session ${info.id ?? "?"} — ${provider}/${model} (agent: ${info.agent ?? "?"})`);
  console.log(`tokens: input=${t.input ?? 0} cache-read=${t.cache?.read ?? 0} output=${t.output ?? 0} reasoning=${t.reasoning ?? 0}`);
  if (!p) {
    console.log(`cost: UNKNOWN live rate (input=${input} output=${output})`);
    return;
  }
  console.log(`cost: ${money(input * p.prompt + output * p.completion)} (${p.note})`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "price") await cmdPrice(rest);
  else if (cmd === "audit") await cmdAudit(rest);
  else {
    console.error("tab: usage: price <provider/model> <in> <out> | audit <opencode-export.json>");
    process.exit(1);
  }
} catch (e) {
  console.error("tab: " + (e?.message ?? e));
  process.exit(1);
}
