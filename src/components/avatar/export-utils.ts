import type { AppliedUvDecal, MeshSlot, SupportedType } from "./shared";
import {
  RPM_API_BASE,
  TYPE_TO_AVATAR_ASSET_KEY,
  getAppliedUvDecalsForMesh,
} from "./shared";
import {
  drawReplacementPatternFromImage,
  drawUvDecalOverlayToCanvas,
  readFileAsImage,
} from "./texture-utils";

export const createAnonymousUser = async (appName: string) => {
  const response = await fetch(`${RPM_API_BASE}/v1/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        appName,
        requestToken: true,
      },
    }),
  });
  const payload = await response.json();
  const token = payload?.data?.token as string | undefined;
  const userId = payload?.data?.id as string | undefined;
  if (!response.ok || !token || !userId) {
    throw new Error("Failed to create anonymous RPM user.");
  }
  return { token, userId };
};

export const createAvatarFromTemplate = async ({
  token,
  userId,
  templateId,
  appName,
}: {
  token: string;
  userId: string;
  templateId: string;
  appName: string;
}) => {
  const response = await fetch(`${RPM_API_BASE}/v2/avatars/templates/${templateId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      data: {
        partner: appName,
        bodyType: "fullbody",
        userId,
      },
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.data?.id) {
    throw new Error("Failed to create avatar from template.");
  }
  return payload.data as { id: string; assets: Record<string, string> };
};

const getAvatarExportUrl = (avatarId: string) => {
  const url = new URL(`${RPM_API_BASE}/v2/avatars/${avatarId}`);
  url.searchParams.set("responseType", "glb");
  url.searchParams.set("textureAtlas", "none");
  url.searchParams.set("textureFormat", "png");
  url.searchParams.set("lod", "0");
  url.searchParams.set("textureQuality", "medium");
  return url.toString();
};

export const applyAssetToAvatarAssets = ({
  type,
  assetId,
  baseAssets,
}: {
  type: SupportedType;
  assetId: string;
  baseAssets: Record<string, string>;
}) => {
  const next = { ...baseAssets };
  const mappedKey = TYPE_TO_AVATAR_ASSET_KEY[type];
  if (!mappedKey) {
    return next;
  }

  if (type === "top") {
    next.top = assetId;
    next.shirt = "";
    next.outfit = "";
    return next;
  }

  if (type === "bottom") {
    next.bottom = assetId;
    next.outfit = "";
    return next;
  }

  if (type === "footwear") {
    next.footwear = assetId;
    next.outfit = "";
    return next;
  }

  if (type === "outfit") {
    next.outfit = assetId;
    next.top = "";
    next.shirt = "";
    next.bottom = "";
    next.footwear = "";
    return next;
  }

  next[mappedKey] = assetId;
  return next;
};

export const patchAvatarGlb = async ({
  token,
  avatarId,
  assets,
}: {
  token: string;
  avatarId: string;
  assets: Record<string, string>;
}) => {
  const response = await fetch(getAvatarExportUrl(avatarId), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data: { assets } }),
  });
  if (!response.ok) {
    throw new Error(`RPM export failed: ${response.status}`);
  }
  return response.blob();
};

type GlbJson = {
  asset: { version: string };
  buffers?: Array<{ byteLength: number }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
  accessors?: Array<{ bufferView?: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
  textures?: Array<{
    source?: number;
    sampler?: number;
    name?: string;
    extensions?: Record<string, unknown>;
    extras?: Record<string, unknown>;
  }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorTexture?: {
        index: number;
        texCoord?: number;
        extensions?: {
          KHR_texture_transform?: {
            offset?: [number, number];
            scale?: [number, number];
            rotation?: number;
            texCoord?: number;
          };
        };
      };
    };
  }>;
  meshes?: Array<{ name?: string; primitives?: Array<{ material?: number }> }>;
  nodes?: Array<{ name?: string; mesh?: number }>;
};

type PrimitiveTarget = {
  meshIndex: number;
  primitiveIndex: number;
  materialIndex: number;
};

const dataUrlToUint8Array = (dataUrl: string) => {
  const [, encoded = ""] = dataUrl.split(",", 2);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const padTo4 = (value: number) => (value + 3) & ~3;

const getMimeFromImageDef = (image: { mimeType?: string }) =>
  image.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";

const encodeCanvas = (canvas: HTMLCanvasElement, mimeType: string) => {
  const dataUrl = canvas.toDataURL(mimeType === "image/jpeg" ? "image/jpeg" : "image/png");
  return dataUrlToUint8Array(dataUrl);
};

const parseGlb = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Invalid GLB header.");
  }

  let offset = 12;
  let jsonText = "";
  let binChunk = new Uint8Array();

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    offset += 4;
    const chunkType = view.getUint32(offset, true);
    offset += 4;
    const chunkData = buffer.slice(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === 0x4e4f534a) {
      jsonText = new TextDecoder().decode(chunkData);
    } else if (chunkType === 0x004e4942) {
      binChunk = new Uint8Array(chunkData);
    }
  }

  if (!jsonText) {
    throw new Error("GLB is missing JSON chunk.");
  }

  return {
    json: JSON.parse(jsonText.trim()) as GlbJson,
    binChunk,
  };
};

const collectPrimitiveTargetsForMeshes = (json: GlbJson, meshNames: readonly string[]) => {
  const wantedNames = new Set(meshNames);
  const primitiveTargets: PrimitiveTarget[] = [];

  for (const node of json.nodes || []) {
    if (!node.name || node.mesh == null || !wantedNames.has(node.name)) {
      continue;
    }

    const mesh = json.meshes?.[node.mesh];
    for (const [primitiveIndex, primitive] of (mesh?.primitives || []).entries()) {
      if (primitive.material != null) {
        primitiveTargets.push({
          meshIndex: node.mesh,
          primitiveIndex,
          materialIndex: primitive.material,
        });
      }
    }
  }

  return primitiveTargets;
};

const drawReplacementPattern = async ({
  canvas,
  textureUrl,
  scale,
  scaleX,
  scaleY,
  rotationDeg,
}: {
  canvas: HTMLCanvasElement;
  textureUrl: string;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
}) => {
  const image = await readFileAsImage(await fetch(textureUrl).then((response) => response.blob()));
  drawReplacementPatternFromImage({
    canvas,
    image,
    scale,
    scaleX,
    scaleY,
    rotationDeg,
  });
};

const extractImageBytes = ({
  json,
  binChunk,
  imageIndex,
}: {
  json: GlbJson;
  binChunk: Uint8Array;
  imageIndex: number;
}) => {
  const imageDef = json.images?.[imageIndex];
  if (!imageDef || imageDef.bufferView == null) {
    throw new Error(`Image ${imageIndex} is not embedded in GLB binary.`);
  }

  const bufferView = json.bufferViews?.[imageDef.bufferView];
  if (!bufferView) {
    throw new Error(`Buffer view ${imageDef.bufferView} is missing for image ${imageIndex}.`);
  }

  const byteOffset = bufferView.byteOffset || 0;
  const bytes = binChunk.slice(byteOffset, byteOffset + bufferView.byteLength);
  return {
    imageDef,
    bytes,
  };
};

const rebuildGlbWithModifiedImages = async ({
  sourceBlob,
  targetPrimitiveTargets,
  replacementTextureUrl,
  replaceTextureMeshes,
  replaceTextureScale,
  replaceTextureScaleX,
  replaceTextureScaleY,
  replaceTextureRotationDeg,
  appliedUvDecals,
}: {
  sourceBlob: Blob;
  targetPrimitiveTargets: PrimitiveTarget[];
  replacementTextureUrl: string | null;
  replaceTextureMeshes: readonly MeshSlot[];
  replaceTextureScale: number;
  replaceTextureScaleX: number;
  replaceTextureScaleY: number;
  replaceTextureRotationDeg: number;
  appliedUvDecals: readonly AppliedUvDecal[];
}) => {
  const buffer = await sourceBlob.arrayBuffer();
  const { json, binChunk } = parseGlb(buffer);
  if (targetPrimitiveTargets.length === 0) {
    return sourceBlob;
  }

  const bufferViews = (json.bufferViews || []).map((entry) => ({ ...entry }));
  const images = (json.images || []).map((entry) => ({ ...entry }));
  const textures = (json.textures || []).map((entry) => ({ ...entry }));
  const binaryChunks: Uint8Array[] = [];

  for (const bufferView of bufferViews) {
    const byteOffset = bufferView.byteOffset || 0;
    const sourceBytes = binChunk.slice(byteOffset, byteOffset + bufferView.byteLength);
    const padded = new Uint8Array(padTo4(sourceBytes.length));
    padded.set(sourceBytes);
    binaryChunks.push(padded);
  }

  const materials = (json.materials || []).map((entry) => ({
    ...entry,
    pbrMetallicRoughness: entry.pbrMetallicRoughness
      ? {
          ...entry.pbrMetallicRoughness,
          baseColorTexture: entry.pbrMetallicRoughness.baseColorTexture
            ? {
                ...entry.pbrMetallicRoughness.baseColorTexture,
                extensions: entry.pbrMetallicRoughness.baseColorTexture.extensions
                  ? {
                      ...entry.pbrMetallicRoughness.baseColorTexture.extensions,
                      KHR_texture_transform:
                        entry.pbrMetallicRoughness.baseColorTexture.extensions
                          .KHR_texture_transform
                          ? {
                              ...entry.pbrMetallicRoughness.baseColorTexture.extensions
                                  .KHR_texture_transform,
                            }
                          : undefined,
                    }
                  : undefined,
              }
            : undefined,
        }
      : undefined,
  }));
  const clonedMaterialIndexByTarget = new Map<string, number>();
  const appliedUvDecalsByMaterialIndex = new Map<number, AppliedUvDecal[]>();
  const shouldReplaceByMaterialIndex = new Map<number, boolean>();
  const replaceMeshSet = new Set(replaceTextureMeshes);

  for (const target of targetPrimitiveTargets) {
    const targetKey = `${target.meshIndex}:${target.primitiveIndex}:${target.materialIndex}`;
    let materialIndex = clonedMaterialIndexByTarget.get(targetKey);
    if (materialIndex == null) {
      const originalMaterial = materials[target.materialIndex];
      if (!originalMaterial) {
        continue;
      }

      materialIndex = materials.length;
      materials.push({
        ...originalMaterial,
        pbrMetallicRoughness: originalMaterial.pbrMetallicRoughness
          ? {
              ...originalMaterial.pbrMetallicRoughness,
              baseColorTexture: originalMaterial.pbrMetallicRoughness.baseColorTexture
                ? {
                    ...originalMaterial.pbrMetallicRoughness.baseColorTexture,
                    extensions: originalMaterial.pbrMetallicRoughness.baseColorTexture.extensions
                      ? {
                          ...originalMaterial.pbrMetallicRoughness.baseColorTexture.extensions,
                          KHR_texture_transform:
                            originalMaterial.pbrMetallicRoughness.baseColorTexture.extensions
                              .KHR_texture_transform
                              ? {
                                  ...originalMaterial.pbrMetallicRoughness.baseColorTexture
                                      .extensions.KHR_texture_transform,
                                }
                              : undefined,
                        }
                      : undefined,
                  }
                : undefined,
            }
          : undefined,
      });
      clonedMaterialIndexByTarget.set(targetKey, materialIndex);

      const meshDef = json.meshes?.[target.meshIndex];
      const meshName = meshDef?.name || "";
      appliedUvDecalsByMaterialIndex.set(
        materialIndex,
        getAppliedUvDecalsForMesh(appliedUvDecals, meshName)
      );
      shouldReplaceByMaterialIndex.set(materialIndex, replaceMeshSet.has(meshName as MeshSlot));
    }

    const primitive = json.meshes?.[target.meshIndex]?.primitives?.[target.primitiveIndex];
    if (primitive) {
      primitive.material = materialIndex;
    }
  }

  for (const materialIndex of clonedMaterialIndexByTarget.values()) {
    const textureInfo = materials[materialIndex]?.pbrMetallicRoughness?.baseColorTexture;
    const textureIndex = textureInfo?.index;
    const imageIndex = textureIndex != null ? textures[textureIndex]?.source : undefined;
    if (!textureInfo || textureIndex == null || imageIndex == null) {
      continue;
    }

    const { imageDef, bytes } = extractImageBytes({ json, binChunk, imageIndex });
    const originalBlob = new Blob([bytes], { type: getMimeFromImageDef(imageDef) });
    const originalImage = await readFileAsImage(originalBlob);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, originalImage.naturalWidth || originalImage.width);
    canvas.height = Math.max(1, originalImage.naturalHeight || originalImage.height);

    const shouldReplaceTexture = Boolean(
      replacementTextureUrl && shouldReplaceByMaterialIndex.get(materialIndex)
    );
    if (shouldReplaceTexture) {
      await drawReplacementPattern({
        canvas,
        textureUrl: replacementTextureUrl || "",
        scale: replaceTextureScale,
        scaleX: replaceTextureScaleX,
        scaleY: replaceTextureScaleY,
        rotationDeg: replaceTextureRotationDeg,
      });
    } else {
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
      }
    }

    for (const appliedUvDecal of appliedUvDecalsByMaterialIndex.get(materialIndex) || []) {
      const decalImage = await readFileAsImage(
        await fetch(appliedUvDecal.textureUrl).then((response) => response.blob())
      );
      drawUvDecalOverlayToCanvas({
        canvas,
        decalImage,
        uv: appliedUvDecal.uv,
        scale: appliedUvDecal.scale,
        scaleX: appliedUvDecal.scaleX,
        scaleY: appliedUvDecal.scaleY,
        rotationDeg: appliedUvDecal.rotationDeg,
      });
    }

    const encodedBytes = encodeCanvas(canvas, getMimeFromImageDef(imageDef));
    const padded = new Uint8Array(padTo4(encodedBytes.length));
    padded.set(encodedBytes);

    const newBufferViewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteLength: encodedBytes.length,
    });
    binaryChunks.push(padded);

    const newImageIndex = images.length;
    images.push({
      mimeType: imageDef.mimeType,
      bufferView: newBufferViewIndex,
    });

    const newTextureIndex = textures.length;
    const originalTexture = textures[textureIndex] || {};
    textures.push({
      ...originalTexture,
      source: newImageIndex,
    });

    textureInfo.index = newTextureIndex;
    textureInfo.texCoord = 0;
    if (textureInfo.extensions?.KHR_texture_transform) {
      textureInfo.extensions.KHR_texture_transform = {
        offset: [0, 0],
        scale: [1, 1],
        rotation: 0,
        texCoord: 0,
      };
    }
  }

  const nextChunks: Uint8Array[] = [];
  let nextOffset = 0;

  for (let index = 0; index < bufferViews.length; index += 1) {
    const bufferView = bufferViews[index];
    const sourceBytes = binaryChunks[index] || new Uint8Array();
    const padded = new Uint8Array(padTo4(sourceBytes.length));
    padded.set(sourceBytes);
    bufferView.byteOffset = nextOffset;
    bufferView.byteLength = sourceBytes.length;
    nextChunks.push(padded);
    nextOffset += padded.length;
  }

  if (!json.buffers?.length) {
    json.buffers = [{ byteLength: nextOffset }];
  } else {
    json.buffers[0].byteLength = nextOffset;
  }
  json.materials = materials;
  json.bufferViews = bufferViews;
  json.images = images;
  json.textures = textures;

  const binData = new Uint8Array(nextOffset);
  let cursor = 0;
  for (const chunk of nextChunks) {
    binData.set(chunk, cursor);
    cursor += chunk.length;
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedJson = new Uint8Array(padTo4(jsonBytes.length));
  paddedJson.set(jsonBytes);
  for (let index = jsonBytes.length; index < paddedJson.length; index += 1) {
    paddedJson[index] = 0x20;
  }

  const totalLength = 12 + 8 + paddedJson.length + 8 + binData.length;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedJson.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(paddedJson, 20);
  const binHeaderOffset = 20 + paddedJson.length;
  view.setUint32(binHeaderOffset, binData.length, true);
  view.setUint32(binHeaderOffset + 4, 0x004e4942, true);
  glb.set(binData, binHeaderOffset + 8);

  return new Blob([glb], { type: "model/gltf-binary" });
};

export const postProcessExportedAvatarBlob = async ({
  sourceBlob,
  replaceTextureUrl,
  replaceTextureMeshes,
  replaceTextureScale,
  replaceTextureScaleX,
  replaceTextureScaleY,
  replaceTextureRotationDeg,
  appliedUvDecals,
}: {
  sourceBlob: Blob;
  replaceTextureUrl: string | null;
  replaceTextureMeshes: readonly MeshSlot[];
  replaceTextureScale: number;
  replaceTextureScaleX: number;
  replaceTextureScaleY: number;
  replaceTextureRotationDeg: number;
  appliedUvDecals: readonly AppliedUvDecal[];
}) => {
  const needsTexture = Boolean(replaceTextureUrl && replaceTextureMeshes.length > 0);
  const needsDecal = appliedUvDecals.length > 0;
  if (!needsTexture && !needsDecal) {
    return sourceBlob;
  }

  const buffer = await sourceBlob.arrayBuffer();
  const { json } = parseGlb(buffer);
  const replacementPrimitiveTargets = needsTexture
    ? collectPrimitiveTargetsForMeshes(json, replaceTextureMeshes)
    : [];
  const decalMeshNames = Array.from(new Set(appliedUvDecals.map((entry) => entry.meshName)));
  const decalPrimitiveTargets = needsDecal
    ? collectPrimitiveTargetsForMeshes(json, decalMeshNames)
    : [];
  const targetPrimitiveTargets = Array.from(
    new Map(
      [...replacementPrimitiveTargets, ...decalPrimitiveTargets].map((target) => [
        `${target.meshIndex}:${target.primitiveIndex}:${target.materialIndex}`,
        target,
      ])
    ).values()
  );

  return rebuildGlbWithModifiedImages({
    sourceBlob,
    targetPrimitiveTargets,
    replacementTextureUrl: needsTexture ? replaceTextureUrl : null,
    replaceTextureMeshes: needsTexture ? replaceTextureMeshes : [],
    replaceTextureScale,
    replaceTextureScaleX,
    replaceTextureScaleY,
    replaceTextureRotationDeg,
    appliedUvDecals: needsDecal ? appliedUvDecals : [],
  });
};
