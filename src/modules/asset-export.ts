import type { AssetManifest, AssetRecord, CoreAssetType } from "../types/assets";

type ExportScope = "group" | "type" | "visible";

interface ExportContext {
  scope: ExportScope;
  groupId: string;
  type: CoreAssetType;
  query: string;
  assets: AssetRecord[];
  manifest: AssetManifest;
}

const cleanPart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const downloadBlob = (filename: string, content: BlobPart, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const buildExportFileBase = (
  scope: ExportScope,
  groupId: string,
  type: CoreAssetType
): string => {
  const date = new Date().toISOString().slice(0, 10);
  return `metasibir-${scope}-${cleanPart(groupId)}-${cleanPart(type)}-${date}`;
};

export const downloadJsonExport = (ctx: ExportContext): string => {
  const payload = {
    exportedAt: new Date().toISOString(),
    scope: ctx.scope,
    groupId: ctx.groupId,
    type: ctx.type,
    query: ctx.query,
    count: ctx.assets.length,
    source: ctx.manifest.source,
    datasetCollectedAt: ctx.manifest.datasetCollectedAt,
    assets: ctx.assets,
  };

  const filename = `${buildExportFileBase(ctx.scope, ctx.groupId, ctx.type)}.json`;
  downloadBlob(filename, JSON.stringify(payload, null, 2), "application/json");
  return filename;
};

export const downloadCsvExport = (ctx: ExportContext): string => {
  const headers = [
    "id",
    "name",
    "type",
    "gender",
    "bodyType",
    "iconUrl",
    "organizationId",
    "createdAt",
    "updatedAt",
  ];

  const escape = (value: unknown): string => {
    const source = value == null ? "" : String(value);
    if (source.includes(",") || source.includes("\"") || source.includes("\n")) {
      return `"${source.replaceAll("\"", "\"\"")}"`;
    }
    return source;
  };

  const rows = ctx.assets.map((asset) =>
    headers
      .map((header) => escape((asset as Record<string, unknown>)[header]))
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `${buildExportFileBase(ctx.scope, ctx.groupId, ctx.type)}.csv`;
  downloadBlob(filename, csv, "text/csv;charset=utf-8");
  return filename;
};
