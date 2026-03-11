import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Html,
  OrbitControls,
  useGLTF,
  useProgress,
  useTexture,
} from "@react-three/drei";
import { Group, MOUSE, MeshStandardMaterial, SRGBColorSpace } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import assetSchema from "./config/asset-schema.json";
import assetDataset from "./data/assets-catalog.json";
import localAssetCapabilitiesManifest from "./data/generated/local-asset-capabilities.json";
import localLibraryManifest from "./data/generated/local-library-manifest.json";

type SupportedType =
  | "top"
  | "bottom"
  | "footwear"
  | "outfit"
  | "hair"
  | "eye"
  | "glasses"
  | "headwear"
  | "beard"
  | "facewear";

type UiGender = "male" | "female";
type AssetGender = UiGender | "neutral";

type AssetRecord = {
  id: string | number;
  name: string;
  type: SupportedType;
  gender: AssetGender;
  bodyType?: string;
  iconUrl?: string;
  maskUrl?: string;
  beardStyle?: string;
};

type GroupSchema = {
  id: string;
  label: string;
  types: SupportedType[];
};

type LocalItem = {
  id: string;
  type: SupportedType;
  glbUrl: string;
  iconUrl: string | null;
  error: string | null;
};

type LocalPreset = {
  id: string;
  label: string;
  gender: UiGender;
  templateId: string;
  baseModelUrl: string | null;
  previewUrl: string | null;
};

type LocalGenderLibrary = {
  gender: UiGender;
  defaultPresetId: string;
  baseModelUrl: string | null;
  items: LocalItem[];
};

type LocalLibraryManifest = {
  libraries: Record<UiGender, LocalGenderLibrary>;
  presets: Record<
    UiGender,
    {
      defaultPresetId: string;
      items: LocalPreset[];
    }
  >;
};

type LocalAssetCapabilitiesManifest = {
  items: Record<
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
  >;
};

type UiLocale = "ru" | "en";

const groups = assetSchema.groups as GroupSchema[];
const allTypes = assetSchema.types as { id: SupportedType; label: string }[];
const datasetAssets = assetDataset.assets as AssetRecord[];
const localAssetCapabilities =
  localAssetCapabilitiesManifest as LocalAssetCapabilitiesManifest;
const localLibrary = localLibraryManifest as LocalLibraryManifest;

const CATEGORY_ICONS: Record<string, string> = {
  clothing: "T",
  "face-hair": "F",
  accessories: "A",
};

const TYPE_LABELS: Record<UiLocale, Record<SupportedType, string>> = {
  ru: {
    top: "Верх",
    bottom: "Низ",
    footwear: "Обувь",
    outfit: "Образы",
    hair: "Волосы",
    eye: "Глаза",
    glasses: "Очки",
    headwear: "Головные",
    beard: "Борода",
    facewear: "Маски",
  },
  en: {
    top: "Tops",
    bottom: "Bottoms",
    footwear: "Footwear",
    outfit: "Outfits",
    hair: "Hair",
    eye: "Eyes",
    glasses: "Glasses",
    headwear: "Headwear",
    beard: "Beard",
    facewear: "Facewear",
  },
};

const GROUP_LABELS: Record<UiLocale, Record<string, string>> = {
  ru: {
    clothing: "Одежда",
    "face-hair": "Лицо и волосы",
    accessories: "Аксессуары",
  },
  en: {
    clothing: "Clothing",
    "face-hair": "Face & Hair",
    accessories: "Accessories",
  },
};

const UI_TEXT: Record<
  UiLocale,
  {
    next: string;
    clearSelection: string;
    settings: string;
    male: string;
    female: string;
    preset: string;
    hairColor: string;
    beardColor?: string;
  }
> = {
  ru: {
    next: "ДАЛЕЕ",
    clearSelection: "Снять",
    settings: "Настройки",
    male: "Муж",
    female: "Жен",
    preset: "База",
    hairColor: "Цвет волос",
    beardColor: "Цвет бороды",
  },
  en: {
    next: "NEXT",
    clearSelection: "Clear",
    settings: "Settings",
    male: "Male",
    female: "Female",
    preset: "Base",
    hairColor: "Hair color",
    beardColor: "Beard color",
  },
};

const POSITION_OFFSET: [number, number, number] = [0, -1.06, 0];
const HAIR_COLOR_SWATCHES = [
  "#151515",
  "#242424",
  "#2d1f1a",
  "#3b2a1f",
  "#473225",
  "#5b3b29",
  "#6c4430",
  "#7a4c30",
  "#885437",
  "#965733",
  "#a76337",
  "#b86b3b",
  "#c97a3c",
  "#d1863f",
  "#df994a",
  "#ebb04f",
  "#f1c261",
  "#f3d06f",
  "#e9a95d",
  "#de8e4e",
  "#d8733f",
  "#d34134",
  "#cf3b51",
  "#b93a67",
  "#9d3d7b",
  "#7f4a8f",
  "#5e4d9f",
  "#4155ae",
  "#2e659f",
  "#1f7389",
  "#2c816f",
  "#4d8a55",
  "#739246",
  "#9a8c40",
  "#b3823f",
  "#c4572e",
  "#a83d24",
  "#a48f66",
  "#b09b77",
  "#c2b289",
  "#8d7964",
  "#735f50",
  "#5f4a41",
  "#8b8b8b",
  "#8f9394",
  "#acb0b2",
  "#c7cacb",
  "#dddddd",
  "#f2f2f2",
] as const;

const SLOT_NAMES = {
  body: "Wolf3D_Body",
  head: "Wolf3D_Head",
  teeth: "Wolf3D_Teeth",
  hair: "Wolf3D_Hair",
  beard: "Wolf3D_Beard",
  glasses: "Wolf3D_Glasses",
  headwear: "Wolf3D_Headwear",
  facewear: "Wolf3D_Facewear",
  top: "Wolf3D_Outfit_Top",
  bottom: "Wolf3D_Outfit_Bottom",
  footwear: "Wolf3D_Outfit_Footwear",
  eyeLeft: "EyeLeft",
  eyeRight: "EyeRight",
} as const;

type MeshSlot = (typeof SLOT_NAMES)[keyof typeof SLOT_NAMES];
type MeshTintMap = Partial<Record<string, string>>;

const makeLookupKey = (type: string, id: string) => `${type}:${id}`;
function AvatarModel({
  modelUrl,
  includeMeshes,
  hiddenMeshes,
  tintByMesh,
}: {
  modelUrl: string;
  includeMeshes?: readonly MeshSlot[];
  hiddenMeshes?: readonly MeshSlot[];
  tintByMesh?: MeshTintMap;
}) {
  const { scene } = useGLTF(modelUrl) as { scene: Group };
  const includeKey = includeMeshes?.join("|") || "";
  const hiddenKey = hiddenMeshes?.join("|") || "";
  const tintKey = useMemo(
    () =>
      Object.entries(tintByMesh || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([slot, color]) => `${slot}:${color}`)
        .join("|"),
    [tintByMesh]
  );

  const preparedScene = useMemo(() => {
    const includeSet = includeMeshes ? new Set(includeMeshes) : null;
    const hiddenSet = new Set(hiddenMeshes || []);
    const cloneMaterialWithTint = (material: unknown, tintColor: string): unknown => {
      const tintOne = (entry: unknown): unknown => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }

        const materialEntry = entry as {
          clone?: () => unknown;
          color?: { set?: (value: string) => void };
          map?: unknown;
        };

        if (typeof materialEntry.clone !== "function") {
          return entry;
        }

        const clonedMaterial = materialEntry.clone() as {
          color?: { set?: (value: string) => void };
          map?: unknown;
          needsUpdate?: boolean;
        };
        // Full recolor: ignore baked albedo so selected color is not just a tint.
        if ("map" in clonedMaterial) {
          clonedMaterial.map = null;
        }
        clonedMaterial.color?.set?.(tintColor);
        if ("needsUpdate" in clonedMaterial) {
          clonedMaterial.needsUpdate = true;
        }
        return clonedMaterial;
      };

      if (Array.isArray(material)) {
        return material.map((entry) => tintOne(entry));
      }

      return tintOne(material);
    };
    const cloned = clone(scene) as Group;

    cloned.traverse((object) => {
      const mesh = object as {
        isMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
        visible?: boolean;
        name?: string;
        material?: unknown;
      };

      if (!mesh.isMesh) {
        return;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (includeSet) {
        mesh.visible = includeSet.has(mesh.name as MeshSlot);
      } else if (hiddenSet.size > 0) {
        mesh.visible = !hiddenSet.has(mesh.name as MeshSlot);
      }

      const tintColor = mesh.name ? tintByMesh?.[mesh.name] : null;
      if (tintColor && mesh.material) {
        mesh.material = cloneMaterialWithTint(mesh.material, tintColor);
      }
    });

    return cloned;
  }, [hiddenKey, includeKey, includeMeshes, hiddenMeshes, scene, tintByMesh, tintKey]);

  return <primitive object={preparedScene} position={POSITION_OFFSET} />;
}

function AvatarHeadMaskLayer({
  modelUrl,
  maskUrl,
}: {
  modelUrl: string;
  maskUrl: string;
}) {
  const { scene } = useGLTF(modelUrl) as { scene: Group };
  const maskTexture = useTexture(maskUrl);

  useEffect(() => {
    maskTexture.flipY = false;
    maskTexture.colorSpace = SRGBColorSpace;
    maskTexture.needsUpdate = true;
  }, [maskTexture]);

  const preparedScene = useMemo(() => {
    const cloned = clone(scene) as Group;

    cloned.traverse((object) => {
      const mesh = object as {
        isMesh?: boolean;
        isSkinnedMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
        visible?: boolean;
        name?: string;
        material?: unknown;
        renderOrder?: number;
      };

      if (!mesh.isMesh) {
        return;
      }

      const isHead = mesh.name === SLOT_NAMES.head;
      mesh.visible = isHead;

      if (!isHead) {
        return;
      }

      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 20;

      const overlayMaterial = new MeshStandardMaterial({
        map: maskTexture,
        alphaMap: maskTexture,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });

      overlayMaterial.alphaTest = 0.08;
      mesh.material = overlayMaterial;
    });

    return cloned;
  }, [maskTexture, modelUrl, scene]);

  return <primitive object={preparedScene} position={POSITION_OFFSET} />;
}

function PlaceholderAvatar() {
  return (
    <group position={[0, -0.15, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.74, 0]}>
        <capsuleGeometry args={[0.28, 1.1, 10, 18]} />
        <meshStandardMaterial color="#8e8e8e" roughness={0.58} metalness={0.05} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.66, 0]}>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial color="#b5b5b5" roughness={0.5} metalness={0.04} />
      </mesh>
    </group>
  );
}

function SceneLoader() {
  const { active, progress } = useProgress();

  if (!active) {
    return null;
  }

  return (
    <Html center>
      <div className="canvas-loader">
        <div className="canvas-loader__ring" />
        <span>{Math.round(progress)}%</span>
      </div>
    </Html>
  );
}

function ClearAssetIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M18 46L46 18" fill="none" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}

function App() {
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id || "clothing");
  const [activeType, setActiveType] = useState<SupportedType>(
    groups[0]?.types[0] || "top"
  );
  const [locale, setLocale] = useState<UiLocale>("ru");
  const [selectedGender, setSelectedGender] = useState<UiGender>("male");
  const [selectedPresetId, setSelectedPresetId] = useState("preset-1");
  const [selectedHairColor, setSelectedHairColor] = useState<string>(HAIR_COLOR_SWATCHES[0]);
  const [selectedBeardColor, setSelectedBeardColor] = useState<string>(HAIR_COLOR_SWATCHES[0]);
  const [selectedByType, setSelectedByType] = useState<
    Partial<Record<SupportedType, string>>
  >({});
  const previousPresetRef = useRef("preset-1");

  const groupByType = useMemo(() => {
    const map = new Map<SupportedType, string>();

    for (const group of groups) {
      for (const typeId of group.types) {
        map.set(typeId, group.id);
      }
    }

    return map;
  }, []);

  useEffect(() => {
    const browserLocale = navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
    setLocale(browserLocale);
  }, []);

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
    const nextGroupId = groupByType.get(activeType);
    if (nextGroupId && nextGroupId !== activeGroupId) {
      setActiveGroupId(nextGroupId);
    }
  }, [activeGroupId, activeType, groupByType]);

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
  const hairTintByMesh = useMemo<MeshTintMap>(
    () => ({
      [SLOT_NAMES.hair]: selectedHairColor,
      "Wolf3D_Hair.001": selectedHairColor,
      "hair-60": selectedHairColor,
      low: selectedHairColor,
      [SLOT_NAMES.beard]: selectedBeardColor,
    }),
    [selectedBeardColor, selectedHairColor]
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

    const eyeUrl = getUrl("eye");
    if (eyeUrl) {
      slotOwners.set(SLOT_NAMES.eyeLeft, eyeUrl);
      slotOwners.set(SLOT_NAMES.eyeRight, eyeUrl);
    }

    const beardUrl = getUrl("beard");
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

    return {
      hiddenBaseMeshes: Array.from(slotOwners.keys()),
      beardMaskUrl: selectedBeardAsset?.maskUrl || null,
      beardMaskModelUrl: beardUrl,
      parts: Array.from(partsByUrl.entries()).map(([modelUrl, includeMeshes]) => ({
        modelUrl,
        includeMeshes,
      })),
    };
  }, [activeType, capabilityByAsset, selectedByType, selectedLocalByType]);

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
    activeType === "beard" ? copy.beardColor || copy.hairColor : copy.hairColor;
  const typeLabels = TYPE_LABELS[locale];
  const groupLabels = GROUP_LABELS[locale];

  return (
    <main className="creator-shell">
      <section className="stage-panel">
        <button className="gear-button" type="button" aria-label={copy.settings}>
          <span />
        </button>
        <div className="stage-toolbar">
          <button
            className="locale-toggle"
            type="button"
            onClick={() => setLocale((current) => (current === "ru" ? "en" : "ru"))}
            aria-label={`Switch language to ${locale === "ru" ? "English" : "Russian"}`}
          >
            <span className={locale === "ru" ? "locale-chip locale-chip--active" : "locale-chip"}>
              RU
            </span>
            <span className={locale === "en" ? "locale-chip locale-chip--active" : "locale-chip"}>
              EN
            </span>
          </button>
          <button className="next-button" type="button">
            {copy.next} <span aria-hidden>→</span>
          </button>
        </div>

        <div className="stage-canvas-wrap">
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            camera={{ position: [0, 1.34, 5.05], fov: 31 }}
          >
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
              {selectedPreset?.baseModelUrl ? (
                <AvatarModel
                  modelUrl={selectedPreset.baseModelUrl}
                  hiddenMeshes={composedScene.hiddenBaseMeshes}
                  tintByMesh={hairTintByMesh}
                />
              ) : (
                <PlaceholderAvatar />
              )}

              {composedScene.parts.map((part) => (
                <AvatarModel
                  key={`${part.modelUrl}:${part.includeMeshes.join("|")}`}
                  modelUrl={part.modelUrl}
                  includeMeshes={part.includeMeshes}
                  tintByMesh={hairTintByMesh}
                />
              ))}

              {composedScene.beardMaskUrl && composedScene.beardMaskModelUrl ? (
                <AvatarHeadMaskLayer
                  modelUrl={composedScene.beardMaskModelUrl}
                  maskUrl={composedScene.beardMaskUrl}
                />
              ) : null}

              <ContactShadows
                position={[0, -1.06, 0]}
                opacity={0.32}
                width={3.4}
                height={3.4}
                blur={2.8}
                far={1.8}
              />
            </Suspense>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.06, 0]} receiveShadow>
              <planeGeometry args={[8, 8]} />
              <shadowMaterial transparent opacity={0.26} />
            </mesh>

            <OrbitControls
              makeDefault
              enablePan
              enableDamping
              dampingFactor={0.09}
              minDistance={1.75}
              maxDistance={8.4}
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

        {activeType === "hair" || activeType === "beard" ? (
          <div className="hair-color-panel" aria-label={colorPanelLabel}>
            {HAIR_COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                className={`hair-color-dot${(activeType === "beard" ? selectedBeardColor : selectedHairColor) === color ? " hair-color-dot--active" : ""}`}
                onClick={() =>
                  activeType === "beard"
                    ? setSelectedBeardColor(color)
                    : setSelectedHairColor(color)
                }
                style={{ background: color }}
                title={color}
                aria-label={`${colorPanelLabel} ${color}`}
              />
            ))}
          </div>
        ) : null}
      </section>

      <aside className="asset-panel">
        <div className="asset-list-panel">
          <div className="library-controls">
            <div className="gender-switch">
              {(["male", "female"] as UiGender[]).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  className={`gender-btn${selectedGender === gender ? " gender-btn--active" : ""}`}
                  onClick={() => setSelectedGender(gender)}
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
                    onClick={() => setSelectedPresetId(preset.id)}
                    title={`${copy.preset} ${index + 1}`}
                  >
                    {preset.previewUrl ? (
                      <img
                        src={preset.previewUrl}
                        alt={`${copy.preset} ${index + 1}`}
                        loading="lazy"
                      />
                    ) : (
                      <span className="preset-btn__fallback">{index + 1}</span>
                    )}
                    <span className="preset-btn__index">{index + 1}</span>
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
                onClick={() => setActiveType(typeMeta.id)}
              >
                {typeLabels[typeMeta.id]}
              </button>
            ))}
          </div>

          <div className="asset-grid">
            <button
              type="button"
              className={`asset-card asset-card--clear${selectedAssetId ? "" : " asset-card--active"}`}
              onClick={handleClearType}
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
                  onClick={() => handleSelectAsset(asset)}
                  title={`${asset.name} (${id})`}
                >
                  <span className="asset-thumb-wrap">
                    {imageSrc ? <img src={imageSrc} alt={asset.name} loading="lazy" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="category-rail">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`category-btn${activeGroupId === group.id ? " category-btn--active" : ""}`}
              onClick={() => {
                setActiveGroupId(group.id);
                setActiveType(group.types[0]);
              }}
              title={groupLabels[group.id] || group.label}
            >
              <span>{CATEGORY_ICONS[group.id] || group.label.charAt(0)}</span>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}

export default App;
