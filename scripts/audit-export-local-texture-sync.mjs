import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "src", "data", "generated", "local-library-manifest.json");
const capabilityPath = path.join(
  repoRoot,
  "src",
  "data",
  "generated",
  "local-asset-capabilities.json"
);

const SLOT_NAMES = {
  body: "Wolf3D_Body",
  head: "Wolf3D_Head",
  teeth: "Wolf3D_Teeth",
  hair: "Wolf3D_Hair",
  beard: "Wolf3D_Beard",
  glasses: "Wolf3D_Glasses",
  headwear: "Wolf3D_Headwear",
  facewear: "Wolf3D_Facewear",
  faceMask: "Wolf3D_FaceMask",
  top: "Wolf3D_Outfit_Top",
  bottom: "Wolf3D_Outfit_Bottom",
  footwear: "Wolf3D_Outfit_Footwear",
  eyeLeft: "EyeLeft",
  eyeRight: "EyeRight",
};

const FACIAL_FEATURE_TYPES = new Set([
  "faceshape",
  "eyeshape",
  "eyebrows",
  "noseshape",
  "lipshape",
]);

const normalizeMeshName = (value) =>
  value.trim().replace(/\.+$/, "").replace(/\.\d+$/, "");

const LOCAL_MESH_NAME_ALIASES = {
  [SLOT_NAMES.hair]: ["hair-60", "low"],
  [SLOT_NAMES.top]: ["Mesh.009", "Mesh"],
  [SLOT_NAMES.headwear]: ["Mesh.003", "Mesh"],
};

const parseGlb = (buffer) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Invalid GLB header.");
  }

  let offset = 12;
  let jsonText = "";

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    offset += 4;
    const chunkType = view.getUint32(offset, true);
    offset += 4;
    const chunkData = buffer.subarray(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === 0x4e4f534a) {
      jsonText = new TextDecoder().decode(chunkData).trim();
    }
  }

  if (!jsonText) {
    throw new Error("GLB is missing JSON chunk.");
  }

  return JSON.parse(jsonText);
};

const resolveLocalNodeForMesh = (json, meshName) => {
  const nodes = (json.nodes || []).filter(
    (entry) => Boolean(entry?.name) && entry?.mesh != null
  );
  if (!nodes.length) {
    return null;
  }

  const exactMatch = nodes.find((entry) => entry.name === meshName);
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedTargetName = normalizeMeshName(meshName);
  const normalizedMatch = nodes.find(
    (entry) => normalizeMeshName(entry.name) === normalizedTargetName
  );
  if (normalizedMatch) {
    return normalizedMatch;
  }

  const slotAliases = LOCAL_MESH_NAME_ALIASES[meshName] || [];
  for (const alias of slotAliases) {
    const aliasMatch = nodes.find(
      (entry) =>
        entry.name === alias || normalizeMeshName(entry.name) === normalizeMeshName(alias)
    );
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  if (meshName === SLOT_NAMES.top || meshName === SLOT_NAMES.headwear) {
    return nodes.find((entry) => normalizeMeshName(entry.name) === "Mesh") || null;
  }

  return null;
};

const toAbsolutePublicPath = (assetUrl) =>
  path.join(repoRoot, "public", assetUrl.replace(/^\//, ""));

const getLibraryCandidateSlots = (item, capability) => {
  const meshes = capability?.meshes || [];
  const normalizedMeshes = new Set(meshes.map((entry) => normalizeMeshName(entry)));
  const hasMeshForSlot = (slot) => {
    if (normalizedMeshes.has(normalizeMeshName(slot))) {
      return true;
    }

    for (const alias of LOCAL_MESH_NAME_ALIASES[slot] || []) {
      if (normalizedMeshes.has(normalizeMeshName(alias))) {
        return true;
      }
    }

    return false;
  };

  switch (item.type) {
    case "top":
      return {
        expected: [SLOT_NAMES.top],
        required: hasMeshForSlot(SLOT_NAMES.top) ? [SLOT_NAMES.top] : [],
        optional: [],
      };
    case "bottom":
      return {
        expected: [SLOT_NAMES.bottom],
        required: hasMeshForSlot(SLOT_NAMES.bottom) ? [SLOT_NAMES.bottom] : [],
        optional: [],
      };
    case "footwear":
      return {
        expected: [SLOT_NAMES.footwear],
        required: hasMeshForSlot(SLOT_NAMES.footwear) ? [SLOT_NAMES.footwear] : [],
        optional: [],
      };
    case "outfit":
      return {
        expected: [SLOT_NAMES.top, SLOT_NAMES.bottom, SLOT_NAMES.footwear],
        required: [SLOT_NAMES.top, SLOT_NAMES.bottom, SLOT_NAMES.footwear].filter(hasMeshForSlot),
        optional: [],
      };
    case "hair":
      return {
        expected: [SLOT_NAMES.hair],
        required: hasMeshForSlot(SLOT_NAMES.hair) ? [SLOT_NAMES.hair] : [],
        optional: [],
      };
    case "eye":
      return {
        expected: [SLOT_NAMES.eyeLeft, SLOT_NAMES.eyeRight],
        required: [SLOT_NAMES.eyeLeft, SLOT_NAMES.eyeRight].filter(hasMeshForSlot),
        optional: [],
      };
    case "glasses":
      return {
        expected: [SLOT_NAMES.glasses],
        required: hasMeshForSlot(SLOT_NAMES.glasses) ? [SLOT_NAMES.glasses] : [],
        optional: [],
      };
    case "headwear":
      return {
        expected: [SLOT_NAMES.headwear],
        required: hasMeshForSlot(SLOT_NAMES.headwear) ? [SLOT_NAMES.headwear] : [],
        optional: hasMeshForSlot(SLOT_NAMES.hair) ? [SLOT_NAMES.hair] : [],
      };
    case "beard":
      return {
        expected: [
          SLOT_NAMES.head,
          ...(capability?.hasBeard ? [SLOT_NAMES.beard] : []),
          ...(capability?.hasFacewear && !capability?.hasBeard ? [SLOT_NAMES.facewear] : []),
        ],
        required: [
          SLOT_NAMES.head,
          ...(capability?.hasBeard ? [SLOT_NAMES.beard] : []),
          ...(capability?.hasFacewear && !capability?.hasBeard ? [SLOT_NAMES.facewear] : []),
        ].filter(hasMeshForSlot),
        optional: [],
      };
    case "facewear":
      return {
        expected: [SLOT_NAMES.facewear],
        required: hasMeshForSlot(SLOT_NAMES.facewear) ? [SLOT_NAMES.facewear] : [],
        optional: hasMeshForSlot(SLOT_NAMES.head) ? [SLOT_NAMES.head] : [],
      };
    case "facemask":
      return {
        expected: [SLOT_NAMES.head],
        required: hasMeshForSlot(SLOT_NAMES.head) ? [SLOT_NAMES.head] : [],
        optional: [],
      };
    default:
      if (FACIAL_FEATURE_TYPES.has(item.type)) {
        return {
          expected: [
            ...(capability?.meshes?.includes(SLOT_NAMES.head) ? [SLOT_NAMES.head] : []),
            ...(
              capability?.meshes?.includes(SLOT_NAMES.eyeLeft) &&
              capability?.meshes?.includes(SLOT_NAMES.eyeRight)
                ? [SLOT_NAMES.eyeLeft, SLOT_NAMES.eyeRight]
                : []
            ),
          ],
          required: [
            ...(capability?.meshes?.includes(SLOT_NAMES.head) ? [SLOT_NAMES.head] : []),
            ...(
              capability?.meshes?.includes(SLOT_NAMES.eyeLeft) &&
              capability?.meshes?.includes(SLOT_NAMES.eyeRight)
                ? [SLOT_NAMES.eyeLeft, SLOT_NAMES.eyeRight]
                : []
            ),
          ],
          optional: [],
        };
      }

      return {
        expected: [],
        required: [],
        optional: [],
      };
  }
};

const auditGlb = async ({
  kind,
  id,
  gender,
  label,
  absolutePath,
  expectedSlots,
  requiredSlots,
  optionalSlots,
}) => {
  const buffer = await fs.readFile(absolutePath);
  const json = parseGlb(buffer);

  const requiredResults = requiredSlots.map((slot) => ({
    slot,
    resolvedNodeName: resolveLocalNodeForMesh(json, slot)?.name || null,
  }));
  const optionalResults = optionalSlots.map((slot) => ({
    slot,
    resolvedNodeName: resolveLocalNodeForMesh(json, slot)?.name || null,
  }));
  const structuralGaps = expectedSlots.filter(
    (slot) => !requiredSlots.includes(slot) && !optionalSlots.includes(slot)
  );

  return {
    kind,
    id,
    gender,
    label,
    file: path.relative(repoRoot, absolutePath),
    requiredResults,
    optionalResults,
    structuralGaps,
    missingRequired: requiredResults.filter((entry) => !entry.resolvedNodeName),
  };
};

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const capabilities = JSON.parse(await fs.readFile(capabilityPath, "utf8")).items || {};

const audits = [];

for (const gender of ["male", "female"]) {
  for (const preset of manifest.presets?.[gender]?.items || []) {
    if (!preset.baseModelUrl) {
      continue;
    }

    const requiredSlots = [
      SLOT_NAMES.body,
      SLOT_NAMES.head,
      SLOT_NAMES.teeth,
      SLOT_NAMES.top,
      SLOT_NAMES.bottom,
      SLOT_NAMES.footwear,
      SLOT_NAMES.eyeLeft,
      SLOT_NAMES.eyeRight,
    ];
    const optionalSlots = [
      SLOT_NAMES.hair,
      SLOT_NAMES.glasses,
      SLOT_NAMES.beard,
      SLOT_NAMES.headwear,
      SLOT_NAMES.facewear,
    ];

    audits.push(
      await auditGlb({
        kind: "preset",
        id: preset.id,
        gender,
        label: `${gender}:${preset.id}`,
        absolutePath: toAbsolutePublicPath(preset.baseModelUrl),
        expectedSlots: [...requiredSlots, ...optionalSlots],
        requiredSlots,
        optionalSlots,
      })
    );
  }

  for (const item of manifest.libraries?.[gender]?.items || []) {
    if (!item.glbUrl || item.error) {
      continue;
    }

    const capability = capabilities[`${gender}:${item.type}:${item.id}`] || null;
    const { expected, required, optional } = getLibraryCandidateSlots(item, capability);
    if (!expected.length && !required.length && !optional.length) {
      continue;
    }

    audits.push(
      await auditGlb({
        kind: "asset",
        id: item.id,
        gender,
        label: `${gender}:${item.type}:${item.id}:${item.name}`,
        absolutePath: toAbsolutePublicPath(item.glbUrl),
        expectedSlots: expected,
        requiredSlots: required,
        optionalSlots: optional,
      })
    );
  }
}

const failures = audits.filter((entry) => entry.missingRequired.length > 0);
const structuralGaps = audits.filter((entry) => entry.structuralGaps.length > 0);

console.log(
  JSON.stringify(
    {
      checked: audits.length,
      failed: failures.length,
      structuralGapCount: structuralGaps.length,
      failedEntries: failures,
      structuralGapEntries: structuralGaps,
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exitCode = 1;
}
