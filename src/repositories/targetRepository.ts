import { createId, getDatabase, nowIso } from "./database";
import type { PostingTarget, PostingTargetInput, PostingTargetType } from "@/types/postingTarget";

type TargetRow = {
  id: string;
  name: string;
  type: PostingTargetType;
  enabled: number;
  created_at: string;
  updated_at: string;
};

const DEFAULT_TARGETS: PostingTargetInput[] = [
  { name: "X", type: "x" },
  { name: "Bluesky", type: "bluesky" },
  { name: "DeviantArt", type: "deviantart" },
  { name: "Civitai", type: "civitai" },
  { name: "SocialDiff", type: "socialdiff" },
];

function mapTarget(row: TargetRow): PostingTarget {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureDefaultTargets() {
  const db = await getDatabase();
  for (const target of DEFAULT_TARGETS) {
    const rows = await db.select<Array<{ id: string }>>("SELECT id FROM posting_targets WHERE type = $1 LIMIT 1", [
      target.type,
    ]);
    if (rows.length === 0) {
      await createTarget(target);
    }
  }
}

export async function listTargets(): Promise<PostingTarget[]> {
  const db = await getDatabase();
  const rows = await db.select<TargetRow[]>("SELECT * FROM posting_targets ORDER BY type = 'custom', created_at");
  return rows.map(mapTarget);
}

export async function createTarget(input: PostingTargetInput): Promise<PostingTarget> {
  const db = await getDatabase();
  const timestamp = nowIso();
  const target: PostingTarget = {
    id: createId("target"),
    name: input.name,
    type: input.type,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.execute(
    `INSERT INTO posting_targets (id, name, type, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [target.id, target.name, target.type, 1, target.createdAt, target.updatedAt],
  );

  return target;
}

export async function updateTargetEnabled(id: string, enabled: boolean) {
  const db = await getDatabase();
  await db.execute("UPDATE posting_targets SET enabled = $1, updated_at = $2 WHERE id = $3", [
    enabled ? 1 : 0,
    nowIso(),
    id,
  ]);
}
