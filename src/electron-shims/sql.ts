export default class Database {
  static async load(_url: string) {
    return new Database();
  }

  private get db() {
    if (!("desktop" in window)) {
      throw new Error("Desktop API unavailable – run the app via `npm run electron:dev`, not in a plain browser.");
    }
    return window.desktop.db;
  }

  async select<T>(sql: string, params?: unknown[]): Promise<T> {
    return this.db.select(sql, params) as Promise<T>;
  }

  async execute(sql: string, params?: unknown[]) {
    return this.db.execute(sql, params);
  }
}
