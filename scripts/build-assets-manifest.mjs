import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_DATASET = path.join("src", "data", "assets-catalog.json");
const SOURCE_SCHEMA = path.join("src", "config", "asset-schema.json");
const SOURCE_LOCAL_LIBRARY = path.join(
  "src",
  "data",
  "generated",
  "local-library-manifest.json"
);
const OUTPUT_ROOT = path.join("src", "data", "generated");
const OUTPUT_TYPES = path.join(OUTPUT_ROOT, "types");
const OUTPUT_GROUPS = path.join(OUTPUT_ROOT, "groups");
const OUTPUT_CAPABILITIES = path.join(OUTPUT_ROOT, "local-asset-capabilities.json");

const readJson = async (targetPath) => {
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw);
};

const writeJson = async (targetPath, payload) => {
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const readJsonSafe = async (targetPath) => {
  try {
    return await readJson(targetPath);
  } catch {
    return null;
  }
};

const byAssetName = (left, right) => {
  const nameCompare = String(left.name).localeCompare(String(right.name));
  if (nameCompare !== 0) return nameCompare;
  return String(left.id).localeCompare(String(right.id));
};

const toRelativeFilePath = (targetPath) =>
  `./${targetPath.replace(/\\/g, "/")}.json`;

const inspectGlbMeshes = async (targetPath) => {
  const buffer = await readFile(targetPath);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonText = buffer.toString("utf8", 20, 20 + jsonLength);
  const gltf = JSON.parse(jsonText);
  return Array.from(new Set((gltf.meshes || []).map((mesh) => mesh.name).filter(Boolean))).sort();
};

const toCapabilityKey = (gender, type, id) =>
  `${String(gender)}:${String(type)}:${String(id)}`;

const main = async () => {
  const dataset = await readJson(SOURCE_DATASET);
  const schema = await readJson(SOURCE_SCHEMA);

  const knownTypes = new Set(schema.types.map((item) => item.id));
  const allAssets = dataset.assets.filter((asset) => knownTypes.has(asset.type));
  if (allAssets.length === 0) {
    throw new Error("No assets matched schema types.");
  }

  const assetsByType = new Map();
  for (const typeMeta of schema.types) {
    assetsByType.set(typeMeta.id, []);
  }

  for (const asset of allAssets) {
    assetsByType.get(asset.type)?.push(asset);
  }

  for (const list of assetsByType.values()) {
    list.sort(byAssetName);
  }

  await mkdir(OUTPUT_TYPES, { recursive: true });
  await mkdir(OUTPUT_GROUPS, { recursive: true });

  const typeManifest = [];
  for (const typeMeta of schema.types) {
    const assets = assetsByType.get(typeMeta.id) || [];
    const relativePath = path.join("types", typeMeta.id);

    await writeJson(path.join(OUTPUT_ROOT, `${relativePath}.json`), {
      type: typeMeta.id,
      label: typeMeta.label,
      count: assets.length,
      assets,
    });

    typeManifest.push({
      id: typeMeta.id,
      label: typeMeta.label,
      count: assets.length,
      file: toRelativeFilePath(relativePath),
    });
  }

  const groupManifest = [];
  for (const group of schema.groups) {
    const mergedById = new Map();

    for (const type of group.types) {
      for (const asset of assetsByType.get(type) || []) {
        mergedById.set(String(asset.id), asset);
      }
    }

    const assets = Array.from(mergedById.values()).sort(byAssetName);
    const relativePath = path.join("groups", group.id);

    await writeJson(path.join(OUTPUT_ROOT, `${relativePath}.json`), {
      id: group.id,
      label: group.label,
      description: group.description,
      types: group.types,
      count: assets.length,
      assets,
    });

    groupManifest.push({
      id: group.id,
      label: group.label,
      description: group.description,
      types: group.types,
      count: assets.length,
      file: toRelativeFilePath(relativePath),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    datasetCollectedAt: dataset.collectedAt,
    totalAssets: allAssets.length,
    source: dataset.source,
    types: typeManifest,
    groups: groupManifest,
  };

  await writeJson(path.join(OUTPUT_ROOT, "manifest.json"), manifest);

  const localLibrary = await readJsonSafe(SOURCE_LOCAL_LIBRARY);
  if (localLibrary?.libraries && typeof localLibrary.libraries === "object") {
    const capabilityItems = {};

    for (const [gender, library] of Object.entries(localLibrary.libraries)) {
      const items = Array.isArray(library?.items) ? library.items : [];

      for (const item of items) {
        if (!item?.glbUrl) continue;

        const absoluteGlbPath = path.join(
          "public",
          item.glbUrl.replace(/^\/+local-assets\//, "local-assets/")
        );

        try {
          const meshes = await inspectGlbMeshes(absoluteGlbPath);
          capabilityItems[toCapabilityKey(gender, item.type, item.id)] = {
            meshes,
            hasBeard: meshes.includes("Wolf3D_Beard"),
            hasFacewear: meshes.includes("Wolf3D_Facewear"),
            hasGlasses: meshes.includes("Wolf3D_Glasses"),
            hasHair: meshes.includes("Wolf3D_Hair"),
            hasHeadwear: meshes.includes("Wolf3D_Headwear"),
            hasTop: meshes.includes("Wolf3D_Outfit_Top"),
            hasBottom: meshes.includes("Wolf3D_Outfit_Bottom"),
            hasFootwear: meshes.includes("Wolf3D_Outfit_Footwear"),
          };
        } catch {
          capabilityItems[toCapabilityKey(gender, item.type, item.id)] = {
            meshes: [],
            hasBeard: false,
            hasFacewear: false,
            hasGlasses: false,
            hasHair: false,
            hasHeadwear: false,
            hasTop: false,
            hasBottom: false,
            hasFootwear: false,
          };
        }
      }
    }

    await writeJson(OUTPUT_CAPABILITIES, {
      generatedAt: new Date().toISOString(),
      count: Object.keys(capabilityItems).length,
      items: capabilityItems,
    });
  }

  console.log(
    `[assets:build] generated manifest and ${typeManifest.length} type files + ${groupManifest.length} group files`
  );
  console.log(`[assets:build] total assets in schema: ${manifest.totalAssets}`);
};

main().catch((error) => {
  console.error("[assets:build] failed:", error);
  process.exitCode = 1;
});
