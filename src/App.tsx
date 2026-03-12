import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Html,
  OrbitControls,
  useGLTF,
  useProgress,
  useTexture,
} from "@react-three/drei";
import {
  CanvasTexture,
  Color,
  Group,
  MOUSE,
  MeshStandardMaterial,
  AnimationClip,
  AnimationMixer,
  SRGBColorSpace,
} from "three";
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
  | "eyeshape"
  | "eyebrows"
  | "faceshape"
  | "noseshape"
  | "lipshape"
  | "glasses"
  | "headwear"
  | "beard"
  | "facewear"
  | "facemask";

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

const TYPE_LABELS: Record<UiLocale, Record<SupportedType, string>> = {
  ru: {
    top: "Верх",
    bottom: "Низ",
    footwear: "Обувь",
    outfit: "Образы",
    hair: "Волосы",
    eye: "Глаза",
    eyeshape: "Форма глаз",
    eyebrows: "Брови",
    faceshape: "Форма головы",
    noseshape: "Форма носа",
    lipshape: "Форма губ",
    glasses: "Очки",
    headwear: "Головные",
    beard: "Борода",
    facewear: "Маски",
    facemask: "Грим",
  },
  en: {
    top: "Tops",
    bottom: "Bottoms",
    footwear: "Footwear",
    outfit: "Outfits",
    hair: "Hair",
    eye: "Eyes",
    eyeshape: "Eye shape",
    eyebrows: "Eyebrows",
    faceshape: "Head shape",
    noseshape: "Nose shape",
    lipshape: "Lip shape",
    glasses: "Glasses",
    headwear: "Headwear",
    beard: "Beard",
    facewear: "Facewear",
    facemask: "Face paint",
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
    eyebrowColor?: string;
    lipColor?: string;
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
    eyebrowColor: "Цвет бровей",
    lipColor: "Цвет губ",
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
    eyebrowColor: "Eyebrow color",
    lipColor: "Lip color",
  },
};

const POSITION_OFFSET: [number, number, number] = [0, -1.06, 0];
const IDLE_ANIMATION_URL: Record<UiGender, string> = {
  male: "/local-assets/animations/male-idle-animation.glb",
  female: "/local-assets/animations/female-idle-animation.glb",
};
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
  faceMask: "Wolf3D_FaceMask",
  top: "Wolf3D_Outfit_Top",
  bottom: "Wolf3D_Outfit_Bottom",
  footwear: "Wolf3D_Outfit_Footwear",
  eyeLeft: "EyeLeft",
  eyeRight: "EyeRight",
} as const;

type MeshSlot = (typeof SLOT_NAMES)[keyof typeof SLOT_NAMES];
type MeshTintMode = "flat" | "eyebrows" | "lips";
type MeshTintEntry = { color: string; mode: MeshTintMode };
type MeshTintMap = Partial<Record<string, MeshTintEntry>>;
const FACIAL_FEATURE_TYPES: SupportedType[] = [
  "faceshape",
  "eyeshape",
  "eyebrows",
  "noseshape",
  "lipshape",
];

const makeLookupKey = (type: string, id: string) => `${type}:${id}`;
const useIdleAnimation = (scene: Group, idleAnimationUrl: string) => {
  const mixerRef = useRef<AnimationMixer | null>(null);
  const clipDurationRef = useRef<number>(0);
  const { animations } = useGLTF(idleAnimationUrl) as {
    scene: Group;
    animations: AnimationClip[];
  };

  useEffect(() => {
    const clip = animations[0];
    if (!clip) {
      return;
    }

    const mixer = new AnimationMixer(scene);
    const action = mixer.clipAction(clip, scene);
    action.reset();
    action.play();
    action.clampWhenFinished = false;
    mixerRef.current = mixer;
    clipDurationRef.current = Math.max(clip.duration || 0, 0.001);

    return () => {
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      mixerRef.current = null;
      clipDurationRef.current = 0;
    };
  }, [animations, scene]);

  useFrame((state) => {
    const mixer = mixerRef.current;
    if (!mixer) {
      return;
    }

    const duration = clipDurationRef.current;
    if (duration <= 0) {
      return;
    }

    // Drive all layered avatar parts from one absolute timeline.
    const time = state.clock.getElapsedTime() % duration;
    mixer.setTime(time);
  });
};

function AvatarModel({
  modelUrl,
  includeMeshes,
  hiddenMeshes,
  tintByMesh,
  idleAnimationUrl,
}: {
  modelUrl: string;
  includeMeshes?: readonly MeshSlot[];
  hiddenMeshes?: readonly MeshSlot[];
  tintByMesh?: MeshTintMap;
  idleAnimationUrl: string;
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
    const textureTintCache = new Map<string, CanvasTexture>();
    const cloneMaterialWithTint = (material: unknown, tint: MeshTintEntry): unknown => {
      const tintOne = (entry: unknown): unknown => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }

        const materialEntry = entry as {
          clone?: () => unknown;
          color?: { set?: (value: string) => void };
          map?: {
            image?: { width?: number; height?: number };
            colorSpace?: unknown;
            flipY?: boolean;
            needsUpdate?: boolean;
            uuid?: string;
          } | null;
        };

        if (typeof materialEntry.clone !== "function") {
          return entry;
        }

        const clonedMaterial = materialEntry.clone() as {
          color?: { set?: (value: string) => void };
          map?: unknown;
          needsUpdate?: boolean;
        };
        if (tint.mode === "flat") {
          // Full recolor for hair/beard.
          if ("map" in clonedMaterial) {
            clonedMaterial.map = null;
          }
        } else {
          const sourceMap = materialEntry.map;
          const sourceImage = sourceMap?.image;
          const width = sourceImage?.width || 0;
          const height = sourceImage?.height || 0;

          if (sourceMap && width > 0 && height > 0) {
            const cacheKey = `${sourceMap.uuid || "map"}:${tint.mode}:${tint.color}`;
            let tintedTexture = textureTintCache.get(cacheKey);

            if (!tintedTexture) {
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const context = canvas.getContext("2d");

              if (context) {
                context.drawImage(
                  sourceMap.image as CanvasImageSource,
                  0,
                  0,
                  width,
                  height
                );
                const imageData = context.getImageData(0, 0, width, height);
                const data = imageData.data;
                const sourceData = new Uint8ClampedArray(data);
                const target = new Color(tint.color);
                const targetR = Math.round(target.r * 255);
                const targetG = Math.round(target.g * 255);
                const targetB = Math.round(target.b * 255);

                for (let index = 0; index < data.length; index += 4) {
                  const alpha = data[index + 3];
                  if (alpha < 8) continue;

                  const red = data[index];
                  const green = data[index + 1];
                  const blue = data[index + 2];
                  const pixel = index / 4;
                  const x = pixel % width;
                  const y = Math.floor(pixel / width);
                  const yNorm = y / height;
                  const xNorm = x / width;
                  const luminance = (red + green + blue) / 3;
                  const maxChannel = Math.max(red, green, blue);
                  const minChannel = Math.min(red, green, blue);
                  const chroma = maxChannel - minChannel;
                  const saturation = maxChannel === 0 ? 0 : chroma / maxChannel;

                  let strength = 0;

                  if (tint.mode === "eyebrows") {
                    const eyebrowBand = yNorm > 0.36 && yNorm < 0.54;
                    const leftBrowZone = xNorm > 0.24 && xNorm < 0.46;
                    const rightBrowZone = xNorm > 0.54 && xNorm < 0.76;
                    const eyebrowZone = eyebrowBand && (leftBrowZone || rightBrowZone);

                    if (!eyebrowZone) {
                      continue;
                    }

                    const hasNeighbors =
                      x > 0 && x < width - 1 && y > 0 && y < height - 1;
                    if (!hasNeighbors) {
                      continue;
                    }

                    const leftIndex = index - 4;
                    const rightIndex = index + 4;
                    const topIndex = index - width * 4;
                    const bottomIndex = index + width * 4;

                    const leftLum =
                      (sourceData[leftIndex] +
                        sourceData[leftIndex + 1] +
                        sourceData[leftIndex + 2]) /
                      3;
                    const rightLum =
                      (sourceData[rightIndex] +
                        sourceData[rightIndex + 1] +
                        sourceData[rightIndex + 2]) /
                      3;
                    const topLum =
                      (sourceData[topIndex] +
                        sourceData[topIndex + 1] +
                        sourceData[topIndex + 2]) /
                      3;
                    const bottomLum =
                      (sourceData[bottomIndex] +
                        sourceData[bottomIndex + 1] +
                        sourceData[bottomIndex + 2]) /
                      3;

                    const gradient =
                      Math.abs(leftLum - rightLum) + Math.abs(topLum - bottomLum);
                    const isDarkStroke = luminance < 176;
                    const isMostlyNeutral = saturation < 0.48 && chroma < 122;
                    const hasHairLikeDetail = gradient > 28;

                    if (!isDarkStroke || !isMostlyNeutral || !hasHairLikeDetail) {
                      continue;
                    }

                    const darkness = Math.min(1, (200 - luminance) / 200);
                    const detail = Math.min(1, (gradient - 28) / 72);
                    strength = 0.3 + darkness * 0.52 + detail * 0.18;
                  } else if (tint.mode === "lips") {
                    const lipCenterX = 0.5;
                    const lipCenterY = 0.6;
                    const lipRadiusX = 0.14;
                    const lipRadiusY = 0.075;
                    const dx = (xNorm - lipCenterX) / lipRadiusX;
                    const dy = (yNorm - lipCenterY) / lipRadiusY;
                    const lipEllipse = dx * dx + dy * dy < 1;
                    const lipZone = yNorm > 0.5 && yNorm < 0.7 && xNorm > 0.32 && xNorm < 0.68;
                    const lipLike =
                      lipEllipse &&
                      lipZone &&
                      luminance > 86 &&
                      luminance < 226 &&
                      saturation < 0.56;
                    if (!lipLike) {
                      continue;
                    }

                    const softness = Math.max(0, 1 - (dx * dx + dy * dy));
                    strength = 0.24 + softness * 0.46;
                  } else {
                    const threshold = 168;
                    if (luminance > threshold) {
                      continue;
                    }
                    strength = ((threshold - luminance) / threshold) * 0.88;
                  }

                  data[index] = Math.round(red * (1 - strength) + targetR * strength);
                  data[index + 1] = Math.round(green * (1 - strength) + targetG * strength);
                  data[index + 2] = Math.round(blue * (1 - strength) + targetB * strength);
                }

                context.putImageData(imageData, 0, 0);
                tintedTexture = new CanvasTexture(canvas);
                tintedTexture.colorSpace = SRGBColorSpace;
                tintedTexture.flipY = sourceMap.flipY ?? false;
                tintedTexture.needsUpdate = true;
                textureTintCache.set(cacheKey, tintedTexture);
              }
            }

            if (tintedTexture) {
              clonedMaterial.map = tintedTexture;
            }
          }
        }
        if (tint.mode === "flat") {
          clonedMaterial.color?.set?.(tint.color);
        } else {
          // Keep base skin tone from texture; tint is applied only on selected pixels.
          clonedMaterial.color?.set?.("#ffffff");
        }
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

      const tintEntry = mesh.name ? tintByMesh?.[mesh.name] : null;
      if (tintEntry && mesh.material) {
        mesh.material = cloneMaterialWithTint(mesh.material, tintEntry);
      }
    });

    return cloned;
  }, [hiddenKey, includeKey, includeMeshes, hiddenMeshes, scene, tintByMesh, tintKey]);
  useIdleAnimation(preparedScene, idleAnimationUrl);
  return <primitive object={preparedScene} position={POSITION_OFFSET} />;
}

function AvatarHeadMaskLayer({
  modelUrl,
  maskUrl,
  idleAnimationUrl,
  tintColor,
  renderOrder = 20,
}: {
  modelUrl: string;
  maskUrl: string;
  idleAnimationUrl: string;
  tintColor?: string;
  renderOrder?: number;
}) {
  const { scene } = useGLTF(modelUrl) as { scene: Group };
  const maskTexture = useTexture(maskUrl);
  const derivedAlphaTexture = useMemo(() => {
    if (!tintColor) {
      return maskTexture;
    }

    const sourceImage = maskTexture.image as CanvasImageSource | undefined;
    const width =
      sourceImage && "width" in sourceImage
        ? Number((sourceImage as { width: number }).width) || 0
        : 0;
    const height =
      sourceImage && "height" in sourceImage
        ? Number((sourceImage as { height: number }).height) || 0
        : 0;

    if (!sourceImage || width <= 0 || height <= 0) {
      return maskTexture;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return maskTexture;
    }

    context.drawImage(sourceImage as CanvasImageSource, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;

    let luminanceSum = 0;
    const pixelCount = width * height;
    for (let index = 0; index < data.length; index += 4) {
      luminanceSum += (data[index] + data[index + 1] + data[index + 2]) / 3;
    }
    const averageLuminance = pixelCount > 0 ? luminanceSum / pixelCount : 255;
    const invert = averageLuminance > 127;

    for (let index = 0; index < data.length; index += 4) {
      const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
      const rawAlpha = invert ? 255 - luminance : luminance;
      const boosted = Math.max(0, Math.min(255, (rawAlpha - 16) * 1.25));

      // Alpha map uses color channels, so keep grayscale in RGB.
      data[index] = boosted;
      data[index + 1] = boosted;
      data[index + 2] = boosted;
      data[index + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
    const alphaTexture = new CanvasTexture(canvas);
    alphaTexture.flipY = maskTexture.flipY ?? false;
    alphaTexture.needsUpdate = true;
    return alphaTexture;
  }, [maskTexture, tintColor]);

  useEffect(() => {
    maskTexture.flipY = false;
    if (!tintColor) {
      maskTexture.colorSpace = SRGBColorSpace;
    }
    maskTexture.needsUpdate = true;
  }, [maskTexture, tintColor]);

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
      mesh.renderOrder = renderOrder;

      const overlayMaterial = new MeshStandardMaterial({
        map: tintColor ? null : maskTexture,
        // For non-tinted overlays (face paint), use texture alpha directly.
        // alphaMap would derive transparency from color channels and hide dark paint.
        alphaMap: tintColor ? derivedAlphaTexture : null,
        transparent: true,
        depthWrite: false,
        color: tintColor || "#ffffff",
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
  }, [derivedAlphaTexture, maskTexture, modelUrl, renderOrder, scene, tintColor]);
  useIdleAnimation(preparedScene, idleAnimationUrl);
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

function PresetPreviewImage({ src, alt }: { src: string; alt: string }) {
  const [normalizedSrc, setNormalizedSrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = src;

    image.onload = () => {
      if (cancelled) return;

      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) {
        setNormalizedSrc(src);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        setNormalizedSrc(src);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      const pixelCount = width * height;
      const visited = new Uint8Array(pixelCount);
      const queue = new Int32Array(pixelCount);
      let head = 0;
      let tail = 0;

      const getOffset = (x: number, y: number) => (y * width + x) * 4;

      const corners = [
        getOffset(0, 0),
        getOffset(width - 1, 0),
        getOffset(0, height - 1),
        getOffset(width - 1, height - 1),
      ];

      const bgR = Math.round(
        corners.reduce((sum, offset) => sum + data[offset], 0) / corners.length
      );
      const bgG = Math.round(
        corners.reduce((sum, offset) => sum + data[offset + 1], 0) / corners.length
      );
      const bgB = Math.round(
        corners.reduce((sum, offset) => sum + data[offset + 2], 0) / corners.length
      );
      const toHsv = (red: number, green: number, blue: number) => {
        const r = red / 255;
        const g = green / 255;
        const b = blue / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let hue = 0;
        if (delta > 0) {
          if (max === r) {
            hue = ((g - b) / delta) % 6;
          } else if (max === g) {
            hue = (b - r) / delta + 2;
          } else {
            hue = (r - g) / delta + 4;
          }
          hue /= 6;
          if (hue < 0) hue += 1;
        }

        const saturation = max === 0 ? 0 : delta / max;
        const value = max;
        return { hue, saturation, value };
      };

      const hueDistance = (left: number, right: number) => {
        const diff = Math.abs(left - right);
        return Math.min(diff, 1 - diff);
      };

      const bgHsv = toHsv(bgR, bgG, bgB);
      const isDarkColorBackground = bgHsv.value < 0.62 && bgHsv.saturation > 0.14;
      if (!isDarkColorBackground) {
        setNormalizedSrc(src);
        return;
      }

      const distanceToBg = (offset: number) => {
        const dr = data[offset] - bgR;
        const dg = data[offset + 1] - bgG;
        const db = data[offset + 2] - bgB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      const threshold = 38;
      const isBackgroundLike = (offset: number) => {
        const distance = distanceToBg(offset);
        if (distance > threshold) {
          return false;
        }

        const hsv = toHsv(data[offset], data[offset + 1], data[offset + 2]);
        const hDiff = hueDistance(hsv.hue, bgHsv.hue);
        const sDiff = Math.abs(hsv.saturation - bgHsv.saturation);
        const vDiff = Math.abs(hsv.value - bgHsv.value);

        return hDiff < 0.08 && sDiff < 0.24 && vDiff < 0.24;
      };

      const push = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        const index = y * width + x;
        if (visited[index]) return;

        const offset = index * 4;
        if (!isBackgroundLike(offset)) return;

        visited[index] = 1;
        queue[tail] = index;
        tail += 1;
      };

      for (let x = 0; x < width; x += 1) {
        push(x, 0);
        push(x, height - 1);
      }
      for (let y = 0; y < height; y += 1) {
        push(0, y);
        push(width - 1, y);
      }

      while (head < tail) {
        const index = queue[head];
        head += 1;
        const x = index % width;
        const y = Math.floor(index / width);

        push(x - 1, y);
        push(x + 1, y);
        push(x, y - 1);
        push(x, y + 1);
      }

      for (let index = 0; index < pixelCount; index += 1) {
        if (!visited[index]) continue;
        const offset = index * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
      }

      context.putImageData(imageData, 0, 0);
      setNormalizedSrc(canvas.toDataURL("image/png"));
    };

    image.onerror = () => {
      if (!cancelled) {
        setNormalizedSrc(src);
      }
    };

    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={normalizedSrc} alt={alt} loading="lazy" />;
}

function App() {
  const [activeType, setActiveType] = useState<SupportedType>(
    groups[0]?.types[0] || "top"
  );
  const [locale, setLocale] = useState<UiLocale>("ru");
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
                  tintByMesh={tintByMesh}
                  idleAnimationUrl={idleAnimationUrl}
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
                />
              ))}

              {composedScene.beardMaskUrl && composedScene.beardMaskModelUrl ? (
                <AvatarHeadMaskLayer
                  modelUrl={composedScene.beardMaskModelUrl}
                  maskUrl={composedScene.beardMaskUrl}
                  idleAnimationUrl={idleAnimationUrl}
                />
              ) : null}
              {composedScene.eyebrowMaskUrl && composedScene.eyebrowMaskModelUrl ? (
                <AvatarHeadMaskLayer
                  modelUrl={composedScene.eyebrowMaskModelUrl}
                  maskUrl={composedScene.eyebrowMaskUrl}
                  idleAnimationUrl={idleAnimationUrl}
                  tintColor={selectedEyebrowColor}
                  renderOrder={21}
                />
              ) : null}
              {composedScene.facemaskMaskUrl && composedScene.facemaskMaskModelUrl ? (
                <AvatarHeadMaskLayer
                  modelUrl={composedScene.facemaskMaskModelUrl}
                  maskUrl={composedScene.facemaskMaskUrl}
                  idleAnimationUrl={idleAnimationUrl}
                  renderOrder={22}
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

        {activeType === "hair" ||
        activeType === "beard" ||
        activeType === "eyebrows" ||
        activeType === "lipshape" ? (
          <div className="hair-color-panel" aria-label={colorPanelLabel}>
            {HAIR_COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                className={`hair-color-dot${(
                  activeType === "beard"
                    ? selectedBeardColor
                    : activeType === "eyebrows"
                      ? selectedEyebrowColor
                      : activeType === "lipshape"
                        ? selectedLipColor
                        : selectedHairColor
                ) === color
                  ? " hair-color-dot--active"
                  : ""}`}
                onClick={() =>
                  activeType === "beard"
                    ? setSelectedBeardColor(color)
                    : activeType === "eyebrows"
                      ? setSelectedEyebrowColor(color)
                      : activeType === "lipshape"
                        ? setSelectedLipColor(color)
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

      </aside>
    </main>
  );
}

useGLTF.preload(IDLE_ANIMATION_URL.male);
useGLTF.preload(IDLE_ANIMATION_URL.female);

export default App;
