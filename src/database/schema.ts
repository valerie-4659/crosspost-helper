export const DATABASE_URL = "sqlite:crossposthelper.db";

export { default as initialSchema } from "./migrations/001_initial.sql?raw";
export { default as collectionsSchema } from "./migrations/002_collections.sql?raw";
export { default as aiConfigSchema } from "./migrations/003_ai_config.sql?raw";
export { default as postQueuesSchema } from "./migrations/004_post_queues.sql?raw";
