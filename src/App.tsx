import { Suspense, useEffect, useMemo, useState } from "react";
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
import assetDataset from "./data/assets-441.json";
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

type AssetRecord = {
  id: string | number;
  name: string;
  type: SupportedType;
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

type LocalLibraryManifest = {
  baseModelUrl: string | null;
  items: LocalItem[];
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
    searchPlaceholder: string;
    clearSelection: string;
    settings: string;
  }
> = {
  ru: {
    next: "ДАЛЕЕ",
    searchPlaceholder: "Поиск по имени или id",
    clearSelection: "Снять",
    settings: "Настройки",
  },
  en: {
    next: "NEXT",
    searchPlaceholder: "Search by name or id",
    clearSelection: "Clear",
    settings: "Settings",
  },
};

const POSITION_OFFSET: [number, number, number] = [0, -1.06, 0];
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

const makeLookupKey = (type: string, id: string) => `${type}:${id}`;

function AvatarModel({
  modelUrl,
  includeMeshes,
  hiddenMeshes,
}: {
  modelUrl: string;
  includeMeshes?: readonly MeshSlot[];
  hiddenMeshes?: readonly MeshSlot[];
}) {
  const { scene } = useGLTF(modelUrl) as { scene: Group };
  const includeKey = includeMeshes?.join("|") || "";
  const hiddenKey = hiddenMeshes?.join("|") || "";

  const preparedScene = useMemo(() => {
    const includeSet = includeMeshes ? new Set(includeMeshes) : null;
    const hiddenSet = new Set(hiddenMeshes || []);
    const cloned = clone(scene) as Group;

    cloned.traverse((object) => {
      const mesh = object as {
        isMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
        visible?: boolean;
        name?: string;
      };

      if (!mesh.isMesh) {
        return;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (includeSet) {
        mesh.visible = includeSet.has(mesh.name as MeshSlot);
        return;
      }

      if (hiddenSet.size > 0) {
        mesh.visible = !hiddenSet.has(mesh.name as MeshSlot);
      }
    });

    return cloned;
  }, [hiddenKey, includeKey, includeMeshes, hiddenMeshes, scene]);

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
  const [selectedByType, setSelectedByType] = useState<
    Partial<Record<SupportedType, string>>
  >({});
  const [searchTerm, setSearchTerm] = useState("");

  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    []
  );

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

    for (const item of localLibrary.items || []) {
      map.set(makeLookupKey(item.type, item.id), item);
    }

    return map;
  }, []);

  const capabilityByAsset = useMemo(
    () => new Map(Object.entries(localAssetCapabilities.items || {})),
    []
  );

  const currentGroup = groupById.get(activeGroupId) || groups[0];
  const assetByKey = useMemo(
    () =>
      new Map(
        datasetAssets.map((asset) => [makeLookupKey(asset.type, String(asset.id)), asset])
      ),
    []
  );

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
    const source = (assetsByType.get(activeType) || []).filter(isAssetCompatibleWithType);
    const query = searchTerm.trim().toLowerCase();
    if (!query) return source;

    return source.filter((asset) => {
      const id = String(asset.id).toLowerCase();
      const name = String(asset.name).toLowerCase();
      return id.includes(query) || name.includes(query);
    });
  }, [activeType, assetsByType, capabilityByAsset, searchTerm]);

  useEffect(() => {
    const nextGroupId = groupByType.get(activeType);
    if (nextGroupId && nextGroupId !== activeGroupId) {
      setActiveGroupId(nextGroupId);
    }
  }, [activeGroupId, activeType, groupByType]);

  const selectedAssetId = selectedByType[activeType] || "";

  const selectedAsset = useMemo(
    () =>
      (assetsByType.get(activeType) || []).find(
        (asset) => String(asset.id) === selectedAssetId
      ) || null,
    [activeType, assetsByType, selectedAssetId]
  );

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
              {localLibrary.baseModelUrl ? (
                <AvatarModel
                  modelUrl={localLibrary.baseModelUrl}
                  hiddenMeshes={composedScene.hiddenBaseMeshes}
                />
              ) : (
                <PlaceholderAvatar />
              )}

              {composedScene.parts.map((part) => (
                <AvatarModel
                  key={`${part.modelUrl}:${part.includeMeshes.join("|")}`}
                  modelUrl={part.modelUrl}
                  includeMeshes={part.includeMeshes}
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
      </section>

      <aside className="asset-panel">
        <div className="asset-list-panel">
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

          <label className="asset-search">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={copy.searchPlaceholder}
            />
          </label>

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
