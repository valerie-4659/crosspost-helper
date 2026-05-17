import Database from "@tauri-apps/plugin-sql";
import { DATABASE_URL } from "@/database/schema";

let connection: Database | null = null;

export async function getDatabase() {
  if (!connection) {
    connection = await Database.load(DATABASE_URL);
  }

  return connection;
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}
