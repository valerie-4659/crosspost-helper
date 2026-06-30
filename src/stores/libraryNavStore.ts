import { ref } from "vue";

/** Set to a folder path to navigate the Library page to that folder. Cleared after use. */
export const pendingLibraryPath = ref<string | null>(null);
