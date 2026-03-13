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

type PaintPanelProps = {
  copy: Copy;
  decalFileName: string;
  hasDecal: boolean;
  onUploadDecal: () => void;
  onRemoveDecal: () => void;
  isUvEditorOpen: boolean;
  onToggleUvEditor: () => void;
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

export function PaintPanel({
  copy,
  decalFileName,
  hasDecal,
  onUploadDecal,
  onRemoveDecal,
  isUvEditorOpen,
  onToggleUvEditor,
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
        <div className="paint-panel-file">{decalFileName || copy.notLoaded}</div>
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
          <input
            type="range"
            min={0.08}
            max={0.9}
            step={0.01}
            value={decalScale}
            onChange={(event) => onDecalScale(Number(event.target.value))}
            disabled={!hasDecal}
          />
        </label>
        <label className="sticker-slider">
          <span>{copy.textureRotation}</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={decalRotationDeg}
            onChange={(event) => onDecalRotationDeg(Number(event.target.value))}
            disabled={!hasDecal}
          />
        </label>
      </div>

      <div className="paint-section">
        <div className="paint-section__title">{copy.textureModeReplace}</div>
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
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.01}
            value={replaceScale}
            onChange={(event) => onReplaceScale(Number(event.target.value))}
            disabled={!hasTexture || !canUseReplacement}
          />
        </label>
        <label className="sticker-slider">
          <span>{copy.textureScaleX}</span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.01}
            value={replaceScaleX}
            onChange={(event) => onReplaceScaleX(Number(event.target.value))}
            disabled={!hasTexture || !canUseReplacement}
          />
        </label>
        <label className="sticker-slider">
          <span>{copy.textureScaleY}</span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.01}
            value={replaceScaleY}
            onChange={(event) => onReplaceScaleY(Number(event.target.value))}
            disabled={!hasTexture || !canUseReplacement}
          />
        </label>
        <label className="sticker-slider">
          <span>{copy.textureRotation}</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={replaceRotationDeg}
            onChange={(event) => onReplaceRotationDeg(Number(event.target.value))}
            disabled={!hasTexture || !canUseReplacement}
          />
        </label>
      </div>
    </div>
  );
}
