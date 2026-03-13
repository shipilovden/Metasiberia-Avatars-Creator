export type CoreAssetType =
  | "top"
  | "bottom"
  | "footwear"
  | "outfit"
  | "hair"
  | "eye"
  | "glasses"
  | "headwear"
  | "beard"
  | "facewear"
  | "facemask";

export interface AssetRecord {
  id: string;
  name: string;
  type: string;
  iconUrl?: string;
  bodyType?: string;
  gender?: string;
  [key: string]: unknown;
}

export interface AssetDataset {
  collectedAt: string;
  source: {
    subdomain: string;
    appId: string;
    userId: string;
    bodyType: string[];
    gender: string[];
  };
  totalAssets: number;
  typeSummary: Record<string, number>;
  assets: AssetRecord[];
}

export interface AssetGroupSchema {
  id: string;
  label: string;
  description: string;
  types: CoreAssetType[];
}

export interface AssetTypeSchema {
  id: CoreAssetType;
  label: string;
}

export interface AssetSchemaConfig {
  types: AssetTypeSchema[];
  groups: AssetGroupSchema[];
}

export interface TypeManifestEntry extends AssetTypeSchema {
  count: number;
  file: string;
}

export interface GroupManifestEntry extends AssetGroupSchema {
  count: number;
  file: string;
}

export interface AssetManifest {
  generatedAt: string;
  datasetCollectedAt: string;
  totalAssets: number;
  source: AssetDataset["source"];
  types: TypeManifestEntry[];
  groups: GroupManifestEntry[];
}
