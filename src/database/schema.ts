export const DATABASE_URL = "sqlite:crossposthelper.db";

export { default as initialSchema } from "./migrations/001_initial.sql?raw";
export { default as collectionsSchema } from "./migrations/002_collections.sql?raw";
