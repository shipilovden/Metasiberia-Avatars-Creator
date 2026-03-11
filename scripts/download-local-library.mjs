import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DATASET_PATH = path.join("src", "data", "assets-441.json");
const OUTPUT_ROOT = path.join("public", "local-assets");
const OUTPUT_GLB_ROOT = path.join(OUTPUT_ROOT, "glb");
const OUTPUT_ICON_ROOT = path.join(OUTPUT_ROOT, "icons");
const OUTPUT_BASE_ROOT = path.join(OUTPUT_ROOT, "base");
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
  glasses: "glasses",
  headwear: "headwear",
  beard: "beardStyle",
  facewear: "facewear",
};

const SUPPORTED_TYPES = new Set(Object.keys(TYPE_TO_AVATAR_ASSET_KEY));
const makeLookupKey = (type, id) => `${String(type)}:${String(id)}`;

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

const downloadIcon = async ({ iconUrl, targetPath, force }) => {
  if (!iconUrl) return null;
  if (!force && (await fileExists(targetPath))) {
    return targetPath;
  }

  const response = await makeRequest(iconUrl, { method: "GET" });
  const iconBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, iconBuffer);
  return targetPath;
};

const main = async () => {
  const appName = readArg("--app-name", "demo");
  const wantedType = readArg("--type", "").trim().toLowerCase();
  const wantedIdsRaw = readArg("--id", "").trim();
  const limitRaw = readArg("--limit", "");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  const force = hasFlag("--force");
  const skipIcons = hasFlag("--skip-icons");
  const templateGender = readArg("--template-gender", "male");
  const wantedIds = new Set(
    wantedIdsRaw
      ? wantedIdsRaw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : []
  );

  if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit value: ${limitRaw}`);
  }

  const dataset = await readJson(DATASET_PATH);
  const sourceAssets = dataset.assets.filter((asset) => SUPPORTED_TYPES.has(asset.type));
  if (sourceAssets.length === 0) {
    throw new Error("No supported assets found in dataset.");
  }

  let filteredAssets = sourceAssets;
  if (wantedType) {
    if (!SUPPORTED_TYPES.has(wantedType)) {
      throw new Error(`Unknown --type value: ${wantedType}`);
    }
    filteredAssets = sourceAssets.filter((asset) => asset.type === wantedType);
  }

  if (wantedIds.size > 0) {
    filteredAssets = filteredAssets.filter((asset) => wantedIds.has(String(asset.id)));
  }

  if (limit) {
    filteredAssets = filteredAssets.slice(0, limit);
  }

  await ensureDir(OUTPUT_ROOT);
  await ensureDir(OUTPUT_GLB_ROOT);
  await ensureDir(OUTPUT_ICON_ROOT);
  await ensureDir(OUTPUT_BASE_ROOT);
  await ensureDir(path.dirname(MANIFEST_PATH));

  const existingManifest = await readJsonSafe(MANIFEST_PATH);
  const existingItems = Array.isArray(existingManifest?.items)
    ? existingManifest.items
    : [];
  const existingItemsByKey = new Map(
    existingItems.map((item) => [makeLookupKey(item.type, item.id), item])
  );

  console.log(`Selected assets: ${filteredAssets.length}`);
  console.log(`Type filter: ${wantedType || "all"}`);
  console.log(`Output root: ${OUTPUT_ROOT}`);

  const { token, userId } = await createAnonymousUser(appName);
  console.log(`Created RPM user: ${userId}`);

  const templatesResponse = await getTemplates(token);
  const templates = templatesResponse?.data || [];
  if (templates.length === 0) {
    throw new Error("No avatar templates returned from API.");
  }

  const selectedTemplate =
    templates.find((template) => template.gender === templateGender) || templates[0];
  console.log(
    `Using template ${selectedTemplate.id} (gender=${selectedTemplate.gender || "unknown"})`
  );

  const avatarResponse = await createAvatarFromTemplate({
    token,
    userId,
    templateId: selectedTemplate.id,
    appName,
  });

  const avatarId = avatarResponse?.data?.id;
  const baseAssets = avatarResponse?.data?.assets || {};
  if (!avatarId) {
    throw new Error("Failed to create base avatar.");
  }

  console.log(`Created avatar: ${avatarId}`);

  const exportUrl = getExportUrl(avatarId);

  const baseGlbPath = path.join(OUTPUT_BASE_ROOT, "default.glb");
  let baseModelUrl = "/local-assets/base/default.glb";
  if (force || !(await fileExists(baseGlbPath))) {
    try {
      const defaultGlb = await patchGlb(
        exportUrl,
        { data: { assets: baseAssets } },
        { Authorization: `Bearer ${token}` }
      );
      await writeFile(baseGlbPath, defaultGlb);
      console.log("Saved base avatar glb.");
    } catch (error) {
      if (await fileExists(baseGlbPath)) {
        console.warn("Base avatar export failed, using existing default.glb.");
      } else {
        baseModelUrl = null;
        console.warn("Base avatar export failed and no previous default.glb exists.");
        console.warn(error instanceof Error ? error.message : String(error));
      }
    }
  } else {
    console.log("Base avatar glb already exists, skipping.");
  }

  const updatedItemsByKey = new Map(existingItemsByKey);

  let downloadedInRun = 0;

  for (let index = 0; index < filteredAssets.length; index += 1) {
    const asset = filteredAssets[index];
    const id = String(asset.id);
    const type = String(asset.type);
    const itemKey = makeLookupKey(type, id);
    const typeDir = path.join(OUTPUT_GLB_ROOT, type);
    const iconTypeDir = path.join(OUTPUT_ICON_ROOT, type);
    await ensureDir(typeDir);
    await ensureDir(iconTypeDir);

    const fileId = encodeURIComponent(id);
    const glbPath = path.join(typeDir, `${fileId}.glb`);
    const iconExt = asset.iconUrl ? parseExtensionFromUrl(asset.iconUrl) : ".png";
    const iconPath = path.join(iconTypeDir, `${fileId}${iconExt}`);

    const previousItem = existingItemsByKey.get(itemKey) || null;
    const manifestEntry = {
      id,
      name: String(asset.name || ""),
      type,
      fileId,
      glbUrl: `/local-assets/glb/${type}/${fileId}.glb`,
      iconUrl: null,
      sourceIconUrl: asset.iconUrl || null,
      downloadedAt: previousItem?.downloadedAt || null,
      error: null,
    };

    if (await fileExists(iconPath)) {
      manifestEntry.iconUrl = `/local-assets/icons/${type}/${fileId}${iconExt}`;
    } else if (previousItem?.iconUrl) {
      manifestEntry.iconUrl = previousItem.iconUrl;
    }

    const progressLabel = `[${index + 1}/${filteredAssets.length}] ${type}:${id}`;

    try {
      if (force || !(await fileExists(glbPath))) {
        const nextAssets = applyAssetToAvatarAssets({
          type,
          assetId: id,
          baseAssets,
        });

        const glbBuffer = await patchGlb(
          exportUrl,
          { data: { assets: nextAssets } },
          { Authorization: `Bearer ${token}` }
        );
        await writeFile(glbPath, glbBuffer);
        await sleep(220);
      }

      if (!skipIcons && asset.iconUrl) {
        await downloadIcon({
          iconUrl: asset.iconUrl,
          targetPath: iconPath,
          force,
        });

        if (await fileExists(iconPath)) {
          manifestEntry.iconUrl = `/local-assets/icons/${type}/${fileId}${iconExt}`;
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

    updatedItemsByKey.set(itemKey, manifestEntry);
  }

  const manifestItems = Array.from(updatedItemsByKey.values()).sort((left, right) => {
    const typeCompare = String(left.type).localeCompare(String(right.type));
    if (typeCompare !== 0) return typeCompare;
    return String(left.name).localeCompare(String(right.name));
  });

  const totalsByType = {};
  for (const item of manifestItems) {
    if (!item.downloadedAt || item.error) continue;
    totalsByType[item.type] = (totalsByType[item.type] || 0) + 1;
  }

  const downloadedCount = manifestItems.filter(
    (item) => Boolean(item.downloadedAt) && !item.error
  ).length;

  const localManifest = {
    generatedAt: new Date().toISOString(),
    sourceCollectedAt: dataset.collectedAt,
    appName,
    baseModelUrl,
    totalSelected: manifestItems.length,
    totalInLastRun: filteredAssets.length,
    totalDownloaded: downloadedCount,
    totalsByType,
    items: manifestItems,
  };

  await writeJson(MANIFEST_PATH, localManifest);

  console.log(
    `Done. Run downloaded ${downloadedInRun}/${filteredAssets.length}. Total downloaded ${downloadedCount}/${manifestItems.length}. Manifest: ${MANIFEST_PATH}`
  );
};

main().catch((error) => {
  console.error("[assets:download] failed:", error);
  process.exitCode = 1;
});
