type Copy = {
  textureModeDecal: string;
  textureModeReplace: string;
  uploadDecal: string;
  uploadTexture: string;
  removeDecal: string;
  removeTexture: string;
  notLoaded: string;
  textureEditMode: string;
  textureScale: string;
  textureRotation: string;
  textureScaleX: string;
  textureScaleY: string;
  replaceHint: string;
  avatarStatic: string;
};

type DecalFileItem = {
  id: string;
  fileName: string;
  isSelected: boolean;
};

export type PaintPanelProps = {
  copy: Copy;
  decalFiles: readonly DecalFileItem[];
  hasDecal: boolean;
  onUploadDecal: () => void;
  onRemoveDecal: () => void;
  onSelectDecalFile: (id: string) => void;
  onRemoveDecalFile: (id: string) => void;
  isUvEditorOpen: boolean;
  onToggleUvEditor: () => void;
  isTextureUvEditorOpen: boolean;
  onToggleTextureUvEditor: () => void;
  isDecalEditMode: boolean;
  onToggleDecalEditMode: (next: boolean) => void;
  decalScale: number;
  onDecalScale: (value: number) => void;
  decalRotationDeg: number;
  onDecalRotationDeg: (value: number) => void;
  textureFileName: string;
  hasTexture: boolean;
  canUseReplacement: boolean;
  onUploadTexture: () => void;
  onRemoveTexture: () => void;
  replaceScale: number;
  onReplaceScale: (value: number) => void;
  replaceScaleX: number;
  onReplaceScaleX: (value: number) => void;
  replaceScaleY: number;
  onReplaceScaleY: (value: number) => void;
  replaceRotationDeg: number;
  onReplaceRotationDeg: (value: number) => void;
  isAvatarStatic: boolean;
  onToggleAvatarStatic: (next: boolean) => void;
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const DECAL_SCALE_MIN = 0.005;
const DECAL_SCALE_MAX = 0.9;

export function PaintPanel({
  copy,
  decalFiles,
  hasDecal,
  onUploadDecal,
  onRemoveDecal,
  onSelectDecalFile,
  onRemoveDecalFile,
  isUvEditorOpen,
  onToggleUvEditor,
  isTextureUvEditorOpen,
  onToggleTextureUvEditor,
  isDecalEditMode,
  onToggleDecalEditMode,
  decalScale,
  onDecalScale,
  decalRotationDeg,
  onDecalRotationDeg,
  textureFileName,
  hasTexture,
  canUseReplacement,
  onUploadTexture,
  onRemoveTexture,
  replaceScale,
  onReplaceScale,
  replaceScaleX,
  onReplaceScaleX,
  replaceScaleY,
  onReplaceScaleY,
  replaceRotationDeg,
  onReplaceRotationDeg,
  isAvatarStatic,
  onToggleAvatarStatic,
}: PaintPanelProps) {
  return (
    <div className="paint-panel">
      <div className="paint-section">
        <label className="sticker-check">
          <input
            type="checkbox"
            checked={isAvatarStatic}
            onChange={(event) => onToggleAvatarStatic(event.target.checked)}
          />
          <span>{copy.avatarStatic}</span>
        </label>
      </div>

      <div className="paint-section">
        <div className="paint-section__title-row">
          <div className="paint-section__title">{copy.textureModeDecal}</div>
          <button
            type="button"
            className={`paint-section__mini-btn${isUvEditorOpen ? " paint-section__mini-btn--active" : ""}`}
            onClick={onToggleUvEditor}
          >
            UV
          </button>
        </div>

        {decalFiles.length ? (
          <div className="paint-panel-file-list">
            {decalFiles.map((file) => (
              <div
                key={file.id}
                className={`paint-panel-file-row${file.isSelected ? " paint-panel-file-row--active" : ""}`}
              >
                <button
                  type="button"
                  className="paint-panel-file-row__select"
                  onClick={() => onSelectDecalFile(file.id)}
                  title={file.fileName}
                >
                  {file.fileName}
                </button>
                <button
                  type="button"
                  className="paint-panel-file-row__delete"
                  onClick={() => onRemoveDecalFile(file.id)}
                  aria-label={`${copy.removeDecal}: ${file.fileName}`}
                  title={copy.removeDecal}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="paint-panel-file">{copy.notLoaded}</div>
        )}

        <div className="paint-panel-actions">
          <button type="button" className="texture-modal-btn" onClick={onUploadDecal}>
            {copy.uploadDecal}
          </button>
          <button
            type="button"
            className="texture-modal-btn texture-modal-btn--danger"
            onClick={onRemoveDecal}
            disabled={!hasDecal}
          >
            {copy.removeDecal}
          </button>
        </div>

        <label className="sticker-check">
          <input
            type="checkbox"
            checked={isDecalEditMode}
            onChange={(event) => onToggleDecalEditMode(event.target.checked)}
            disabled={!hasDecal}
          />
          <span>{copy.textureEditMode}</span>
        </label>

        <label className="sticker-slider">
          <span>{copy.textureScale}</span>
          <div className="sticker-slider__controls">
            <input
              type="range"
              min={DECAL_SCALE_MIN}
              max={DECAL_SCALE_MAX}
              step={0.005}
              value={decalScale}
              onChange={(event) => onDecalScale(Number(event.target.value))}
              disabled={!hasDecal}
            />
            <input
              type="number"
              className="sticker-slider__number"
              min={DECAL_SCALE_MIN}
              max={DECAL_SCALE_MAX}
              step={0.005}
              value={decalScale}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  onDecalScale(clampNumber(nextValue, DECAL_SCALE_MIN, DECAL_SCALE_MAX));
                }
              }}
              disabled={!hasDecal}
            />
          </div>
        </label>

        <label className="sticker-slider">
          <span>{copy.textureRotation}</span>
          <div className="sticker-slider__controls">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={decalRotationDeg}
              onChange={(event) => onDecalRotationDeg(Number(event.target.value))}
              disabled={!hasDecal}
            />
            <input
              type="number"
              className="sticker-slider__number"
              min={-180}
              max={180}
              step={1}
              value={decalRotationDeg}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  onDecalRotationDeg(clampNumber(nextValue, -180, 180));
                }
              }}
              disabled={!hasDecal}
            />
          </div>
        </label>
      </div>

      <div className="paint-section">
        <div className="paint-section__title-row">
          <div className="paint-section__title">{copy.textureModeReplace}</div>
          <button
            type="button"
            className={`paint-section__mini-btn${isTextureUvEditorOpen ? " paint-section__mini-btn--active" : ""}`}
            onClick={onToggleTextureUvEditor}
          >
            UV
          </button>
        </div>
        <div className="paint-panel-file">{textureFileName || copy.notLoaded}</div>
        <div className="paint-panel-actions">
          <button type="button" className="texture-modal-btn" onClick={onUploadTexture}>
            {copy.uploadTexture}
          </button>
          <button
            type="button"
            className="texture-modal-btn texture-modal-btn--danger"
            onClick={onRemoveTexture}
            disabled={!hasTexture}
          >
            {copy.removeTexture}
          </button>
        </div>
        {!canUseReplacement ? <div className="paint-panel-note">{copy.replaceHint}</div> : null}
        <label className="sticker-slider">
          <span>{copy.textureScale}</span>
          <div className="sticker-slider__controls">
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.01}
              value={replaceScale}
              onChange={(event) => onReplaceScale(Number(event.target.value))}
              disabled={!hasTexture || !canUseReplacement}
            />
            <input
              type="number"
              className="sticker-slider__number"
              min={0.2}
              max={3}
              step={0.01}
              value={replaceScale}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  onReplaceScale(clampNumber(nextValue, 0.2, 3));
                }
              }}
              disabled={!hasTexture || !canUseReplacement}
            />
          </div>
        </label>
        <label className="sticker-slider">
          <span>{copy.textureScaleX}</span>
          <div className="sticker-slider__controls">
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.01}
              value={replaceScaleX}
              onChange={(event) => onReplaceScaleX(Number(event.target.value))}
              disabled={!hasTexture || !canUseReplacement}
            />
            <input
              type="number"
              className="sticker-slider__number"
              min={0.2}
              max={3}
              step={0.01}
              value={replaceScaleX}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  onReplaceScaleX(clampNumber(nextValue, 0.2, 3));
                }
              }}
              disabled={!hasTexture || !canUseReplacement}
            />
          </div>
        </label>
        <label className="sticker-slider">
          <span>{copy.textureScaleY}</span>
          <div className="sticker-slider__controls">
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.01}
              value={replaceScaleY}
              onChange={(event) => onReplaceScaleY(Number(event.target.value))}
              disabled={!hasTexture || !canUseReplacement}
            />
            <input
              type="number"
              className="sticker-slider__number"
              min={0.2}
              max={3}
              step={0.01}
              value={replaceScaleY}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  onReplaceScaleY(clampNumber(nextValue, 0.2, 3));
                }
              }}
              disabled={!hasTexture || !canUseReplacement}
            />
          </div>
        </label>
        <label className="sticker-slider">
          <span>{copy.textureRotation}</span>
          <div className="sticker-slider__controls">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={replaceRotationDeg}
              onChange={(event) => onReplaceRotationDeg(Number(event.target.value))}
              disabled={!hasTexture || !canUseReplacement}
            />
            <input
              type="number"
              className="sticker-slider__number"
              min={-180}
              max={180}
              step={1}
              value={replaceRotationDeg}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  onReplaceRotationDeg(clampNumber(nextValue, -180, 180));
                }
              }}
              disabled={!hasTexture || !canUseReplacement}
            />
          </div>
        </label>
      </div>
    </div>
  );
}
