import { createManualCatalog } from "./catalog.js";
import { data } from "./material.js";
export { manualAreas } from "./catalog.js";

export const { listGuides, readGuides, searchGuides, guideCountByArea } =
  createManualCatalog(data);
