export const DATABASE_URL = "sqlite:crossposthelper.db";

export { default as initialSchema } from "./migrations/001_initial.sql?raw";
export { default as collectionsSchema } from "./migrations/002_collections.sql?raw";
export { default as aiConfigSchema } from "./migrations/003_ai_config.sql?raw";
export { default as postQueuesSchema } from "./migrations/004_post_queues.sql?raw";
export { default as xTagsV2Schema } from "./migrations/005_x_tags_v2.sql?raw";
export { default as personasSchema } from "./migrations/006_personas.sql?raw";
export { default as storylinesSchema } from "./migrations/007_storylines.sql?raw";
export { default as pickerCooldownSchema } from "./migrations/008_picker_cooldown.sql?raw";
export { default as folderPreviewsSchema } from "./migrations/009_folder_previews.sql?raw";
export { default as wavespeedJobsSchema } from "./migrations/010_wavespeed_jobs.sql?raw";
export { default as wavespeedImageJobsSchema } from "./migrations/011_wavespeed_image_jobs.sql?raw";
