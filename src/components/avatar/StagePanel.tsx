import { Suspense, type MutableRefObject } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Camera, Group, Mesh, MOUSE, Scene, Vector3, WebGLRenderer } from "three";
import { PaintPanel, type PaintPanelProps } from "../PaintPanel";
import {
  USE_EXTRACTED_UV_EDITOR_PORT,
  UvEditorBridge,
  type UvDecalEditorProps,
} from "../UvEditorBridge";
import {
  AvatarHeadMaskLayer,
  AvatarModel,
  AutoStickerProjector,
  PlaceholderAvatar,
  SceneBridge,
  SceneLoader,
} from "./SceneComponents";
import { ExportPreviewModal, SettingsGearIcon } from "./UiComponents";
import { HAIR_COLOR_SWATCHES } from "./shared";
import type { AppliedUvDecal, MeshSlot, MeshTintMap, UiCopy, UiLocale } from "./shared";

type ComposedScene = {
  hiddenBaseMeshes: MeshSlot[];
  slotModelUrls: Partial<Record<MeshSlot, string>>;
  beardMaskUrl: string | null;
  beardMaskModelUrl: string | null;
  eyebrowMaskUrl: string | null;
  eyebrowMaskModelUrl: string | null;
  facemaskMaskUrl: string | null;
  facemaskMaskModelUrl: string | null;
  parts: Array<{
    modelUrl: string;
    includeMeshes: MeshSlot[];
  }>;
};

export type StagePanelProps = {
  copy: UiCopy;
  locale: UiLocale;
  onToggleLocale: () => void;
  onNext: () => void;
  isPaintPanelOpen: boolean;
  onTogglePaintPanel: () => void;
  paintPanelProps: PaintPanelProps;
  showUvEditor: boolean;
  uvEditorProps: UvDecalEditorProps;
  avatarExportGroupRef: MutableRefObject<Group | null>;
  onSceneReady: (payload: {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
  }) => void;
  onCanvasPointerReset: () => void;
  onStagePointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onStagePointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onStagePointerUp: (event: ThreeEvent<PointerEvent>) => void;
  selectedPresetBaseModelUrl: string | null;
  composedScene: ComposedScene;
  tintByMesh: MeshTintMap;
  idleAnimationUrl: string;
  shouldReplaceTexture: boolean;
  replaceTextureUrl: string | null;
  replacementSlots: readonly MeshSlot[];
  replaceScale: number;
  replaceScaleX: number;
  replaceScaleY: number;
  replaceRotationDeg: number;
  isAvatarStatic: boolean;
  isStickerDragging: boolean;
  appliedUvDecals: readonly AppliedUvDecal[];
  selectedEyebrowColor: string;
  decalTextureUrl: string | null;
  stickerTargetMesh: Mesh | null;
  onAutoStickerPick: (payload: {
    mesh: Mesh;
    point: Vector3;
    normal: Vector3;
    uv: [number, number] | null;
  }) => void;
  showColorPanel: boolean;
  colorPanelLabel: string;
  selectedColor: string | null;
  onSelectColor: (color: string) => void;
  decalUploadInputRef: MutableRefObject<HTMLInputElement | null>;
  textureUploadInputRef: MutableRefObject<HTMLInputElement | null>;
  onUploadByTarget: (file: File | null, target: "decal" | "replace") => void;
  isExportModalOpen: boolean;
  exportPreviewUrl: string | null;
  exportDownloadUrl: string | null;
  exportFileName: string;
  onCloseExportModal: () => void;
};

export function StagePanel({
  copy,
  locale,
  onToggleLocale,
  onNext,
  isPaintPanelOpen,
  onTogglePaintPanel,
  paintPanelProps,
  showUvEditor,
  uvEditorProps,
  avatarExportGroupRef,
  onSceneReady,
  onCanvasPointerReset,
  onStagePointerDown,
  onStagePointerMove,
  onStagePointerUp,
  selectedPresetBaseModelUrl,
  composedScene,
  tintByMesh,
  idleAnimationUrl,
  shouldReplaceTexture,
  replaceTextureUrl,
  replacementSlots,
  replaceScale,
  replaceScaleX,
  replaceScaleY,
  replaceRotationDeg,
  isAvatarStatic,
  isStickerDragging,
  appliedUvDecals,
  selectedEyebrowColor,
  decalTextureUrl,
  stickerTargetMesh,
  onAutoStickerPick,
  showColorPanel,
  colorPanelLabel,
  selectedColor,
  onSelectColor,
  decalUploadInputRef,
  textureUploadInputRef,
  onUploadByTarget,
  isExportModalOpen,
  exportPreviewUrl,
  exportDownloadUrl,
  exportFileName,
  onCloseExportModal,
}: StagePanelProps) {
  const selectedDecalFileName =
    paintPanelProps.decalFiles.find((file) => file.isSelected)?.fileName ||
    paintPanelProps.decalFiles[paintPanelProps.decalFiles.length - 1]?.fileName ||
    paintPanelProps.copy.notLoaded;
  const extractedControls = {
    mode: paintPanelProps.isTextureUvEditorOpen ? "texture" : "decal",
    onSwitchMode: (mode: "decal" | "texture") => {
      if (mode === "texture") {
        if (!paintPanelProps.isTextureUvEditorOpen) {
          paintPanelProps.onToggleTextureUvEditor();
        }
        return;
      }

      if (paintPanelProps.isTextureUvEditorOpen) {
        paintPanelProps.onToggleUvEditor();
      }
    },
    onUpload: paintPanelProps.isTextureUvEditorOpen
      ? paintPanelProps.onUploadTexture
      : paintPanelProps.onUploadDecal,
    onRemove: paintPanelProps.isTextureUvEditorOpen
      ? paintPanelProps.onRemoveTexture
      : paintPanelProps.onRemoveDecal,
    hasAsset: paintPanelProps.isTextureUvEditorOpen
      ? paintPanelProps.hasTexture
      : paintPanelProps.hasDecal,
    fileLabel: paintPanelProps.isTextureUvEditorOpen
      ? paintPanelProps.textureFileName || paintPanelProps.copy.notLoaded
      : selectedDecalFileName,
    labels: {
      decal: paintPanelProps.copy.textureModeDecal,
      texture: paintPanelProps.copy.textureModeReplace,
      upload: paintPanelProps.isTextureUvEditorOpen
        ? paintPanelProps.copy.uploadTexture
        : paintPanelProps.copy.uploadDecal,
      remove: paintPanelProps.isTextureUvEditorOpen
        ? paintPanelProps.copy.removeTexture
        : paintPanelProps.copy.removeDecal,
      file: copy.texture,
    },
  } as const;
  const shouldShowEditor = USE_EXTRACTED_UV_EDITOR_PORT ? isPaintPanelOpen : showUvEditor;

  return (
    <section className="stage-panel">
      <button
        className="paint-toggle-button"
        type="button"
        aria-label={copy.paintPanel}
        onClick={onTogglePaintPanel}
      >
        <span className="paint-toggle-button__icon">
          <SettingsGearIcon />
        </span>
      </button>
      <div className="stage-toolbar">
        <button
          className="locale-toggle"
          type="button"
          onClick={onToggleLocale}
          aria-label={`Switch language to ${locale === "ru" ? "English" : "Russian"}`}
        >
          <span className="locale-chip locale-chip--active">{locale === "ru" ? "R" : "E"}</span>
        </button>
        <button className="next-button" type="button" onClick={onNext}>
          {copy.next} <span aria-hidden>&rarr;</span>
        </button>
      </div>

      {!USE_EXTRACTED_UV_EDITOR_PORT && isPaintPanelOpen ? <PaintPanel {...paintPanelProps} /> : null}

      {shouldShowEditor ? (
        <UvEditorBridge {...uvEditorProps} extractedControls={extractedControls} />
      ) : null}

      <div className="stage-canvas-wrap">
        <Canvas
          shadows="percentage"
          dpr={[1, 2]}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ position: [0, 1.34, 5.05], fov: 31 }}
          onPointerUp={onCanvasPointerReset}
          onPointerLeave={onCanvasPointerReset}
        >
          <SceneBridge onReady={onSceneReady} />
          <color attach="background" args={["#ffffff"]} />
          <ambientLight intensity={0.62} />
          <hemisphereLight intensity={0.36} groundColor="#cfcfcf" />
          <directionalLight
            position={[2.5, 4.2, 2.8]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.1}
            shadow-camera-far={14}
            shadow-camera-left={-2.6}
            shadow-camera-right={2.6}
            shadow-camera-top={2.8}
            shadow-camera-bottom={-2.8}
          />
          <directionalLight position={[-2.4, 1.8, -1.8]} intensity={0.42} />

          <Suspense fallback={<SceneLoader />}>
            <group
              ref={avatarExportGroupRef}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
            >
              {selectedPresetBaseModelUrl ? (
                <AvatarModel
                  modelUrl={selectedPresetBaseModelUrl}
                  hiddenMeshes={composedScene.hiddenBaseMeshes}
                  tintByMesh={tintByMesh}
                  idleAnimationUrl={idleAnimationUrl}
                  replaceTextureUrl={shouldReplaceTexture ? replaceTextureUrl : null}
                  replaceTextureMeshes={shouldReplaceTexture ? replacementSlots : []}
                  replaceTextureScale={replaceScale}
                  replaceTextureScaleX={replaceScaleX}
                  replaceTextureScaleY={replaceScaleY}
                  replaceTextureRotationDeg={replaceRotationDeg}
                  enableIdleAnimation={!isAvatarStatic}
                  appliedUvDecals={appliedUvDecals}
                />
              ) : (
                <PlaceholderAvatar />
              )}

              {composedScene.parts.map((part) => (
                <AvatarModel
                  key={`${part.modelUrl}:${part.includeMeshes.join("|")}`}
                  modelUrl={part.modelUrl}
                  includeMeshes={part.includeMeshes}
                  tintByMesh={tintByMesh}
                  idleAnimationUrl={idleAnimationUrl}
                  replaceTextureUrl={shouldReplaceTexture ? replaceTextureUrl : null}
                  replaceTextureMeshes={shouldReplaceTexture ? replacementSlots : []}
                  replaceTextureScale={replaceScale}
                  replaceTextureScaleX={replaceScaleX}
                  replaceTextureScaleY={replaceScaleY}
                  replaceTextureRotationDeg={replaceRotationDeg}
                  enableIdleAnimation={!isAvatarStatic}
                  appliedUvDecals={appliedUvDecals}
                />
              ))}

              {composedScene.beardMaskUrl && composedScene.beardMaskModelUrl ? (
                <AvatarHeadMaskLayer
                  modelUrl={composedScene.beardMaskModelUrl}
                  maskUrl={composedScene.beardMaskUrl}
                  idleAnimationUrl={idleAnimationUrl}
                  enableIdleAnimation={!isAvatarStatic}
                />
              ) : null}
              {composedScene.eyebrowMaskUrl && composedScene.eyebrowMaskModelUrl ? (
                <AvatarHeadMaskLayer
                  modelUrl={composedScene.eyebrowMaskModelUrl}
                  maskUrl={composedScene.eyebrowMaskUrl}
                  idleAnimationUrl={idleAnimationUrl}
                  tintColor={selectedEyebrowColor}
                  renderOrder={21}
                  enableIdleAnimation={!isAvatarStatic}
                />
              ) : null}
              {composedScene.facemaskMaskUrl && composedScene.facemaskMaskModelUrl ? (
                <AvatarHeadMaskLayer
                  modelUrl={composedScene.facemaskMaskModelUrl}
                  maskUrl={composedScene.facemaskMaskUrl}
                  idleAnimationUrl={idleAnimationUrl}
                  renderOrder={22}
                  enableIdleAnimation={!isAvatarStatic}
                />
              ) : null}
            </group>
            <AutoStickerProjector
              enabled={Boolean(decalTextureUrl)}
              hasTarget={Boolean(stickerTargetMesh)}
              onPick={onAutoStickerPick}
            />

            <ContactShadows
              position={[0, -1.06, 0]}
              opacity={0.24}
              width={3.8}
              height={3.8}
              blur={3.9}
              far={2.3}
            />
          </Suspense>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.06, 0]} receiveShadow>
            <planeGeometry args={[8, 8]} />
            <shadowMaterial transparent opacity={0.26} />
          </mesh>

          <OrbitControls
            makeDefault
            enablePan
            enabled={!isStickerDragging}
            enableDamping
            dampingFactor={0.09}
            minDistance={0.65}
            maxDistance={16}
            minPolarAngle={Math.PI / 3.2}
            maxPolarAngle={Math.PI / 1.72}
            target={[0, -0.08, 0]}
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
          />
        </Canvas>
      </div>

      {showColorPanel ? (
        <div className="hair-color-panel" aria-label={colorPanelLabel}>
          {HAIR_COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              className={`hair-color-dot${selectedColor === color ? " hair-color-dot--active" : ""}`}
              onClick={() => onSelectColor(color)}
              style={{ background: color }}
              title={color}
              aria-label={`${colorPanelLabel} ${color}`}
            />
          ))}
        </div>
      ) : null}

      <input
        ref={decalUploadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="texture-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          onUploadByTarget(file, "decal");
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={textureUploadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="texture-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          onUploadByTarget(file, "replace");
          event.currentTarget.value = "";
        }}
      />
      {isExportModalOpen ? (
        <ExportPreviewModal
          copy={copy}
          previewUrl={exportPreviewUrl}
          downloadUrl={exportDownloadUrl}
          fileName={exportFileName}
          onClose={onCloseExportModal}
        />
      ) : null}
    </section>
  );
}
