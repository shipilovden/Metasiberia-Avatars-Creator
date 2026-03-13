import { useEffect, useMemo, useRef, useState } from "react";
import { ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Camera, Group, Mesh, Scene, Vector3, WebGLRenderer } from "three";
import type { PaintPanelProps } from "./components/PaintPanel";
import type { UvDecalEditorProps } from "./components/UvDecalEditor";
import { AssetSidebar } from "./components/avatar/AssetSidebar";
import { StagePanel } from "./components/avatar/StagePanel";
import {
  applyAssetToAvatarAssets,
  createAnonymousUser,
  createAvatarFromTemplate,
  patchAvatarGlb,
  postProcessExportedAvatarBlob,
} from "./components/avatar/export-utils";
import {
  datasetAssets,
  FACIAL_FEATURE_TYPES,
  getAppliedUvDecalsForMesh,
  groups,
  HAIR_COLOR_SWATCHES,
  IDLE_ANIMATION_URL,
  localAssetCapabilities,
  localLibrary,
  makeClientId,
  makeLookupKey,
  RPM_APP_NAME,
  SLOT_NAMES,
  TYPE_LABELS,
  UI_TEXT,
} from "./components/avatar/shared";
import type {
  AppliedUvDecal,
  AssetRecord,
  DecalAsset,
  LocalItem,
  MeshSlot,
  MeshTintMap,
  StickerTransform,
  SupportedType,
  UiGender,
  UiLocale,
} from "./components/avatar/shared";

type UvEditorMode = "decal" | "texture" | null;

function App() {
  const [activeType, setActiveType] = useState<SupportedType>(
    groups[0]?.types[0] || "top"
  );
  const [locale, setLocale] = useState<UiLocale>("ru");
  const [isPaintPanelOpen, setIsPaintPanelOpen] = useState(false);
  const [uvEditorMode, setUvEditorMode] = useState<UvEditorMode>(null);
  const [decalAssets, setDecalAssets] = useState<DecalAsset[]>([]);
  const [selectedDecalAssetId, setSelectedDecalAssetId] = useState<string | null>(null);
  const [replaceTextureUrlState, setReplaceTextureUrlState] = useState<string | null>(null);
  const [replaceFileName, setReplaceFileName] = useState<string>("");
  const [isStickerEditMode, setIsStickerEditMode] = useState(false);
  const [isStickerDragging, setIsStickerDragging] = useState(false);
  const [isAvatarStatic, setIsAvatarStatic] = useState(false);
  const [stickerTargetMesh, setStickerTargetMesh] = useState<Mesh | null>(null);
  const [uvDecalDraftUv, setUvDecalDraftUv] = useState<[number, number]>([0.5, 0.5]);
  const [uvDecalSlot, setUvDecalSlot] = useState<MeshSlot | null>(null);
  const [appliedUvDecals, setAppliedUvDecals] = useState<AppliedUvDecal[]>([]);
  const [uvTextureDraftUv, setUvTextureDraftUv] = useState<[number, number]>([0.5, 0.5]);
  const [uvTextureSlot, setUvTextureSlot] = useState<MeshSlot | null>(null);
  const [appliedUvTextures, setAppliedUvTextures] = useState<AppliedUvDecal[]>([]);
  const [decalTransform, setDecalTransform] = useState<StickerTransform>({
    position: [0, 0.35, 0.25],
    normal: [0, 0, 1],
    uv: [0.5, 0.5],
    scale: 0.35,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
  });
  const [replaceScale, setReplaceScale] = useState(0.35);
  const [replaceScaleX, setReplaceScaleX] = useState(1);
  const [replaceScaleY, setReplaceScaleY] = useState(1);
  const [replaceRotationDeg, setReplaceRotationDeg] = useState(0);
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string | null>(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState("metasibir-avatar.glb");
  const [selectedGender, setSelectedGender] = useState<UiGender>("male");
  const [selectedPresetId, setSelectedPresetId] = useState("preset-1");
  const [selectedHairColor, setSelectedHairColor] = useState<string>(HAIR_COLOR_SWATCHES[0]);
  const [selectedBeardColor, setSelectedBeardColor] = useState<string>(HAIR_COLOR_SWATCHES[0]);
  const [selectedEyebrowColor, setSelectedEyebrowColor] = useState<string>(
    HAIR_COLOR_SWATCHES[0]
  );
  const [selectedLipColor, setSelectedLipColor] = useState<string>(HAIR_COLOR_SWATCHES[23]);
  const [selectedByType, setSelectedByType] = useState<
    Partial<Record<SupportedType, string>>
  >({});
  const previousPresetRef = useRef("preset-1");
  const decalUploadInputRef = useRef<HTMLInputElement | null>(null);
  const textureUploadInputRef = useRef<HTMLInputElement | null>(null);
  const avatarExportGroupRef = useRef<Group | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  const selectedDecalAsset = useMemo(() => {
    if (!decalAssets.length) {
      return null;
    }

    return (
      decalAssets.find((asset) => asset.id === selectedDecalAssetId) ||
      decalAssets[decalAssets.length - 1] ||
      null
    );
  }, [decalAssets, selectedDecalAssetId]);
  const decalTextureUrl = selectedDecalAsset?.textureUrl || null;
  const decalFiles = useMemo(
    () =>
      decalAssets.map((asset) => ({
        id: asset.id,
        fileName: asset.fileName,
        isSelected: asset.id === selectedDecalAsset?.id,
      })),
    [decalAssets, selectedDecalAsset]
  );
  const isDecalUvEditorOpen = uvEditorMode === "decal";
  const isTextureUvEditorOpen = uvEditorMode === "texture";

  useEffect(() => {
    const browserLocale = navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
    setLocale(browserLocale);
  }, []);

  useEffect(() => {
    if (!isStickerEditMode) {
      setIsStickerDragging(false);
    }
  }, [isStickerEditMode]);

  useEffect(() => {
    if (selectedDecalAsset) {
      return;
    }

    setIsStickerEditMode(false);
    setStickerTargetMesh(null);
    setUvEditorMode((current) => (current === "decal" ? null : current));
  }, [selectedDecalAsset]);

  useEffect(() => {
    if (replaceTextureUrlState) {
      return;
    }

    setUvEditorMode((current) => (current === "texture" ? null : current));
  }, [replaceTextureUrlState]);

  useEffect(() => {
    setStickerTargetMesh(null);
  }, [selectedGender, selectedPresetId]);

  useEffect(() => {
    return () => {
      if (exportDownloadUrl) {
        URL.revokeObjectURL(exportDownloadUrl);
      }
    };
  }, [exportDownloadUrl]);

  const presetOptions = useMemo(
    () => localLibrary.presets?.[selectedGender]?.items || [],
    [selectedGender]
  );

  useEffect(() => {
    const nextPresetId =
      localLibrary.presets?.[selectedGender]?.defaultPresetId || presetOptions[0]?.id || "";

    setSelectedPresetId((current) =>
      presetOptions.some((preset) => preset.id === current) ? current : nextPresetId
    );
  }, [presetOptions, selectedGender]);

  const assetsByType = useMemo(() => {
    const grouped = new Map<SupportedType, AssetRecord[]>();

    for (const asset of datasetAssets) {
      if (!grouped.has(asset.type)) {
        grouped.set(asset.type, []);
      }
      grouped.get(asset.type)?.push(asset);
    }

    for (const assets of grouped.values()) {
      assets.sort((left, right) => {
        const byName = String(left.name).localeCompare(String(right.name));
        if (byName !== 0) return byName;
        return String(left.id).localeCompare(String(right.id));
      });
    }

    return grouped;
  }, []);

  const localItemsByAsset = useMemo(() => {
    const map = new Map<string, LocalItem>();

    for (const item of localLibrary.libraries?.[selectedGender]?.items || []) {
      map.set(makeLookupKey(item.type, item.id), item);
    }

    return map;
  }, [selectedGender]);

  const capabilityByAsset = useMemo(() => {
    const map = new Map<
      string,
      {
        meshes: string[];
        hasBeard: boolean;
        hasFacewear: boolean;
        hasGlasses: boolean;
        hasHair: boolean;
        hasHeadwear: boolean;
        hasTop: boolean;
        hasBottom: boolean;
        hasFootwear: boolean;
      }
    >();

    for (const [key, value] of Object.entries(localAssetCapabilities.items || {})) {
      if (!key.startsWith(`${selectedGender}:`)) {
        continue;
      }

      map.set(key.slice(selectedGender.length + 1), value);
    }

    return map;
  }, [selectedGender]);

  const assetByKey = useMemo(
    () =>
      new Map(
        datasetAssets.map((asset) => [makeLookupKey(asset.type, String(asset.id)), asset])
      ),
    []
  );

  const isAssetAvailableForGender = (asset: AssetRecord) =>
    asset.gender === "neutral" || asset.gender === selectedGender;

  const isAssetCompatibleWithType = (asset: AssetRecord) => {
    const capability = capabilityByAsset.get(makeLookupKey(asset.type, String(asset.id)));
    if (!capability) {
      return true;
    }

    if (asset.type === "headwear") {
      return capability.hasHeadwear;
    }

    if (asset.type === "facewear") {
      return capability.hasFacewear;
    }

    return true;
  };

  const getSelectedAssetRecord = (type: SupportedType) => {
    const assetId = selectedByType[type];
    if (!assetId) return null;
    return assetByKey.get(makeLookupKey(type, assetId)) || null;
  };

  const visibleAssets = useMemo(() => {
    return (assetsByType.get(activeType) || []).filter(
      (asset) => isAssetAvailableForGender(asset) && isAssetCompatibleWithType(asset)
    );
  }, [activeType, assetsByType, capabilityByAsset, selectedGender]);

  useEffect(() => {
    setSelectedByType((current) => {
      let changed = false;
      const next: Partial<Record<SupportedType, string>> = { ...current };

      for (const [type, assetId] of Object.entries(current) as [SupportedType, string][]) {
        const asset = assetByKey.get(makeLookupKey(type, assetId));
        const localItem = localItemsByAsset.get(makeLookupKey(type, assetId));

        if (!asset || !isAssetAvailableForGender(asset) || !localItem || localItem.error) {
          delete next[type];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [assetByKey, localItemsByAsset, selectedGender]);

  useEffect(() => {
    if (previousPresetRef.current === selectedPresetId) {
      return;
    }

    previousPresetRef.current = selectedPresetId;

    setSelectedByType((current) => {
      if (!current.beard && !current.facewear) {
        return current;
      }

      const next: Partial<Record<SupportedType, string>> = { ...current };
      delete next.beard;
      delete next.facewear;
      return next;
    });
  }, [selectedPresetId]);

  const selectedAssetId = selectedByType[activeType] || "";

  const selectedLocalByType = useMemo(() => {
    const byType = new Map<SupportedType, LocalItem>();

    for (const [type, assetId] of Object.entries(selectedByType) as [
      SupportedType,
      string,
    ][]) {
      const localItem = localItemsByAsset.get(makeLookupKey(type, assetId));
      const capability = capabilityByAsset.get(makeLookupKey(type, assetId));

      if (type === "headwear" && capability && !capability.hasHeadwear) {
        continue;
      }

      if (type === "facewear" && capability && !capability.hasFacewear) {
        continue;
      }

      if (localItem && !localItem.error) {
        byType.set(type, localItem);
      }
    }

    return byType;
  }, [capabilityByAsset, localItemsByAsset, selectedByType]);

  const selectedPreset =
    presetOptions.find((preset) => preset.id === selectedPresetId) || presetOptions[0] || null;
  const tintByMesh = useMemo<MeshTintMap>(
    () => ({
      [SLOT_NAMES.hair]: { color: selectedHairColor, mode: "flat" },
      "Wolf3D_Hair.001": { color: selectedHairColor, mode: "flat" },
      "hair-60": { color: selectedHairColor, mode: "flat" },
      low: { color: selectedHairColor, mode: "flat" },
      [SLOT_NAMES.beard]: { color: selectedBeardColor, mode: "flat" },
      [SLOT_NAMES.head]: selectedByType.lipshape
        ? { color: selectedLipColor, mode: "lips" }
        : undefined,
    }),
    [selectedBeardColor, selectedByType.lipshape, selectedHairColor, selectedLipColor]
  );
  const composedScene = useMemo(() => {
    const slotOwners = new Map<MeshSlot, string>();
    const getUrl = (type: SupportedType) => selectedLocalByType.get(type)?.glbUrl || null;
    const getCapability = (type: SupportedType) => {
      const assetId = selectedByType[type];
      if (!assetId) return null;
      return capabilityByAsset.get(makeLookupKey(type, assetId)) || null;
    };
    const suppressFacewear =
      activeType === "beard" || activeType === "headwear";
    const selectedBeardAsset = getSelectedAssetRecord("beard");
    const selectedEyebrowAsset = getSelectedAssetRecord("eyebrows");
    const selectedFacemaskAsset = getSelectedAssetRecord("facemask");

    const outfitUrl = getUrl("outfit");
    if (outfitUrl) {
      slotOwners.set(SLOT_NAMES.top, outfitUrl);
      slotOwners.set(SLOT_NAMES.bottom, outfitUrl);
      slotOwners.set(SLOT_NAMES.footwear, outfitUrl);
    } else {
      const topUrl = getUrl("top");
      const bottomUrl = getUrl("bottom");
      const footwearUrl = getUrl("footwear");

      if (topUrl) slotOwners.set(SLOT_NAMES.top, topUrl);
      if (bottomUrl) slotOwners.set(SLOT_NAMES.bottom, bottomUrl);
      if (footwearUrl) slotOwners.set(SLOT_NAMES.footwear, footwearUrl);
    }

    for (const featureType of FACIAL_FEATURE_TYPES) {
      const featureUrl = getUrl(featureType);
      const featureCapability = getCapability(featureType);
      if (!featureUrl || !featureCapability) {
        continue;
      }

      if (featureCapability.meshes.includes(SLOT_NAMES.head)) {
        slotOwners.set(SLOT_NAMES.head, featureUrl);
      }

      if (
        featureCapability.meshes.includes(SLOT_NAMES.eyeLeft) &&
        featureCapability.meshes.includes(SLOT_NAMES.eyeRight)
      ) {
        slotOwners.set(SLOT_NAMES.eyeLeft, featureUrl);
        slotOwners.set(SLOT_NAMES.eyeRight, featureUrl);
      }
    }

    const eyeUrl = getUrl("eye");
    if (eyeUrl) {
      slotOwners.set(SLOT_NAMES.eyeLeft, eyeUrl);
      slotOwners.set(SLOT_NAMES.eyeRight, eyeUrl);
    }

    const beardUrl = getUrl("beard");
    const eyebrowUrl = getUrl("eyebrows");
    const beardCapability = getCapability("beard");
    if (beardUrl) {
      slotOwners.set(SLOT_NAMES.head, beardUrl);

      if (beardCapability?.hasBeard) {
        slotOwners.set(SLOT_NAMES.beard, beardUrl);
      }
    }

    const headwearUrl = getUrl("headwear");
    if (headwearUrl) {
      slotOwners.set(SLOT_NAMES.hair, headwearUrl);
      slotOwners.set(SLOT_NAMES.headwear, headwearUrl);
    } else {
      const hairUrl = getUrl("hair");
      if (hairUrl) {
        slotOwners.set(SLOT_NAMES.hair, hairUrl);
      }
    }

    const glassesUrl = getUrl("glasses");
    if (glassesUrl) {
      slotOwners.set(SLOT_NAMES.glasses, glassesUrl);
    }

    const facewearUrl = suppressFacewear ? null : getUrl("facewear");
    if (facewearUrl) {
      slotOwners.set(SLOT_NAMES.head, facewearUrl);
      slotOwners.set(SLOT_NAMES.facewear, facewearUrl);
    } else if (
      beardUrl &&
      beardCapability?.hasFacewear &&
      !beardCapability?.hasBeard &&
      !selectedBeardAsset?.maskUrl
    ) {
      slotOwners.set(SLOT_NAMES.facewear, beardUrl);
    }

    const partsByUrl = new Map<string, MeshSlot[]>();
    for (const [slot, url] of slotOwners.entries()) {
      if (!partsByUrl.has(url)) {
        partsByUrl.set(url, []);
      }
      partsByUrl.get(url)?.push(slot);
    }

    const activeHeadModelUrl = slotOwners.get(SLOT_NAMES.head) || selectedPreset?.baseModelUrl || null;

    return {
      hiddenBaseMeshes: Array.from(slotOwners.keys()),
      slotModelUrls: Object.fromEntries(slotOwners.entries()) as Partial<Record<MeshSlot, string>>,
      beardMaskUrl: selectedBeardAsset?.maskUrl || null,
      beardMaskModelUrl: beardUrl,
      eyebrowMaskUrl: selectedEyebrowAsset?.maskUrl || null,
      eyebrowMaskModelUrl: eyebrowUrl,
      facemaskMaskUrl: selectedFacemaskAsset?.maskUrl || null,
      facemaskMaskModelUrl: activeHeadModelUrl,
      parts: Array.from(partsByUrl.entries()).map(([modelUrl, includeMeshes]) => ({
        modelUrl,
        includeMeshes,
      })),
    };
  }, [activeType, capabilityByAsset, selectedByType, selectedLocalByType, selectedPreset]);

  const updateStickerTransformFromEvent = (
    event: ThreeEvent<PointerEvent>,
    lockedMesh: Mesh | null = null
  ) => {
    const avatarSurfaceHits = event.intersections.filter((hit) => {
      const data = (hit.object as { userData?: Record<string, unknown> }).userData;
      return Boolean(data?.avatarSurface);
    });
    const surfaceHit = lockedMesh
      ? avatarSurfaceHits.find((hit) => hit.object === lockedMesh) || null
      : avatarSurfaceHits[0] || null;

    if (!surfaceHit) {
      return;
    }

    const hitObject = surfaceHit.object as Mesh;
    const worldNormal = surfaceHit.face
      ? surfaceHit.face.normal.clone().transformDirection(hitObject.matrixWorld).normalize()
      : new Vector3(0, 0, 1);

    setDecalTransform((current) => ({
      ...current,
      position: [surfaceHit.point.x, surfaceHit.point.y, surfaceHit.point.z],
      normal: [worldNormal.x, worldNormal.y, worldNormal.z],
      uv: surfaceHit.uv ? [surfaceHit.uv.x, surfaceHit.uv.y] : current.uv,
    }));
    setStickerTargetMesh(hitObject);
  };

  const handleUploadByTarget = (file: File | null, target: "decal" | "replace") => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        return;
      }

      if (target === "decal") {
        const nextAsset: DecalAsset = {
          id: makeClientId(),
          fileName: file.name,
          textureUrl: result,
        };
        setDecalAssets((current) => [...current, nextAsset]);
        setSelectedDecalAssetId(nextAsset.id);
        setIsStickerEditMode(true);
        setStickerTargetMesh(null);
      } else {
        setReplaceTextureUrlState((current) => {
          if (current && current.startsWith("blob:")) {
            URL.revokeObjectURL(current);
          }
          return result;
        });
        setReplaceFileName(file.name);
        setAppliedUvTextures([]);
        setUvTextureDraftUv([0.5, 0.5]);
        setReplaceScale(0.35);
        setReplaceScaleX(1);
        setReplaceScaleY(1);
        setReplaceRotationDeg(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeDecalAsset = (assetId: string) => {
    let nextSelectedId: string | null = selectedDecalAssetId;
    let removedSelected = false;
    setDecalAssets((current) => {
      const assetToRemove = current.find((asset) => asset.id === assetId) || null;
      removedSelected = selectedDecalAssetId === assetId;
      const remaining = current.filter((asset) => asset.id !== assetId);
      if (removedSelected) {
        nextSelectedId = remaining[remaining.length - 1]?.id || null;
      }
      if (assetToRemove?.textureUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(assetToRemove.textureUrl);
      }
      return remaining;
    });
    setAppliedUvDecals((current) => current.filter((entry) => entry.assetId !== assetId));
    setSelectedDecalAssetId(nextSelectedId);
    if (selectedDecalAssetId === assetId) {
      setStickerTargetMesh(null);
      setIsStickerEditMode(Boolean(nextSelectedId));
    }
  };

  const handleSelectAsset = (asset: AssetRecord) => {
    const id = String(asset.id);

    setSelectedByType((current) => {
      const next: Partial<Record<SupportedType, string>> = { ...current };
      const isSameAsset = next[asset.type] === id;

      if (isSameAsset) {
        delete next[asset.type];
        return next;
      }

      next[asset.type] = id;

      if (FACIAL_FEATURE_TYPES.includes(asset.type)) {
        for (const featureType of FACIAL_FEATURE_TYPES) {
          if (featureType !== asset.type) {
            delete next[featureType];
          }
        }
      }

      if (asset.type === "outfit") {
        delete next.top;
        delete next.bottom;
        delete next.footwear;
      }

      if (asset.type === "top" || asset.type === "bottom" || asset.type === "footwear") {
        delete next.outfit;
      }

      if (asset.type === "beard" || asset.type === "headwear") {
        delete next.facewear;
      }

      return next;
    });
  };

  const handleClearType = () => {
    setSelectedByType((current) => {
      const next: Partial<Record<SupportedType, string>> = { ...current };
      delete next[activeType];
      return next;
    });
  };

  const copy = UI_TEXT[locale];
  const colorPanelLabel =
    activeType === "beard"
      ? copy.beardColor || copy.hairColor
      : activeType === "eyebrows"
        ? copy.eyebrowColor || copy.hairColor
        : activeType === "lipshape"
          ? copy.lipColor || copy.hairColor
          : copy.hairColor;
  const typeLabels = TYPE_LABELS[locale];
  const idleAnimationUrl = IDLE_ANIMATION_URL[selectedGender];
  const replacementSlots = useMemo<readonly MeshSlot[]>(() => {
    if (activeType === "top") return [SLOT_NAMES.top];
    if (activeType === "bottom") return [SLOT_NAMES.bottom];
    if (activeType === "footwear") return [SLOT_NAMES.footwear];
    if (activeType === "headwear") return [SLOT_NAMES.headwear];
    if (activeType === "facewear") return [SLOT_NAMES.facewear];
    if (activeType === "outfit")
      return [SLOT_NAMES.top, SLOT_NAMES.bottom, SLOT_NAMES.footwear];
    return [];
  }, [activeType]);
  const canUseReplacement = replacementSlots.length > 0;
  const shouldReplaceTexture = false;
  const decalSlots = replacementSlots;
  const appliedUvOverlays = useMemo(
    () => [...appliedUvTextures, ...appliedUvDecals],
    [appliedUvTextures, appliedUvDecals]
  );
  const decalSlotOptions = useMemo(
    () =>
      decalSlots.map((slot) => {
        if (slot === SLOT_NAMES.top) {
          return { id: slot, label: typeLabels.top };
        }
        if (slot === SLOT_NAMES.bottom) {
          return { id: slot, label: typeLabels.bottom };
        }
        if (slot === SLOT_NAMES.footwear) {
          return { id: slot, label: typeLabels.footwear };
        }
        if (slot === SLOT_NAMES.headwear) {
          return { id: slot, label: typeLabels.headwear };
        }
        return { id: slot, label: typeLabels.facewear };
      }),
    [decalSlots, typeLabels]
  );

  useEffect(() => {
    const firstSlot = decalSlots[0] || null;
    if (!firstSlot) {
      setUvDecalSlot(null);
      return;
    }

    setUvDecalSlot((current) => (current && decalSlots.includes(current) ? current : firstSlot));
  }, [decalSlots]);

  useEffect(() => {
    const firstSlot = decalSlots[0] || null;
    if (!firstSlot) {
      setUvTextureSlot(null);
      return;
    }

    setUvTextureSlot((current) =>
      current && decalSlots.includes(current) ? current : firstSlot
    );
  }, [decalSlots]);

  useEffect(() => {
    if (!uvDecalSlot) {
      return;
    }

    const slotDecals = getAppliedUvDecalsForMesh(appliedUvDecals, uvDecalSlot);
    const latestSlotDecal = slotDecals[slotDecals.length - 1];
    if (latestSlotDecal) {
      setUvDecalDraftUv(latestSlotDecal.uv);
      setDecalTransform((current) => ({
        ...current,
        scaleX: latestSlotDecal.scaleX,
        scaleY: latestSlotDecal.scaleY,
      }));
      return;
    }

    setUvDecalDraftUv([0.5, 0.5]);
    setDecalTransform((current) => ({
      ...current,
      scaleX: 1,
      scaleY: 1,
    }));
  }, [appliedUvDecals, uvDecalSlot]);

  useEffect(() => {
    if (!uvTextureSlot) {
      return;
    }

    const slotTextures = getAppliedUvDecalsForMesh(appliedUvTextures, uvTextureSlot);
    const latestSlotTexture = slotTextures[slotTextures.length - 1];
    if (latestSlotTexture) {
      setUvTextureDraftUv(latestSlotTexture.uv);
      setReplaceScale(latestSlotTexture.scale);
      setReplaceScaleX(latestSlotTexture.scaleX);
      setReplaceScaleY(latestSlotTexture.scaleY);
      setReplaceRotationDeg(latestSlotTexture.rotationDeg);
      return;
    }

    setUvTextureDraftUv([0.5, 0.5]);
    setReplaceScale(0.35);
    setReplaceScaleX(1);
    setReplaceScaleY(1);
    setReplaceRotationDeg(0);
  }, [appliedUvTextures, uvTextureSlot]);
  const uvEditorModelUrl =
    (uvDecalSlot ? composedScene.slotModelUrls[uvDecalSlot] || null : null) ||
    selectedPreset?.baseModelUrl ||
    null;
  const uvTextureEditorModelUrl =
    (uvTextureSlot ? composedScene.slotModelUrls[uvTextureSlot] || null : null) ||
    selectedPreset?.baseModelUrl ||
    null;
  const handleNext = () => {
    const exportRoot = avatarExportGroupRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!exportRoot || !renderer || !scene || !camera) {
      return;
    }

    renderer.render(scene, camera);

    const sourceCanvas = renderer.domElement;
    const previewCanvas = document.createElement("canvas");
    const previewHeight = 1200;
    const previewWidth = 900;
    const cropHeight = sourceCanvas.height * 0.8;
    const cropWidth = cropHeight * (previewWidth / previewHeight);
    const cropX = Math.max(0, (sourceCanvas.width - cropWidth) * 0.5);
    const cropY = Math.max(0, sourceCanvas.height * 0.05);
    previewCanvas.width = previewWidth;
    previewCanvas.height = previewHeight;
    const previewContext = previewCanvas.getContext("2d");
    if (!previewContext) {
      return;
    }
    previewContext.fillStyle = "#ffffff";
    previewContext.fillRect(0, 0, previewWidth, previewHeight);
    previewContext.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      previewWidth,
      previewHeight
    );
    const previewUrl = previewCanvas.toDataURL("image/png");
    setExportPreviewUrl(previewUrl);
    setIsExportModalOpen(true);

    setExportDownloadUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });

    const fileName = `metasibir-avatar-${selectedGender}-${selectedPresetId}.glb`;
    setExportFileName(fileName);
    const templateId = selectedPreset?.templateId;
    if (!templateId) {
      return;
    }

    void (async () => {
      try {
        const { token, userId } = await createAnonymousUser(RPM_APP_NAME);
        const avatar = await createAvatarFromTemplate({
          token,
          userId,
          templateId,
          appName: RPM_APP_NAME,
        });

        const finalAssets = Object.entries(selectedByType).reduce<Record<string, string>>(
          (current, [type, assetId]) =>
            applyAssetToAvatarAssets({
              type: type as SupportedType,
              assetId,
              baseAssets: current,
            }),
          avatar.assets || {}
        );

        const blob = await patchAvatarGlb({
          token,
          avatarId: avatar.id,
          assets: finalAssets,
        });
        const processedBlob = await postProcessExportedAvatarBlob({
          sourceBlob: blob,
          replaceTextureUrl: shouldReplaceTexture ? replaceTextureUrlState : null,
          replaceTextureMeshes: shouldReplaceTexture ? replacementSlots : [],
          replaceTextureScale: replaceScale,
          replaceTextureScaleX: replaceScaleX,
          replaceTextureScaleY: replaceScaleY,
          replaceTextureRotationDeg: replaceRotationDeg,
          appliedUvDecals: appliedUvOverlays,
        });

        const url = URL.createObjectURL(processedBlob);
        setExportDownloadUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return url;
        });
      } catch (error) {
        console.error("Failed to export RPM avatar", error);
      }
    })();
  };

  const handleToggleLocale = () => {
    setLocale((current) => (current === "ru" ? "en" : "ru"));
  };

  const handleSceneReady = ({
    renderer,
    scene,
    camera,
  }: {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
  }) => {
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
  };

  const handleCanvasPointerReset = () => {
    setIsStickerDragging(false);
  };

  const handleStagePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!decalTextureUrl || !isStickerEditMode) return;
    updateStickerTransformFromEvent(event, null);
    setIsStickerDragging(true);
    event.stopPropagation();
  };

  const handleStagePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!decalTextureUrl || !isStickerEditMode || !isStickerDragging) return;
    updateStickerTransformFromEvent(event, stickerTargetMesh);
    event.stopPropagation();
  };

  const handleStagePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!decalTextureUrl || !isStickerEditMode) return;
    setIsStickerDragging(false);
    event.stopPropagation();
  };

  const handleAutoStickerPick = ({
    mesh,
    point,
    normal,
    uv,
  }: {
    mesh: Mesh;
    point: Vector3;
    normal: Vector3;
    uv: [number, number] | null;
  }) => {
    setStickerTargetMesh(mesh);
    setDecalTransform((current) => ({
      ...current,
      position: [point.x, point.y, point.z],
      normal: [normal.x, normal.y, normal.z],
      uv: uv || current.uv,
    }));
  };

  const handleSelectColor = (color: string) => {
    if (activeType === "beard") {
      setSelectedBeardColor(color);
      return;
    }

    if (activeType === "eyebrows") {
      setSelectedEyebrowColor(color);
      return;
    }

    if (activeType === "lipshape") {
      setSelectedLipColor(color);
      return;
    }

    setSelectedHairColor(color);
  };

  const selectedColor =
    activeType === "beard"
      ? selectedBeardColor
      : activeType === "eyebrows"
        ? selectedEyebrowColor
        : activeType === "lipshape"
          ? selectedLipColor
          : selectedHairColor;

  const showColorPanel =
    activeType === "hair" ||
    activeType === "beard" ||
    activeType === "eyebrows" ||
    activeType === "lipshape";

  const paintPanelProps: PaintPanelProps = {
    copy,
    decalFiles,
    hasDecal: Boolean(decalAssets.length),
    onUploadDecal: () => decalUploadInputRef.current?.click(),
    onRemoveDecal: () => {
      if (selectedDecalAssetId) {
        removeDecalAsset(selectedDecalAssetId);
      }
    },
    onSelectDecalFile: setSelectedDecalAssetId,
    onRemoveDecalFile: removeDecalAsset,
    isUvEditorOpen: isDecalUvEditorOpen,
    onToggleUvEditor: () =>
      setUvEditorMode((current) => (current === "decal" ? null : "decal")),
    isTextureUvEditorOpen,
    onToggleTextureUvEditor: () =>
      setUvEditorMode((current) => (current === "texture" ? null : "texture")),
    isDecalEditMode: isStickerEditMode,
    onToggleDecalEditMode: setIsStickerEditMode,
    decalScale: decalTransform.scale,
    onDecalScale: (value) =>
      setDecalTransform((current) => ({
        ...current,
        scale: value,
      })),
    decalRotationDeg: decalTransform.rotationDeg,
    onDecalRotationDeg: (value) =>
      setDecalTransform((current) => ({
        ...current,
        rotationDeg: value,
      })),
    textureFileName: replaceFileName,
    hasTexture: Boolean(replaceTextureUrlState),
    canUseReplacement,
    onUploadTexture: () => textureUploadInputRef.current?.click(),
    onRemoveTexture: () => {
      setReplaceTextureUrlState((current) => {
        if (current && current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      setReplaceFileName("");
      setAppliedUvTextures([]);
      setUvTextureDraftUv([0.5, 0.5]);
      setUvEditorMode((current) => (current === "texture" ? null : current));
    },
    replaceScale,
    onReplaceScale: setReplaceScale,
    replaceScaleX,
    onReplaceScaleX: setReplaceScaleX,
    replaceScaleY,
    onReplaceScaleY: setReplaceScaleY,
    replaceRotationDeg: replaceRotationDeg,
    onReplaceRotationDeg: setReplaceRotationDeg,
    isAvatarStatic,
    onToggleAvatarStatic: setIsAvatarStatic,
  };

  const textureUvCopy = useMemo(
    () => ({
      ...copy,
      uvEditorTitle: locale === "ru" ? "UV-текстура" : "UV texture",
      uvEditorHint:
        locale === "ru"
          ? "Двигайте текстуру по UV-канве и нажмите применить"
          : "Move the texture on the UV canvas and apply it to the avatar",
    }),
    [copy, locale]
  );

  const decalUvEditorProps: UvDecalEditorProps = {
    copy,
    slotOptions: decalSlotOptions,
    selectedSlot: uvDecalSlot,
    onSelectSlot: (slot) => setUvDecalSlot(slot as MeshSlot),
    modelUrl: uvEditorModelUrl,
    decalTextureUrl,
    appliedDecals: appliedUvDecals,
    draftUv: uvDecalDraftUv,
    scale: decalTransform.scale,
    scaleX: decalTransform.scaleX,
    scaleY: decalTransform.scaleY,
    rotationDeg: decalTransform.rotationDeg,
    onDraftUvChange: setUvDecalDraftUv,
    onScaleXChange: (value) =>
      setDecalTransform((current) => ({
        ...current,
        scaleX: value,
      })),
    onScaleYChange: (value) =>
      setDecalTransform((current) => ({
        ...current,
        scaleY: value,
      })),
    onApply: () => {
      if (!decalTextureUrl || !uvDecalSlot || !selectedDecalAsset) {
        return;
      }

      setAppliedUvDecals((current) => [
        ...current,
        {
          id: makeClientId(),
          assetId: selectedDecalAsset.id,
          fileName: selectedDecalAsset.fileName,
          meshName: uvDecalSlot,
          uv: uvDecalDraftUv,
          scale: decalTransform.scale,
          scaleX: decalTransform.scaleX,
          scaleY: decalTransform.scaleY,
          rotationDeg: decalTransform.rotationDeg,
          textureUrl: decalTextureUrl,
        },
      ]);
    },
    onReset: () => {
      setUvDecalDraftUv([0.5, 0.5]);
      setDecalTransform((current) => ({
        ...current,
        scaleX: 1,
        scaleY: 1,
      }));
    },
    onClearApplied: () =>
      setAppliedUvDecals((current) =>
        uvDecalSlot ? current.filter((entry) => entry.meshName !== uvDecalSlot) : current
      ),
    hasApplied: Boolean(
      uvDecalSlot && getAppliedUvDecalsForMesh(appliedUvDecals, uvDecalSlot).length
    ),
  };

  const textureUvEditorProps: UvDecalEditorProps = {
    copy: textureUvCopy,
    slotOptions: decalSlotOptions,
    selectedSlot: uvTextureSlot,
    onSelectSlot: (slot) => setUvTextureSlot(slot as MeshSlot),
    modelUrl: uvTextureEditorModelUrl,
    decalTextureUrl: replaceTextureUrlState,
    appliedDecals: appliedUvTextures,
    draftUv: uvTextureDraftUv,
    scale: replaceScale,
    scaleX: replaceScaleX,
    scaleY: replaceScaleY,
    rotationDeg: replaceRotationDeg,
    onDraftUvChange: setUvTextureDraftUv,
    onScaleXChange: setReplaceScaleX,
    onScaleYChange: setReplaceScaleY,
    onApply: () => {
      if (!replaceTextureUrlState || !uvTextureSlot) {
        return;
      }

      setAppliedUvTextures((current) => [
        ...current,
        {
          id: makeClientId(),
          assetId: `texture:${makeClientId()}`,
          fileName: replaceFileName || "texture",
          meshName: uvTextureSlot,
          uv: uvTextureDraftUv,
          scale: replaceScale,
          scaleX: replaceScaleX,
          scaleY: replaceScaleY,
          rotationDeg: replaceRotationDeg,
          textureUrl: replaceTextureUrlState,
        },
      ]);
    },
    onReset: () => {
      setUvTextureDraftUv([0.5, 0.5]);
      setReplaceScale(0.35);
      setReplaceScaleX(1);
      setReplaceScaleY(1);
      setReplaceRotationDeg(0);
    },
    onClearApplied: () =>
      setAppliedUvTextures((current) =>
        uvTextureSlot ? current.filter((entry) => entry.meshName !== uvTextureSlot) : current
      ),
    hasApplied: Boolean(
      uvTextureSlot && getAppliedUvDecalsForMesh(appliedUvTextures, uvTextureSlot).length
    ),
  };

  const uvEditorProps =
    uvEditorMode === "texture" ? textureUvEditorProps : decalUvEditorProps;
  return (
    <main className="creator-shell">
      <StagePanel
        copy={copy}
        locale={locale}
        onToggleLocale={handleToggleLocale}
        onNext={handleNext}
        isPaintPanelOpen={isPaintPanelOpen}
        onTogglePaintPanel={() => setIsPaintPanelOpen((current) => !current)}
        paintPanelProps={paintPanelProps}
        showUvEditor={isPaintPanelOpen && uvEditorMode !== null}
        uvEditorProps={uvEditorProps}
        avatarExportGroupRef={avatarExportGroupRef}
        onSceneReady={handleSceneReady}
        onCanvasPointerReset={handleCanvasPointerReset}
        onStagePointerDown={handleStagePointerDown}
        onStagePointerMove={handleStagePointerMove}
        onStagePointerUp={handleStagePointerUp}
        selectedPresetBaseModelUrl={selectedPreset?.baseModelUrl || null}
        composedScene={composedScene}
        tintByMesh={tintByMesh}
        idleAnimationUrl={idleAnimationUrl}
        shouldReplaceTexture={shouldReplaceTexture}
        replaceTextureUrl={replaceTextureUrlState}
        replacementSlots={replacementSlots}
        replaceScale={replaceScale}
        replaceScaleX={replaceScaleX}
        replaceScaleY={replaceScaleY}
        replaceRotationDeg={replaceRotationDeg}
        isAvatarStatic={isAvatarStatic}
        isStickerDragging={isStickerDragging}
        appliedUvDecals={appliedUvOverlays}
        selectedEyebrowColor={selectedEyebrowColor}
        decalTextureUrl={decalTextureUrl}
        stickerTargetMesh={stickerTargetMesh}
        onAutoStickerPick={handleAutoStickerPick}
        showColorPanel={showColorPanel}
        colorPanelLabel={colorPanelLabel}
        selectedColor={selectedColor}
        onSelectColor={handleSelectColor}
        decalUploadInputRef={decalUploadInputRef}
        textureUploadInputRef={textureUploadInputRef}
        onUploadByTarget={handleUploadByTarget}
        isExportModalOpen={isExportModalOpen}
        exportPreviewUrl={exportPreviewUrl}
        exportDownloadUrl={exportDownloadUrl}
        exportFileName={exportFileName}
        onCloseExportModal={() => setIsExportModalOpen(false)}
      />
      <AssetSidebar
        copy={copy}
        selectedGender={selectedGender}
        onSelectGender={setSelectedGender}
        presetOptions={presetOptions}
        selectedPresetId={selectedPresetId}
        onSelectPresetId={setSelectedPresetId}
        activeType={activeType}
        onSelectType={setActiveType}
        typeLabels={typeLabels}
        selectedAssetId={selectedAssetId}
        onClearType={handleClearType}
        visibleAssets={visibleAssets}
        localItemsByAsset={localItemsByAsset}
        onSelectAsset={handleSelectAsset}
      />
    </main>
  );}

useGLTF.preload(IDLE_ANIMATION_URL.male);
useGLTF.preload(IDLE_ANIMATION_URL.female);

export default App;
