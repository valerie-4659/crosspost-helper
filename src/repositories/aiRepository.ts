import { createId, getDatabase } from "./database";
import type { AiConfig, NetworkTag } from "@/types/aiSettings";

// ── AI Config ─────────────────────────────────────────────────────────────────

export async function getAiConfig(): Promise<AiConfig> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM ai_config WHERE key IN ('provider','model','api_key','x_premium_plus')",
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    provider:      (map["provider"] as AiConfig["provider"]) || "openai",
    model:         map["model"]   || "gpt-4o-mini",
    apiKey:        map["api_key"] || "",
    xPremiumPlus:  map["x_premium_plus"] === "1",
  };
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  const db = await getDatabase();
  const entries: Array<[string, string]> = [
    ["provider",       config.provider],
    ["model",          config.model],
    ["api_key",        config.apiKey],
    ["x_premium_plus", config.xPremiumPlus ? "1" : "0"],
  ];
  for (const [key, value] of entries) {
    await db.execute(
      "INSERT INTO ai_config (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [key, value],
    );
  }
}

// ── Network Tags ──────────────────────────────────────────────────────────────

export async function listNetworkTags(network: string): Promise<NetworkTag[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string; network: string; tag: string; is_default: number }>>(
    "SELECT id, network, tag, is_default FROM network_tags WHERE network = $1 ORDER BY is_default DESC, tag",
    [network],
  );
  return rows.map((r) => ({
    id: r.id,
    network: r.network,
    tag: r.tag,
    isDefault: Boolean(r.is_default),
  }));
}

export async function addNetworkTag(network: string, tag: string): Promise<NetworkTag> {
  const db = await getDatabase();
  const id = createId("nt");
  await db.execute(
    "INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES ($1, $2, $3, 0)",
    [id, network, tag.trim()],
  );
  // Return the row (may already exist — retrieve actual id)
  const rows = await db.select<Array<{ id: string; is_default: number }>>(
    "SELECT id, is_default FROM network_tags WHERE network = $1 AND tag = $2 LIMIT 1",
    [network, tag.trim()],
  );
  return { id: rows[0]?.id ?? id, network, tag: tag.trim(), isDefault: Boolean(rows[0]?.is_default) };
}

export async function removeNetworkTag(tagId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM network_tags WHERE id = $1", [tagId]);
}
