import schema from "./asset-schema.json";
import type { AssetSchemaConfig, CoreAssetType } from "../types/assets";

const source = schema as AssetSchemaConfig;

export const TYPE_SCHEMA = source.types;
export const GROUP_SCHEMA = source.groups;

export const TYPE_LABELS: Record<CoreAssetType, string> = TYPE_SCHEMA.reduce(
  (acc, item) => {
    acc[item.id] = item.label;
    return acc;
  },
  {} as Record<CoreAssetType, string>
);
