import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_APP_ID,
  DEFAULT_APP_NAME,
  SUPPORTED_GENDERS,
  SUPPORTED_TYPES,
} from "./library-config.mjs";

const OUTPUT_PATH = path.join("src", "data", "assets-catalog.json");
const API_BASE = "https://api.readyplayer.me";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const getJson = async (url, headers = {}) => {
  const response = await makeRequest(url, {
    method: "GET",
    headers,
  });

  return response.json();
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

const makeLookupKey = (type, id) => `${String(type)}:${String(id)}`;

const byAssetName = (left, right) => {
  const typeCompare = String(left.type).localeCompare(String(right.type));
  if (typeCompare !== 0) return typeCompare;

  const genderCompare = String(left.gender).localeCompare(String(right.gender));
  if (genderCompare !== 0) return genderCompare;

  const nameCompare = String(left.name).localeCompare(String(right.name));
  if (nameCompare !== 0) return nameCompare;

  return String(left.id).localeCompare(String(right.id));
};

const fetchAssetsForTypeAndGender = async ({
  token,
  userId,
  appId,
  type,
  gender,
}) => {
  const params = new URLSearchParams();
  params.append("page", "1");
  params.append("limit", "1000");
  params.append("filter", "viewable-by-user-and-app");
  params.append("filterUserId", userId);
  params.append("filterApplicationId", appId);
  params.append("order", "editorPosition");
  params.append("fields", "-campaignIds");
  params.append("bodyType", "generic");
  params.append("bodyType", "fullbody");
  params.append("gender", gender);
  params.append("gender", "neutral");
  params.append("type", type);

  const response = await getJson(`${API_BASE}/v1/assets?${params.toString()}`, {
    Authorization: `Bearer ${token}`,
    "X-TRACKING-ID": appId,
  });

  return Array.isArray(response?.data) ? response.data : [];
};

const main = async () => {
  const appName = DEFAULT_APP_NAME;
  const appId = DEFAULT_APP_ID;

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const { token, userId } = await createAnonymousUser(appName);
  const assetsByKey = new Map();

  for (const gender of SUPPORTED_GENDERS) {
    for (const type of SUPPORTED_TYPES) {
      const assets = await fetchAssetsForTypeAndGender({
        token,
        userId,
        appId,
        type,
        gender,
      });

      for (const asset of assets) {
        assetsByKey.set(makeLookupKey(asset.type, asset.id), {
          ...asset,
          __typeGroup: asset.type,
        });
      }
    }
  }

  const assets = Array.from(assetsByKey.values()).sort(byAssetName);
  const typeSummary = {};
  const genderSummary = {};

  for (const asset of assets) {
    typeSummary[asset.type] = (typeSummary[asset.type] || 0) + 1;
    genderSummary[asset.gender] = (genderSummary[asset.gender] || 0) + 1;
  }

  const payload = {
    collectedAt: new Date().toISOString(),
    source: {
      subdomain: appName,
      appId,
      userId,
      bodyType: ["generic", "fullbody"],
      gender: ["male", "female", "neutral"],
    },
    totalAssets: assets.length,
    typeSummary,
    genderSummary,
    assets,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    `[assets:sync-catalog] saved ${assets.length} assets to ${OUTPUT_PATH}`
  );
};

main().catch((error) => {
  console.error("[assets:sync-catalog] failed:", error);
  process.exitCode = 1;
});
