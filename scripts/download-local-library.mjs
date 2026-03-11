import {
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_APP_NAME,
  PRESET_SPECS,
  SUPPORTED_GENDERS,
  SUPPORTED_TYPES,
} from "./library-config.mjs";

const DATASET_PATH = path.join("src", "data", "assets-catalog.json");
const OUTPUT_ROOT = path.join("public", "local-assets");
const OUTPUT_GLB_ROOT = path.join(OUTPUT_ROOT, "glb");
const OUTPUT_ICON_ROOT = path.join(OUTPUT_ROOT, "icons");
const OUTPUT_BASE_ROOT = path.join(OUTPUT_ROOT, "base");
const OUTPUT_PRESET_ROOT = path.join(OUTPUT_ROOT, "presets");
const MANIFEST_PATH = path.join(
  "src",
  "data",
  "generated",
  "local-library-manifest.json"
);

const API_BASE = "https://api.readyplayer.me";

const TYPE_TO_AVATAR_ASSET_KEY = {
  top: "top",
  bottom: "bottom",
  footwear: "footwear",
  outfit: "outfit",
  hair: "hairStyle",
  eye: "eyeColor",
  eyeshape: "eyeStyle",
  eyebrows: "eyebrowStyle",
  faceshape: "faceShape",
  noseshape: "noseShape",
  lipshape: "lipShape",
  glasses: "glasses",
  headwear: "headwear",
  beard: "beardStyle",
  facewear: "facewear",
};

const LEGACY_DEFAULT_BASE = path.join(OUTPUT_BASE_ROOT, "default.glb");

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const readArg = (name, fallback = null) => {
  const prefix = `${name}=`;
  const found = args.find((value) => value.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureDir = async (targetPath) => {
  await mkdir(targetPath, { recursive: true });
};

const fileExists = async (targetPath) => {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

const readJson = async (targetPath) => {
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw);
};

const readJsonSafe = async (targetPath) => {
  try {
    return await readJson(targetPath);
  } catch {
    return null;
  }
};

const writeJson = async (targetPath, payload) => {
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const makeRequest = async (url, init = {}, retries = 5) => {
  let attempt = 0;

  while (attempt < retries) {
    attempt += 1;

    try {
      const response = await fetch(url, init);

      if (response.ok) {
        return response;
      }

      const details = await response.text();
      const retryable = response.status >= 500 || response.status === 429;
      if (!retryable || attempt >= retries) {
        throw new Error(
          `[${response.status}] ${init.method || "GET"} ${url} failed: ${details}`
        );
      }

      const backoff = attempt * 1100;
      console.warn(
        `Request failed (${response.status}). Retry ${attempt}/${retries} in ${backoff}ms.`
      );
      await sleep(backoff);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }

      const backoff = attempt * 1100;
      console.warn(
        `Request threw on attempt ${attempt}/${retries}. Retry in ${backoff}ms.`
      );
      console.warn(error instanceof Error ? error.message : String(error));
      await sleep(backoff);
    }
  }

  throw new Error(`Request failed: ${init.method || "GET"} ${url}`);
};

const postJson = async (url, payload, headers = {}) => {
  const response = await makeRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  return response.json();
};

const patchGlb = async (url, payload, headers = {}) => {
  const response = await makeRequest(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const getJson = async (url, headers = {}) => {
  const response = await makeRequest(url, {
    method: "GET",
    headers,
  });

  return response.json();
};

const parseExtensionFromUrl = (value) => {
  try {
    const pathname = new URL(value).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext) return ext;
  } catch {
    // Ignore malformed URL and fallback to .png.
  }
  return ".png";
};

const createAnonymousUser = async (appName) => {
  const response = await postJson(`${API_BASE}/v1/users`, {
    data: {
      appName,
      requestToken: true,
    },
  });

  const token = response?.data?.token;
  const userId = response?.data?.id;
  if (!token || !userId) {
    throw new Error("Failed to create anonymous RPM user with token.");
  }

  return { token, userId };
};

const getTemplates = async (token) =>
  getJson(`${API_BASE}/v2/avatars/templates?bodyType=fullbody`, {
    Authorization: `Bearer ${token}`,
  });

const createAvatarFromTemplate = async ({ token, userId, templateId, appName }) =>
  postJson(
    `${API_BASE}/v2/avatars/templates/${templateId}`,
    {
      data: {
        partner: appName,
        bodyType: "fullbody",
        userId,
      },
    },
    {
      Authorization: `Bearer ${token}`,
    }
  );

const getExportUrl = (avatarId) => {
  const url = new URL(`${API_BASE}/v2/avatars/${avatarId}`);
  url.searchParams.set("responseType", "glb");
  url.searchParams.set("textureAtlas", "none");
  url.searchParams.set("textureFormat", "webp");
  url.searchParams.set("lod", "0");
  url.searchParams.set("textureQuality", "medium");
  return url.toString();
};

const applyAssetToAvatarAssets = ({ type, assetId, baseAssets }) => {
  const next = { ...baseAssets };
  const mappedKey = TYPE_TO_AVATAR_ASSET_KEY[type];
  if (!mappedKey) {
    throw new Error(`Unsupported type: ${type}`);
  }

  if (type === "top") {
    next.top = String(assetId);
    next.shirt = "";
    next.outfit = "";
    return next;
  }

  if (type === "bottom") {
    next.bottom = String(assetId);
    next.outfit = "";
    return next;
  }

  if (type === "footwear") {
    next.footwear = String(assetId);
    next.outfit = "";
    return next;
  }

  if (type === "outfit") {
    next.outfit = String(assetId);
    next.top = "";
    next.shirt = "";
    next.bottom = "";
    next.footwear = "";
    return next;
  }

  if (type === "hair") {
    next.hairStyle = String(assetId);
    return next;
  }

  if (type === "eye") {
    next.eyeColor = String(assetId);
    return next;
  }

  if (type === "eyeshape") {
    next.eyeStyle = String(assetId);
    return next;
  }

  if (type === "eyebrows") {
    next.eyebrowStyle = String(assetId);
    return next;
  }

  if (type === "faceshape") {
    next.faceShape = String(assetId);
    return next;
  }

  if (type === "noseshape") {
    next.noseShape = String(assetId);
    return next;
  }

  if (type === "lipshape") {
    next.lipShape = String(assetId);
    return next;
  }

  if (type === "beard") {
    next.beardStyle = String(assetId);
    return next;
  }

  if (type === "facewear") {
    next.facewear = String(assetId);
    return next;
  }

  next[mappedKey] = String(assetId);
  return next;
};

const downloadBinary = async ({ url, targetPath, force }) => {
  if (!url) return null;
  if (!force && (await fileExists(targetPath))) {
    return targetPath;
  }

  const response = await makeRequest(url, { method: "GET" });
  const buffer = Buffer.from(await response.arrayBuffer());
  await ensureDir(path.dirname(targetPath));
  await writeFile(targetPath, buffer);
  return targetPath;
};

const getTemplateImageName = (template) => {
  const sourceUrl = template?.imageUrl || template?.iconUrl || "";

  try {
    return path.basename(new URL(sourceUrl).pathname);
  } catch {
    return "";
  }
};

const selectPresetTemplates = (templates, gender) => {
  const candidates = (templates || []).filter((template) => template.gender === gender);
  const selected = [];
  const used = new Set();

  for (const presetSpec of PRESET_SPECS[gender] || []) {
    const match = candidates.find(
      (template) =>
        !used.has(template.id) && getTemplateImageName(template) === presetSpec.imageHint
    );

    if (!match) continue;
    used.add(match.id);
    selected.push({
      ...presetSpec,
      templateId: match.id,
      previewSourceUrl: match.imageUrl || match.iconUrl || null,
    });
  }

  for (const template of candidates) {
    if (selected.length >= (PRESET_SPECS[gender] || []).length) {
      break;
    }

    if (used.has(template.id)) {
      continue;
    }

    const presetSpec = PRESET_SPECS[gender][selected.length];
    used.add(template.id);
    selected.push({
      ...presetSpec,
      templateId: template.id,
      previewSourceUrl: template.imageUrl || template.iconUrl || null,
    });
  }

  return selected;
};

const getLibraryLookupKey = (gender, type, id) =>
  `${String(gender)}:${String(type)}:${String(id)}`;

const buildExistingItemMap = (existingManifest) => {
  const map = new Map();
  const libraries = existingManifest?.libraries || {};

  for (const [gender, library] of Object.entries(libraries)) {
    const items = Array.isArray(library?.items) ? library.items : [];
    for (const item of items) {
      map.set(getLibraryLookupKey(gender, item.type, item.id), item);
    }
  }

  return map;
};

const getGenderAssetPath = ({ gender, type, fileId }) =>
  path.join(OUTPUT_GLB_ROOT, gender, type, `${fileId}.glb`);

const getGenderAssetUrl = ({ gender, type, fileId }) =>
  `/local-assets/glb/${gender}/${type}/${fileId}.glb`;

const getLegacyMaleAssetPath = ({ type, fileId }) =>
  path.join(OUTPUT_GLB_ROOT, type, `${fileId}.glb`);

const getSharedIconPath = ({ type, fileId, ext }) =>
  path.join(OUTPUT_ICON_ROOT, type, `${fileId}${ext}`);

const getSharedIconUrl = ({ type, fileId, ext }) =>
  `/local-assets/icons/${type}/${fileId}${ext}`;

const getPresetBasePath = ({ gender, presetId }) =>
  path.join(OUTPUT_BASE_ROOT, gender, `${presetId}.glb`);

const getPresetBaseUrl = ({ gender, presetId }) =>
  `/local-assets/base/${gender}/${presetId}.glb`;

const getPresetPreviewPath = ({ gender, presetId, ext }) =>
  path.join(OUTPUT_PRESET_ROOT, gender, `${presetId}${ext}`);

const getPresetPreviewUrl = ({ gender, presetId, ext }) =>
  `/local-assets/presets/${gender}/${presetId}${ext}`;

const createAvatarSession = async ({ token, userId, templateId, appName }) => {
  const avatarResponse = await createAvatarFromTemplate({
    token,
    userId,
    templateId,
    appName,
  });

  const avatarId = avatarResponse?.data?.id;
  const baseAssets = avatarResponse?.data?.assets || {};
  if (!avatarId) {
    throw new Error(`Failed to create avatar from template ${templateId}.`);
  }

  return {
    avatarId,
    baseAssets,
    exportUrl: getExportUrl(avatarId),
  };
};

const savePresetBase = async ({ session, token, targetPath }) => {
  await ensureDir(path.dirname(targetPath));

  const glbBuffer = await patchGlb(
    session.exportUrl,
    { data: { assets: session.baseAssets } },
    { Authorization: `Bearer ${token}` }
  );

  await writeFile(targetPath, glbBuffer);
};

const main = async () => {
  const appName = readArg("--app-name", DEFAULT_APP_NAME);
  const wantedType = readArg("--type", "").trim().toLowerCase();
  const wantedIdsRaw = readArg("--id", "").trim();
  const limitRaw = readArg("--limit", "");
  const force = hasFlag("--force");
  const skipIcons = hasFlag("--skip-icons");
  const genderArg = readArg("--gender", "male,female");

  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit value: ${limitRaw}`);
  }

  const requestedGenders = genderArg
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const genders = requestedGenders.length
    ? requestedGenders.filter((gender) => SUPPORTED_GENDERS.includes(gender))
    : [...SUPPORTED_GENDERS];

  if (genders.length === 0) {
    throw new Error(`Unknown --gender value: ${genderArg}`);
  }

  const wantedIds = new Set(
    wantedIdsRaw
      ? wantedIdsRaw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : []
  );

  if (wantedType && !SUPPORTED_TYPES.includes(wantedType)) {
    throw new Error(`Unknown --type value: ${wantedType}`);
  }

  const dataset = await readJson(DATASET_PATH);
  const sourceAssets = dataset.assets.filter((asset) => SUPPORTED_TYPES.includes(asset.type));
  if (sourceAssets.length === 0) {
    throw new Error(
      `No supported assets found in dataset ${DATASET_PATH}. Run yarn assets:sync-catalog first.`
    );
  }

  await ensureDir(OUTPUT_ROOT);
  await ensureDir(OUTPUT_GLB_ROOT);
  await ensureDir(OUTPUT_ICON_ROOT);
  await ensureDir(OUTPUT_BASE_ROOT);
  await ensureDir(OUTPUT_PRESET_ROOT);
  await ensureDir(path.dirname(MANIFEST_PATH));

  const existingManifest = await readJsonSafe(MANIFEST_PATH);
  const existingItemsByKey = buildExistingItemMap(existingManifest);
  const nextLibraries = { ...(existingManifest?.libraries || {}) };
  const nextPresets = { ...(existingManifest?.presets || {}) };

  console.log(`Catalog assets: ${sourceAssets.length}`);
  console.log(`Requested genders: ${genders.join(", ")}`);
  console.log(`Type filter: ${wantedType || "all"}`);
  console.log(`Output root: ${OUTPUT_ROOT}`);

  const { token, userId } = await createAnonymousUser(appName);
  console.log(`Created RPM user: ${userId}`);

  const templatesResponse = await getTemplates(token);
  const templates = templatesResponse?.data || [];
  if (templates.length === 0) {
    throw new Error("No avatar templates returned from API.");
  }

  const defaultSessionsByGender = new Map();

  for (const gender of genders) {
    const presetTemplates = selectPresetTemplates(templates, gender);
    if (presetTemplates.length === 0) {
      throw new Error(`No templates resolved for gender ${gender}.`);
    }

    const defaultPreset = presetTemplates[0];
    const defaultSession = await createAvatarSession({
      token,
      userId,
      templateId: defaultPreset.templateId,
      appName,
    });
    defaultSessionsByGender.set(gender, defaultSession);

    const presetManifestItems = [];

    for (const preset of presetTemplates) {
      const previewExt = preset.previewSourceUrl
        ? parseExtensionFromUrl(preset.previewSourceUrl)
        : ".png";
      const previewPath = getPresetPreviewPath({
        gender,
        presetId: preset.id,
        ext: previewExt,
      });
      const basePath = getPresetBasePath({ gender, presetId: preset.id });

      if (preset.previewSourceUrl) {
        await downloadBinary({
          url: preset.previewSourceUrl,
          targetPath: previewPath,
          force,
        });
      }

      if (preset.id === "preset-1" && gender === "male") {
        if (force || !(await fileExists(basePath))) {
          if (!force && (await fileExists(LEGACY_DEFAULT_BASE))) {
            await ensureDir(path.dirname(basePath));
            await copyFile(LEGACY_DEFAULT_BASE, basePath);
          } else {
            await savePresetBase({
              session: defaultSession,
              token,
              targetPath: basePath,
            });
          }
        }
      } else if (force || !(await fileExists(basePath))) {
        if (preset.id === "preset-1") {
          await savePresetBase({
            session: defaultSession,
            token,
            targetPath: basePath,
          });
        } else {
          const presetSession = await createAvatarSession({
            token,
            userId,
            templateId: preset.templateId,
            appName,
          });
          await savePresetBase({
            session: presetSession,
            token,
            targetPath: basePath,
          });
        }
      }

      presetManifestItems.push({
        id: preset.id,
        label: preset.label,
        gender,
        templateId: preset.templateId,
        baseModelUrl: getPresetBaseUrl({ gender, presetId: preset.id }),
        previewUrl: preset.previewSourceUrl
          ? getPresetPreviewUrl({
              gender,
              presetId: preset.id,
              ext: previewExt,
            })
          : null,
      });
    }

    nextPresets[gender] = {
      defaultPresetId: "preset-1",
      items: presetManifestItems,
    };
  }

  for (const gender of genders) {
    const filteredAssets = sourceAssets
      .filter((asset) => asset.gender === "neutral" || asset.gender === gender)
      .filter((asset) => !wantedType || asset.type === wantedType)
      .filter((asset) => wantedIds.size === 0 || wantedIds.has(String(asset.id)));

    const assetsToProcess = limit ? filteredAssets.slice(0, limit) : filteredAssets;
    const defaultSession = defaultSessionsByGender.get(gender);
    if (!defaultSession) {
      throw new Error(`Missing default avatar session for gender ${gender}.`);
    }

    console.log(`Processing ${gender}: ${assetsToProcess.length} assets`);

    const manifestItems = [];
    let downloadedInRun = 0;

    for (let index = 0; index < assetsToProcess.length; index += 1) {
      const asset = assetsToProcess[index];
      const id = String(asset.id);
      const type = String(asset.type);
      const fileId = encodeURIComponent(id);
      const itemKey = getLibraryLookupKey(gender, type, id);

      const glbPath = getGenderAssetPath({ gender, type, fileId });
      const glbUrl = getGenderAssetUrl({ gender, type, fileId });
      const legacyGlbPath = getLegacyMaleAssetPath({ type, fileId });

      const iconExt = asset.iconUrl ? parseExtensionFromUrl(asset.iconUrl) : ".png";
      const iconPath = getSharedIconPath({ type, fileId, ext: iconExt });

      await ensureDir(path.dirname(glbPath));
      await ensureDir(path.dirname(iconPath));

      const previousItem = existingItemsByKey.get(itemKey) || null;
      const manifestEntry = {
        id,
        name: String(asset.name || ""),
        type,
        gender: asset.gender || null,
        bodyType: asset.bodyType || null,
        fileId,
        glbUrl,
        iconUrl: null,
        sourceIconUrl: asset.iconUrl || null,
        downloadedAt: previousItem?.downloadedAt || null,
        error: null,
      };

      if (await fileExists(iconPath)) {
        manifestEntry.iconUrl = getSharedIconUrl({ type, fileId, ext: iconExt });
      } else if (previousItem?.iconUrl) {
        manifestEntry.iconUrl = previousItem.iconUrl;
      }

      const progressLabel = `[${gender} ${index + 1}/${assetsToProcess.length}] ${type}:${id}`;

      try {
        if (force || !(await fileExists(glbPath))) {
          if (
            gender === "male" &&
            !force &&
            (await fileExists(legacyGlbPath)) &&
            !(await fileExists(glbPath))
          ) {
            await copyFile(legacyGlbPath, glbPath);
          } else {
            const nextAssets = applyAssetToAvatarAssets({
              type,
              assetId: id,
              baseAssets: defaultSession.baseAssets,
            });

            const glbBuffer = await patchGlb(
              defaultSession.exportUrl,
              { data: { assets: nextAssets } },
              { Authorization: `Bearer ${token}` }
            );

            await writeFile(glbPath, glbBuffer);
            await sleep(220);
          }
        }

        if (!skipIcons && asset.iconUrl) {
          await downloadBinary({
            url: asset.iconUrl,
            targetPath: iconPath,
            force,
          });

          if (await fileExists(iconPath)) {
            manifestEntry.iconUrl = getSharedIconUrl({ type, fileId, ext: iconExt });
          }
        }

        manifestEntry.downloadedAt = new Date().toISOString();
        downloadedInRun += 1;
        console.log(`${progressLabel} OK`);
      } catch (error) {
        manifestEntry.error =
          error instanceof Error ? error.message : "Unknown download error";
        console.warn(`${progressLabel} FAILED`);
        console.warn(manifestEntry.error);
      }

      manifestItems.push(manifestEntry);
    }

    manifestItems.sort((left, right) => {
      const typeCompare = String(left.type).localeCompare(String(right.type));
      if (typeCompare !== 0) return typeCompare;

      const nameCompare = String(left.name).localeCompare(String(right.name));
      if (nameCompare !== 0) return nameCompare;

      return String(left.id).localeCompare(String(right.id));
    });

    const totalsByType = {};
    for (const item of manifestItems) {
      if (!item.downloadedAt || item.error) continue;
      totalsByType[item.type] = (totalsByType[item.type] || 0) + 1;
    }

    const downloadedCount = manifestItems.filter(
      (item) => Boolean(item.downloadedAt) && !item.error
    ).length;

    nextLibraries[gender] = {
      gender,
      defaultPresetId: nextPresets[gender]?.defaultPresetId || "preset-1",
      baseModelUrl:
        nextPresets[gender]?.items?.find((preset) => preset.id === "preset-1")
          ?.baseModelUrl || null,
      totalSelected: manifestItems.length,
      totalInLastRun: assetsToProcess.length,
      totalDownloaded: downloadedCount,
      totalsByType,
      items: manifestItems,
    };

    console.log(
      `Finished ${gender}. Run downloaded ${downloadedInRun}/${assetsToProcess.length}.`
    );
  }

  const localManifest = {
    generatedAt: new Date().toISOString(),
    sourceCollectedAt: dataset.collectedAt,
    appName,
    totalCatalogAssets: dataset.assets.length,
    libraries: nextLibraries,
    presets: nextPresets,
  };

  await writeJson(MANIFEST_PATH, localManifest);
  console.log(`Manifest written to ${MANIFEST_PATH}`);
};

main().catch((error) => {
  console.error("[assets:download] failed:", error);
  process.exitCode = 1;
});
