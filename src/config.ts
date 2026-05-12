import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-snap",
  description: "Every phone shoots a photo on the same millisecond — instant multi-angle moment",
  accentHex: "#00c2ff",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
