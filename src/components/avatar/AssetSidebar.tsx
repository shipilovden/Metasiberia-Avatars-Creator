import { ClearAssetIcon, PresetPreviewImage } from "./UiComponents";
import { allTypes, makeLookupKey } from "./shared";
import type {
  AssetRecord,
  LocalItem,
  LocalPreset,
  SupportedType,
  UiCopy,
  UiGender,
} from "./shared";

export type AssetSidebarProps = {
  copy: UiCopy;
  selectedGender: UiGender;
  onSelectGender: (gender: UiGender) => void;
  presetOptions: readonly LocalPreset[];
  selectedPresetId: string;
  onSelectPresetId: (presetId: string) => void;
  activeType: SupportedType;
  onSelectType: (type: SupportedType) => void;
  typeLabels: Record<SupportedType, string>;
  selectedAssetId: string;
  onClearType: () => void;
  visibleAssets: readonly AssetRecord[];
  localItemsByAsset: ReadonlyMap<string, LocalItem>;
  onSelectAsset: (asset: AssetRecord) => void;
};

export function AssetSidebar({
  copy,
  selectedGender,
  onSelectGender,
  presetOptions,
  selectedPresetId,
  onSelectPresetId,
  activeType,
  onSelectType,
  typeLabels,
  selectedAssetId,
  onClearType,
  visibleAssets,
  localItemsByAsset,
  onSelectAsset,
}: AssetSidebarProps) {
  const isFootwearType = activeType === "footwear";
  const isBeardType = activeType === "beard";
  const assetGridClassName = [
    "asset-grid",
    isFootwearType ? "asset-grid--footwear" : "",
    isBeardType ? "asset-grid--beard" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className="asset-panel">
      <div className="asset-list-panel">
        <div className="library-controls">
          <div className="gender-switch">
            {(["male", "female"] as UiGender[]).map((gender) => (
              <button
                key={gender}
                type="button"
                className={`gender-btn${selectedGender === gender ? " gender-btn--active" : ""}`}
                onClick={() => onSelectGender(gender)}
              >
                {gender === "male" ? copy.male : copy.female}
              </button>
            ))}
          </div>

          <div className="preset-strip" aria-label={copy.preset}>
            {presetOptions.map((preset, index) => {
              const isActive = selectedPresetId === preset.id;

              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-btn${isActive ? " preset-btn--active" : ""}`}
                  onClick={() => onSelectPresetId(preset.id)}
                  title={`${copy.preset} ${index + 1}`}
                >
                  {preset.previewUrl ? (
                    <PresetPreviewImage
                      src={preset.previewUrl}
                      alt={`${copy.preset} ${index + 1}`}
                    />
                  ) : (
                    <span className="preset-btn__fallback">{index + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="type-tabs">
          {allTypes.map((typeMeta) => (
            <button
              key={typeMeta.id}
              type="button"
              className={`tab-btn${activeType === typeMeta.id ? " tab-btn--active" : ""}`}
              onClick={() => onSelectType(typeMeta.id)}
            >
              {typeLabels[typeMeta.id]}
            </button>
          ))}
        </div>

        <div className={assetGridClassName}>
          <button
            type="button"
            className={`asset-card asset-card--clear${selectedAssetId ? "" : " asset-card--active"}`}
            onClick={onClearType}
            title={copy.clearSelection}
            aria-label={copy.clearSelection}
          >
            <span className="asset-thumb-wrap asset-thumb-wrap--clear">
              <ClearAssetIcon />
            </span>
          </button>

          {visibleAssets.map((asset) => {
            const id = String(asset.id);
            const localItem = localItemsByAsset.get(makeLookupKey(asset.type, id));
            const imageSrc = localItem?.iconUrl || asset.iconUrl || "";
            const isActive = selectedAssetId === id;

            return (
              <button
                key={id}
                type="button"
                className={`asset-card${isActive ? " asset-card--active" : ""}`}
                onClick={() => onSelectAsset(asset)}
                title={`${asset.name} (${id})`}
              >
                <span
                  className={[
                    "asset-thumb-wrap",
                    isFootwearType ? "asset-thumb-wrap--footwear" : "",
                    isBeardType ? "asset-thumb-wrap--beard" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {imageSrc ? <img src={imageSrc} alt={asset.name} loading="lazy" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
