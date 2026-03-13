import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
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
  DoubleSide,
  Euler,
  Group,
  Material,
  Mesh,
  MOUSE,
  MeshStandardMaterial,
  AnimationClip,
  AnimationMixer,
  Camera,
  Quaternion,
  SRGBColorSpace,
  Scene,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  ClampToEdgeWrapping,
} from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import assetSchema from "./config/asset-schema.json";
import assetDataset from "./data/assets-catalog.json";
import localAssetCapabilitiesManifest from "./data/generated/local-asset-capabilities.json";
import localLibraryManifest from "./data/generated/local-library-manifest.json";
import { PaintPanel } from "./components/PaintPanel";

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
type StickerTransform = {
  position: [number, number, number];
  normal: [number, number, number];
  uv?: [number, number];
  scale: number;
  rotationDeg: number;
};

const groups = assetSchema.groups as GroupSchema[];
const allTypes = assetSchema.types as { id: SupportedType; label: string }[];
const datasetAssets = assetDataset.assets as AssetRecord[];
const localAssetCapabilities =
  localAssetCapabilitiesManifest as LocalAssetCapabilitiesManifest;
const localLibrary = localLibraryManifest as LocalLibraryManifest;
const RPM_API_BASE = "https://api.readyplayer.me";
const RPM_APP_NAME =
  (assetDataset as { source?: { subdomain?: string } }).source?.subdomain || "demo";

const TYPE_TO_AVATAR_ASSET_KEY: Partial<Record<SupportedType, string>> = {
  top: "top",
  bottom: "bottom",
  footwear: "footwear",
  outfit: "outfit",
  hair: "hairStyle",
  eye: "eyeColor",
  eyeshape: "eyeStyle",
  eyebrows: "eyebrowStyle",
  faceshape: "faceShape",
  noseshape: "noseShape",
  lipshape: "lipShape",
  glasses: "glasses",
  headwear: "headwear",
  beard: "beardStyle",
  facewear: "facewear",
  facemask: "faceMask",
};

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
    texture: string;
    textureUploadTitle: string;
    textureUploadHint: string;
    texturePickFile: string;
    textureRemove: string;
    textureEditMode: string;
    textureScale: string;
    textureRotation: string;
    textureModeDecal: string;
    textureModeReplace: string;
    uploadDecal: string;
    uploadTexture: string;
    removeDecal: string;
    removeTexture: string;
    notLoaded: string;
    paintPanel: string;
    textureScaleX: string;
    textureScaleY: string;
    replaceHint: string;
    exportPreviewTitle: string;
    exportPreviewHint: string;
    exportDownload: string;
    exportClose: string;
    exportLinkLabel: string;
    exportBusy: string;
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
    texture: "◈",
    textureUploadTitle: "Своя текстура",
    textureUploadHint: "Загрузите PNG и двигайте по поверхности аватара",
    texturePickFile: "Выбрать PNG",
    textureRemove: "Убрать",
    textureEditMode: "Двигать по модели",
    textureScale: "Размер",
    textureRotation: "Поворот",
    textureModeDecal: "Декаль",
    textureModeReplace: "Замена текстуры",
    uploadDecal: "Загрузить декаль",
    uploadTexture: "Загрузить текстуру",
    removeDecal: "Удалить декаль",
    removeTexture: "Удалить текстуру",
    notLoaded: "Не загружено",
    paintPanel: "Панель наложения",
    textureScaleX: "Scale X",
    textureScaleY: "Scale Y",
    replaceHint: "Для замены выберите: Верх / Низ / Обувь / Образы",
    exportPreviewTitle: "Экспорт аватара",
    exportPreviewHint: "Локальный предпросмотр и скачивание текущего .glb",
    exportDownload: "Скачать .glb",
    exportClose: "Закрыть",
    exportLinkLabel: "Локальный файл .glb:",
    exportBusy: "Подготавливаю .glb...",
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
    texture: "◈",
    textureUploadTitle: "Custom texture",
    textureUploadHint: "Upload PNG and drag it across avatar surface",
    texturePickFile: "Choose PNG",
    textureRemove: "Remove",
    textureEditMode: "Move on model",
    textureScale: "Scale",
    textureRotation: "Rotation",
    textureModeDecal: "Decal",
    textureModeReplace: "Texture replace",
    uploadDecal: "Upload decal",
    uploadTexture: "Upload texture",
    removeDecal: "Remove decal",
    removeTexture: "Remove texture",
    notLoaded: "Not loaded",
    paintPanel: "Overlay panel",
    textureScaleX: "Scale X",
    textureScaleY: "Scale Y",
    replaceHint: "Choose Tops / Bottoms / Footwear / Outfits for replacement",
    exportPreviewTitle: "Avatar export",
    exportPreviewHint: "Local preview and download for current .glb",
    exportDownload: "Download .glb",
    exportClose: "Close",
    exportLinkLabel: "Local .glb file:",
    exportBusy: "Preparing .glb...",
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
  replaceTextureUrl,
  replaceTextureMeshes,
  replaceTextureScale = 0.35,
  replaceTextureScaleX = 1,
  replaceTextureScaleY = 1,
  replaceTextureRotationDeg = 0,
}: {
  modelUrl: string;
  includeMeshes?: readonly MeshSlot[];
  hiddenMeshes?: readonly MeshSlot[];
  tintByMesh?: MeshTintMap;
  idleAnimationUrl: string;
  replaceTextureUrl?: string | null;
  replaceTextureMeshes?: readonly MeshSlot[];
  replaceTextureScale?: number;
  replaceTextureScaleX?: number;
  replaceTextureScaleY?: number;
  replaceTextureRotationDeg?: number;
}) {
  const { scene } = useGLTF(modelUrl) as { scene: Group };
  const [replacementTexture, setReplacementTexture] = useState<Texture | null>(null);
  const includeKey = includeMeshes?.join("|") || "";
  const hiddenKey = hiddenMeshes?.join("|") || "";
  const replaceMeshesKey = replaceTextureMeshes?.join("|") || "";
  const tintKey = useMemo(
    () =>
      Object.entries(tintByMesh || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([slot, color]) => `${slot}:${color}`)
        .join("|"),
    [tintByMesh]
  );

  useEffect(() => {
    let cancelled = false;
    if (!replaceTextureUrl) {
      setReplacementTexture(null);
      return;
    }

    const loader = new TextureLoader();
    loader.load(replaceTextureUrl, (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      texture.needsUpdate = true;
      setReplacementTexture(texture);
    });

    return () => {
      cancelled = true;
    };
  }, [replaceTextureUrl]);

  const preparedScene = useMemo(() => {
    const includeSet = includeMeshes ? new Set(includeMeshes) : null;
    const hiddenSet = new Set(hiddenMeshes || []);
    const replaceSet = new Set(replaceTextureMeshes || []);
    const textureTintCache = new Map<string, CanvasTexture>();
    const applyTextureReplacement = (material: unknown): unknown => {
      if (!replacementTexture) {
        return material;
      }

      const replaceOne = (entry: unknown): unknown => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }

        const materialEntry = entry as {
          clone?: () => unknown;
        };
        if (typeof materialEntry.clone !== "function") {
          return entry;
        }

        const clonedMaterial = materialEntry.clone() as {
          map?: unknown;
          color?: { set?: (value: string) => void };
          transparent?: boolean;
          needsUpdate?: boolean;
        };
        const textured = replacementTexture.clone();
        textured.colorSpace = SRGBColorSpace;
        textured.flipY = false;
        textured.center.set(0.5, 0.5);
        textured.rotation = (replaceTextureRotationDeg * Math.PI) / 180;
        const uniform = Math.max(0.2, replaceTextureScale);
        const scaleX = Math.max(0.2, replaceTextureScaleX);
        const scaleY = Math.max(0.2, replaceTextureScaleY);
        const repeatX = Math.max(0.1, Math.min(8, 1 / (uniform * scaleX)));
        const repeatY = Math.max(0.1, Math.min(8, 1 / (uniform * scaleY)));
        textured.repeat.set(repeatX, repeatY);
        textured.offset.set((1 - repeatX) * 0.5, (1 - repeatY) * 0.5);
        textured.needsUpdate = true;

        clonedMaterial.map = textured;
        clonedMaterial.color?.set?.("#ffffff");
        if ("transparent" in clonedMaterial) {
          clonedMaterial.transparent = true;
        }
        if ("needsUpdate" in clonedMaterial) {
          clonedMaterial.needsUpdate = true;
        }
        return clonedMaterial;
      };

      if (Array.isArray(material)) {
        return material.map((entry) => replaceOne(entry));
      }

      return replaceOne(material);
    };
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
        userData?: Record<string, unknown>;
      };

      if (!mesh.isMesh) {
        return;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { ...(mesh.userData || {}), avatarSurface: true };

      if (includeSet) {
        mesh.visible = includeSet.has(mesh.name as MeshSlot);
      } else if (hiddenSet.size > 0) {
        mesh.visible = !hiddenSet.has(mesh.name as MeshSlot);
      }

      const tintEntry = mesh.name ? tintByMesh?.[mesh.name] : null;
      const shouldReplaceTexture =
        replacementTexture && replaceSet.has(mesh.name as MeshSlot);
      if (shouldReplaceTexture && mesh.material) {
        mesh.material = applyTextureReplacement(mesh.material);
      }
      if (tintEntry && mesh.material) {
        mesh.material = cloneMaterialWithTint(mesh.material, tintEntry);
      }
    });

    return cloned;
  }, [
    hiddenKey,
    includeKey,
    includeMeshes,
    hiddenMeshes,
    replaceMeshesKey,
    replaceTextureMeshes,
    replacementTexture,
    replaceTextureRotationDeg,
    replaceTextureScale,
    replaceTextureScaleX,
    replaceTextureScaleY,
    scene,
    tintByMesh,
    tintKey,
  ]);
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

function SurfaceSticker({
  textureUrl,
  transform,
  targetMesh,
}: {
  textureUrl: string;
  transform: StickerTransform;
  targetMesh: Mesh | null;
}) {
  const texture = useTexture(textureUrl);

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
  }, [texture]);

  const geometry = useMemo(() => {
    if (!targetMesh) {
      return null;
    }

    const { position, normal, scale, rotationDeg } = transform;
    const normalVector = new Vector3(...normal).normalize();
    const base = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normalVector);
    const twist = new Quaternion().setFromAxisAngle(
      normalVector,
      (rotationDeg * Math.PI) / 180
    );
    const orientation = new Euler().setFromQuaternion(base.multiply(twist));
    const decalPosition = new Vector3(...position);
    const decalSize = new Vector3(scale, scale, scale);

    return new DecalGeometry(targetMesh, decalPosition, orientation, decalSize);
  }, [targetMesh, transform]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh geometry={geometry} renderOrder={24}>
      <meshStandardMaterial
        map={texture}
        transparent
        alphaTest={0.02}
        side={DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-5}
        polygonOffsetUnits={-5}
      />
    </mesh>
  );
}

function AutoStickerProjector({
  enabled,
  hasTarget,
  onPick,
}: {
  enabled: boolean;
  hasTarget: boolean;
  onPick: (payload: {
    mesh: Mesh;
    point: Vector3;
    normal: Vector3;
    uv: [number, number] | null;
  }) => void;
}) {
  const { scene, camera, raycaster } = useThree();
  const pickedRef = useRef(false);
  const centerNdc = useMemo(() => new Vector2(0, 0), []);

  useEffect(() => {
    pickedRef.current = false;
  }, [enabled, hasTarget]);

  useFrame(() => {
    if (!enabled || hasTarget || pickedRef.current) {
      return;
    }

    raycaster.setFromCamera(centerNdc, camera);
    const hits = raycaster
      .intersectObjects(scene.children, true)
      .filter((hit) =>
        Boolean((hit.object as { userData?: Record<string, unknown> }).userData?.avatarSurface)
      );

    const hit = hits[0];
    if (!hit) {
      return;
    }

    const mesh = hit.object as Mesh;
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize()
      : new Vector3(0, 0, 1);
    pickedRef.current = true;
    onPick({
      mesh,
      point: hit.point.clone(),
      normal,
      uv: hit.uv ? [hit.uv.x, hit.uv.y] : null,
    });
  });

  return null;
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

function SceneBridge({
  onReady,
}: {
  onReady: (payload: { renderer: WebGLRenderer; scene: Scene; camera: Camera }) => void;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    onReady({ renderer: gl, scene, camera });
  }, [camera, gl, onReady, scene]);

  return null;
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

function ExportPreviewModal({
  copy,
  previewUrl,
  downloadUrl,
  fileName,
  onClose,
}: {
  copy: (typeof UI_TEXT)[UiLocale];
  previewUrl: string | null;
  downloadUrl: string | null;
  fileName: string;
  onClose: () => void;
}) {
  return (
    <div className="export-modal-backdrop" onClick={onClose}>
      <div
        className="export-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <button className="export-modal__close" type="button" onClick={onClose}>
          ×
        </button>
        <div className="export-modal__preview">
          {previewUrl ? <img src={previewUrl} alt={copy.exportPreviewTitle} /> : null}
        </div>
        <div className="export-modal__panel">
          <div className="export-modal__title">{copy.exportPreviewTitle}</div>
          <div className="export-modal__hint">{copy.exportPreviewHint}</div>
          {downloadUrl ? (
            <>
              <div className="export-modal__label">{copy.exportLinkLabel}</div>
              <div className="export-modal__link">{fileName}</div>
              <a className="export-modal__download" href={downloadUrl} download={fileName}>
                {copy.exportDownload}
              </a>
            </>
          ) : (
            <div className="export-modal__busy">{copy.exportBusy}</div>
          )}
        </div>
      </div>
    </div>
  );
}

const createAnonymousUser = async (appName: string) => {
  const response = await fetch(`${RPM_API_BASE}/v1/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        appName,
        requestToken: true,
      },
    }),
  });
  const payload = await response.json();
  const token = payload?.data?.token as string | undefined;
  const userId = payload?.data?.id as string | undefined;
  if (!response.ok || !token || !userId) {
    throw new Error("Failed to create anonymous RPM user.");
  }
  return { token, userId };
};

const createAvatarFromTemplate = async ({
  token,
  userId,
  templateId,
  appName,
}: {
  token: string;
  userId: string;
  templateId: string;
  appName: string;
}) => {
  const response = await fetch(`${RPM_API_BASE}/v2/avatars/templates/${templateId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      data: {
        partner: appName,
        bodyType: "fullbody",
        userId,
      },
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.data?.id) {
    throw new Error("Failed to create avatar from template.");
  }
  return payload.data as { id: string; assets: Record<string, string> };
};

const getAvatarExportUrl = (avatarId: string) => {
  const url = new URL(`${RPM_API_BASE}/v2/avatars/${avatarId}`);
  url.searchParams.set("responseType", "glb");
  url.searchParams.set("textureAtlas", "none");
  url.searchParams.set("textureFormat", "png");
  url.searchParams.set("lod", "0");
  url.searchParams.set("textureQuality", "medium");
  return url.toString();
};

const applyAssetToAvatarAssets = ({
  type,
  assetId,
  baseAssets,
}: {
  type: SupportedType;
  assetId: string;
  baseAssets: Record<string, string>;
}) => {
  const next = { ...baseAssets };
  const mappedKey = TYPE_TO_AVATAR_ASSET_KEY[type];
  if (!mappedKey) {
    return next;
  }

  if (type === "top") {
    next.top = assetId;
    next.shirt = "";
    next.outfit = "";
    return next;
  }

  if (type === "bottom") {
    next.bottom = assetId;
    next.outfit = "";
    return next;
  }

  if (type === "footwear") {
    next.footwear = assetId;
    next.outfit = "";
    return next;
  }

  if (type === "outfit") {
    next.outfit = assetId;
    next.top = "";
    next.shirt = "";
    next.bottom = "";
    next.footwear = "";
    return next;
  }

  next[mappedKey] = assetId;
  return next;
};

const patchAvatarGlb = async ({
  token,
  avatarId,
  assets,
}: {
  token: string;
  avatarId: string;
  assets: Record<string, string>;
}) => {
  const response = await fetch(getAvatarExportUrl(avatarId), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data: { assets } }),
  });
  if (!response.ok) {
    throw new Error(`RPM export failed: ${response.status}`);
  }
  return response.blob();
};

type GlbJson = {
  asset: { version: string };
  buffers?: Array<{ byteLength: number }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
  accessors?: Array<{ bufferView?: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
  textures?: Array<{
    source?: number;
    sampler?: number;
    name?: string;
    extensions?: Record<string, unknown>;
    extras?: Record<string, unknown>;
  }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorTexture?: {
        index: number;
        texCoord?: number;
        extensions?: {
          KHR_texture_transform?: {
            offset?: [number, number];
            scale?: [number, number];
            rotation?: number;
            texCoord?: number;
          };
        };
      };
    };
  }>;
  meshes?: Array<{ primitives?: Array<{ material?: number }> }>;
  nodes?: Array<{ name?: string; mesh?: number }>;
};

const readFileAsImage = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image."));
    };
    image.src = url;
  });

const dataUrlToUint8Array = (dataUrl: string) => {
  const [, encoded = ""] = dataUrl.split(",", 2);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const padTo4 = (value: number) => (value + 3) & ~3;

const getMimeFromImageDef = (image: { mimeType?: string }) =>
  image.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";

const encodeCanvas = (canvas: HTMLCanvasElement, mimeType: string) => {
  const dataUrl = canvas.toDataURL(mimeType === "image/jpeg" ? "image/jpeg" : "image/png");
  return dataUrlToUint8Array(dataUrl);
};

const parseGlb = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Invalid GLB header.");
  }

  let offset = 12;
  let jsonText = "";
  let binChunk = new Uint8Array();

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    offset += 4;
    const chunkType = view.getUint32(offset, true);
    offset += 4;
    const chunkData = buffer.slice(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === 0x4e4f534a) {
      jsonText = new TextDecoder().decode(chunkData);
    } else if (chunkType === 0x004e4942) {
      binChunk = new Uint8Array(chunkData);
    }
  }

  if (!jsonText) {
    throw new Error("GLB is missing JSON chunk.");
  }

  return {
    json: JSON.parse(jsonText.trim()) as GlbJson,
    binChunk,
  };
};

const collectImageIndicesForMeshes = (json: GlbJson, meshNames: readonly string[]) => {
  const wantedNames = new Set(meshNames);
  const imageIndices = new Set<number>();

  for (const node of json.nodes || []) {
    if (!node.name || node.mesh == null || !wantedNames.has(node.name)) {
      continue;
    }

    const mesh = json.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives || []) {
      const materialIndex = primitive.material;
      if (materialIndex == null) continue;
      const textureIndex =
        json.materials?.[materialIndex]?.pbrMetallicRoughness?.baseColorTexture?.index;
      if (textureIndex == null) continue;
      const imageIndex = json.textures?.[textureIndex]?.source;
      if (imageIndex == null) continue;
      imageIndices.add(imageIndex);
    }
  }

  return Array.from(imageIndices);
};

const collectPrimitiveTargetsForMeshes = (json: GlbJson, meshNames: readonly string[]) => {
  const wantedNames = new Set(meshNames);
  const primitiveTargets: Array<{
    meshIndex: number;
    primitiveIndex: number;
    materialIndex: number;
  }> = [];

  for (const node of json.nodes || []) {
    if (!node.name || node.mesh == null || !wantedNames.has(node.name)) {
      continue;
    }

    const mesh = json.meshes?.[node.mesh];
    for (const [primitiveIndex, primitive] of (mesh?.primitives || []).entries()) {
      if (primitive.material != null) {
        primitiveTargets.push({
          meshIndex: node.mesh,
          primitiveIndex,
          materialIndex: primitive.material,
        });
      }
    }
  }

  return primitiveTargets;
};

const drawReplacementPattern = async ({
  canvas,
  textureUrl,
  scale,
  scaleX,
  scaleY,
  rotationDeg,
}: {
  canvas: HTMLCanvasElement;
  textureUrl: string;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
}) => {
  const image = await readFileAsImage(await fetch(textureUrl).then((response) => response.blob()));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const uniform = Math.max(0.2, scale);
  const nextScaleX = Math.max(0.2, scaleX);
  const nextScaleY = Math.max(0.2, scaleY);
  const repeatX = Math.max(0.1, Math.min(8, 1 / (uniform * nextScaleX)));
  const repeatY = Math.max(0.1, Math.min(8, 1 / (uniform * nextScaleY)));
  const uvTransformTexture = new Texture();
  uvTransformTexture.wrapS = ClampToEdgeWrapping;
  uvTransformTexture.wrapT = ClampToEdgeWrapping;
  uvTransformTexture.flipY = false;
  uvTransformTexture.center.set(0.5, 0.5);
  uvTransformTexture.rotation = (rotationDeg * Math.PI) / 180;
  uvTransformTexture.repeat.set(repeatX, repeatY);
  uvTransformTexture.offset.set((1 - repeatX) * 0.5, (1 - repeatY) * 0.5);
  uvTransformTexture.updateMatrix();
  const uv = new Vector2();

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth || image.width;
  sourceCanvas.height = image.naturalHeight || image.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    throw new Error("Source canvas 2D context is unavailable.");
  }
  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);

  const sourcePixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const output = context.createImageData(canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    const v = (y + 0.5) / canvas.height;

    for (let x = 0; x < canvas.width; x += 1) {
      const u = (x + 0.5) / canvas.width;
      uv.set(u, v);
      uvTransformTexture.transformUv(uv);

      const clampedU = Math.max(0, Math.min(1, uv.x));
      const clampedV = Math.max(0, Math.min(1, uv.y));
      const sampleX = Math.max(
        0,
        Math.min(sourceCanvas.width - 1, Math.round(clampedU * (sourceCanvas.width - 1)))
      );
      const sampleY = Math.max(
        0,
        Math.min(sourceCanvas.height - 1, Math.round(clampedV * (sourceCanvas.height - 1)))
      );

      const sourceIndex = (sampleY * sourceCanvas.width + sampleX) * 4;
      const targetIndex = (y * canvas.width + x) * 4;
      output.data[targetIndex] = sourcePixels.data[sourceIndex];
      output.data[targetIndex + 1] = sourcePixels.data[sourceIndex + 1];
      output.data[targetIndex + 2] = sourcePixels.data[sourceIndex + 2];
      output.data[targetIndex + 3] = sourcePixels.data[sourceIndex + 3];
    }
  }

  context.putImageData(output, 0, 0);
};

const drawDecalOverlay = async ({
  canvas,
  decalUrl,
  uv,
  scale,
  rotationDeg,
}: {
  canvas: HTMLCanvasElement;
  decalUrl: string;
  uv: [number, number];
  scale: number;
  rotationDeg: number;
}) => {
  const decalImage = await readFileAsImage(await fetch(decalUrl).then((response) => response.blob()));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const centerX = uv[0] * canvas.width;
  const centerY = (1 - uv[1]) * canvas.height;
  const size = Math.max(32, canvas.width * Math.max(0.08, Math.min(0.8, scale * 0.9)));
  const aspect = (decalImage.naturalWidth || decalImage.width) / Math.max(1, decalImage.naturalHeight || decalImage.height);
  const width = size;
  const height = size / Math.max(0.1, aspect);

  context.save();
  context.translate(centerX, centerY);
  context.rotate((-rotationDeg * Math.PI) / 180);
  context.drawImage(decalImage, -width / 2, -height / 2, width, height);
  context.restore();
};

const extractImageBytes = ({
  json,
  binChunk,
  imageIndex,
}: {
  json: GlbJson;
  binChunk: Uint8Array;
  imageIndex: number;
}) => {
  const imageDef = json.images?.[imageIndex];
  if (!imageDef || imageDef.bufferView == null) {
    throw new Error(`Image ${imageIndex} is not embedded in GLB binary.`);
  }

  const bufferView = json.bufferViews?.[imageDef.bufferView];
  if (!bufferView) {
    throw new Error(`Buffer view ${imageDef.bufferView} is missing for image ${imageIndex}.`);
  }

  const byteOffset = bufferView.byteOffset || 0;
  const bytes = binChunk.slice(byteOffset, byteOffset + bufferView.byteLength);
  return {
    imageDef,
    bytes,
  };
};

const rebuildGlbWithModifiedImages = async ({
  sourceBlob,
  replacementPrimitiveTargets,
  replacementTextureUrl,
  replaceTextureScale,
  replaceTextureScaleX,
  replaceTextureScaleY,
  replaceTextureRotationDeg,
  decalImageIndices,
  decalTextureUrl,
  decalUv,
  decalScale,
  decalRotationDeg,
}: {
  sourceBlob: Blob;
  replacementPrimitiveTargets: Array<{
    meshIndex: number;
    primitiveIndex: number;
    materialIndex: number;
  }>;
  replacementTextureUrl: string | null;
  replaceTextureScale: number;
  replaceTextureScaleX: number;
  replaceTextureScaleY: number;
  replaceTextureRotationDeg: number;
  decalImageIndices: number[];
  decalTextureUrl: string | null;
  decalUv: [number, number] | null;
  decalScale: number;
  decalRotationDeg: number;
}) => {
  const buffer = await sourceBlob.arrayBuffer();
  const { json, binChunk } = parseGlb(buffer);
  if (replacementPrimitiveTargets.length === 0 && decalImageIndices.length === 0) {
    return sourceBlob;
  }

  const bufferViews = (json.bufferViews || []).map((entry) => ({ ...entry }));
  const images = (json.images || []).map((entry) => ({ ...entry }));
  const textures = (json.textures || []).map((entry) => ({ ...entry }));
  const binaryChunks: Uint8Array[] = [];

  for (const bufferView of bufferViews) {
    const byteOffset = bufferView.byteOffset || 0;
    const sourceBytes = binChunk.slice(byteOffset, byteOffset + bufferView.byteLength);
    const padded = new Uint8Array(padTo4(sourceBytes.length));
    padded.set(sourceBytes);
    binaryChunks.push(padded);
  }

  const materials = (json.materials || []).map((entry) => ({
    ...entry,
    pbrMetallicRoughness: entry.pbrMetallicRoughness
      ? {
          ...entry.pbrMetallicRoughness,
          baseColorTexture: entry.pbrMetallicRoughness.baseColorTexture
            ? {
                ...entry.pbrMetallicRoughness.baseColorTexture,
                extensions: entry.pbrMetallicRoughness.baseColorTexture.extensions
                  ? {
                      ...entry.pbrMetallicRoughness.baseColorTexture.extensions,
                      KHR_texture_transform:
                        entry.pbrMetallicRoughness.baseColorTexture.extensions
                          .KHR_texture_transform
                          ? {
                              ...entry.pbrMetallicRoughness.baseColorTexture.extensions
                                  .KHR_texture_transform,
                            }
                          : undefined,
                    }
                  : undefined,
              }
            : undefined,
        }
      : undefined,
  }));
  const clonedMaterialIndexByOriginal = new Map<number, number>();

  for (const target of replacementPrimitiveTargets) {
    let materialIndex = clonedMaterialIndexByOriginal.get(target.materialIndex);
    if (materialIndex == null) {
      const originalMaterial = materials[target.materialIndex];
      if (!originalMaterial) {
        continue;
      }

      materialIndex = materials.length;
      materials.push({
        ...originalMaterial,
        pbrMetallicRoughness: originalMaterial.pbrMetallicRoughness
          ? {
              ...originalMaterial.pbrMetallicRoughness,
              baseColorTexture: originalMaterial.pbrMetallicRoughness.baseColorTexture
                ? {
                    ...originalMaterial.pbrMetallicRoughness.baseColorTexture,
                    extensions: originalMaterial.pbrMetallicRoughness.baseColorTexture.extensions
                      ? {
                          ...originalMaterial.pbrMetallicRoughness.baseColorTexture.extensions,
                          KHR_texture_transform:
                            originalMaterial.pbrMetallicRoughness.baseColorTexture.extensions
                              .KHR_texture_transform
                              ? {
                                  ...originalMaterial.pbrMetallicRoughness.baseColorTexture
                                      .extensions.KHR_texture_transform,
                                }
                              : undefined,
                        }
                      : undefined,
                  }
                : undefined,
            }
          : undefined,
      });
      clonedMaterialIndexByOriginal.set(target.materialIndex, materialIndex);
    }

    const primitive = json.meshes?.[target.meshIndex]?.primitives?.[target.primitiveIndex];
    if (primitive) {
      primitive.material = materialIndex;
    }
  }

  for (const materialIndex of clonedMaterialIndexByOriginal.values()) {
    const textureInfo = materials[materialIndex]?.pbrMetallicRoughness?.baseColorTexture;
    const textureIndex = textureInfo?.index;
    const imageIndex = textureIndex != null ? textures[textureIndex]?.source : undefined;
    if (!textureInfo || textureIndex == null || imageIndex == null) {
      continue;
    }

    const { imageDef, bytes } = extractImageBytes({ json, binChunk, imageIndex });
    const originalBlob = new Blob([bytes], { type: getMimeFromImageDef(imageDef) });
    const originalImage = await readFileAsImage(originalBlob);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, originalImage.naturalWidth || originalImage.width);
    canvas.height = Math.max(1, originalImage.naturalHeight || originalImage.height);

    if (replacementTextureUrl) {
      await drawReplacementPattern({
        canvas,
        textureUrl: replacementTextureUrl,
        scale: replaceTextureScale,
        scaleX: replaceTextureScaleX,
        scaleY: replaceTextureScaleY,
        rotationDeg: replaceTextureRotationDeg,
      });
    }

    if (decalTextureUrl && decalUv) {
      await drawDecalOverlay({
        canvas,
        decalUrl: decalTextureUrl,
        uv: decalUv,
        scale: decalScale,
        rotationDeg: decalRotationDeg,
      });
    }

    const encodedBytes = encodeCanvas(canvas, getMimeFromImageDef(imageDef));
    const padded = new Uint8Array(padTo4(encodedBytes.length));
    padded.set(encodedBytes);

    const newBufferViewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteLength: encodedBytes.length,
    });
    binaryChunks.push(padded);

    const newImageIndex = images.length;
    images.push({
      mimeType: imageDef.mimeType,
      bufferView: newBufferViewIndex,
    });

    const newTextureIndex = textures.length;
    const originalTexture = textures[textureIndex] || {};
    textures.push({
      ...originalTexture,
      source: newImageIndex,
    });

    textureInfo.index = newTextureIndex;
    textureInfo.texCoord = 0;
    if (textureInfo.extensions?.KHR_texture_transform) {
      textureInfo.extensions.KHR_texture_transform = {
        offset: [0, 0],
        scale: [1, 1],
        rotation: 0,
        texCoord: 0,
      };
    }
  }

  const nextChunks: Uint8Array[] = [];
  let nextOffset = 0;

  for (let index = 0; index < bufferViews.length; index += 1) {
    const bufferView = bufferViews[index];
    const sourceBytes = binaryChunks[index] || new Uint8Array();
    const padded = new Uint8Array(padTo4(sourceBytes.length));
    padded.set(sourceBytes);
    bufferView.byteOffset = nextOffset;
    bufferView.byteLength = sourceBytes.length;
    nextChunks.push(padded);
    nextOffset += padded.length;
  }

  if (!json.buffers?.length) {
    json.buffers = [{ byteLength: nextOffset }];
  } else {
    json.buffers[0].byteLength = nextOffset;
  }
  json.materials = materials;
  json.bufferViews = bufferViews;
  json.images = images;
  json.textures = textures;

  const binData = new Uint8Array(nextOffset);
  let cursor = 0;
  for (const chunk of nextChunks) {
    binData.set(chunk, cursor);
    cursor += chunk.length;
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedJson = new Uint8Array(padTo4(jsonBytes.length));
  paddedJson.set(jsonBytes);
  for (let index = jsonBytes.length; index < paddedJson.length; index += 1) {
    paddedJson[index] = 0x20;
  }

  const totalLength = 12 + 8 + paddedJson.length + 8 + binData.length;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedJson.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(paddedJson, 20);
  const binHeaderOffset = 20 + paddedJson.length;
  view.setUint32(binHeaderOffset, binData.length, true);
  view.setUint32(binHeaderOffset + 4, 0x004e4942, true);
  glb.set(binData, binHeaderOffset + 8);

  return new Blob([glb], { type: "model/gltf-binary" });
};

const postProcessExportedAvatarBlob = async ({
  sourceBlob,
  replaceTextureUrl,
  replaceTextureMeshes,
  replaceTextureScale,
  replaceTextureScaleX,
  replaceTextureScaleY,
  replaceTextureRotationDeg,
  decalTextureUrl,
  stickerTargetMeshName,
  decalTransform,
}: {
  sourceBlob: Blob;
  replaceTextureUrl: string | null;
  replaceTextureMeshes: readonly MeshSlot[];
  replaceTextureScale: number;
  replaceTextureScaleX: number;
  replaceTextureScaleY: number;
  replaceTextureRotationDeg: number;
  decalTextureUrl: string | null;
  stickerTargetMeshName: string | null;
  decalTransform: StickerTransform;
}) => {
  const needsTexture = Boolean(replaceTextureUrl && replaceTextureMeshes.length > 0);
  const needsDecal = Boolean(decalTextureUrl && stickerTargetMeshName && decalTransform.uv);
  if (!needsTexture && !needsDecal) {
    return sourceBlob;
  }

  const buffer = await sourceBlob.arrayBuffer();
  const { json } = parseGlb(buffer);
  const replacementPrimitiveTargets = needsTexture
    ? collectPrimitiveTargetsForMeshes(json, replaceTextureMeshes)
    : [];

  return rebuildGlbWithModifiedImages({
    sourceBlob,
    replacementPrimitiveTargets,
    replacementTextureUrl: needsTexture ? replaceTextureUrl : null,
    replaceTextureScale,
    replaceTextureScaleX,
    replaceTextureScaleY,
    replaceTextureRotationDeg,
    decalImageIndices: [],
    decalTextureUrl: needsDecal ? decalTextureUrl : null,
    decalUv: needsDecal ? decalTransform.uv || null : null,
    decalScale: decalTransform.scale,
    decalRotationDeg: decalTransform.rotationDeg,
  });
};

function App() {
  const [activeType, setActiveType] = useState<SupportedType>(
    groups[0]?.types[0] || "top"
  );
  const [locale, setLocale] = useState<UiLocale>("ru");
  const [isPaintPanelOpen, setIsPaintPanelOpen] = useState(false);
  const [decalTextureUrl, setDecalTextureUrl] = useState<string | null>(null);
  const [replaceTextureUrlState, setReplaceTextureUrlState] = useState<string | null>(null);
  const [decalFileName, setDecalFileName] = useState<string>("");
  const [replaceFileName, setReplaceFileName] = useState<string>("");
  const [isStickerEditMode, setIsStickerEditMode] = useState(false);
  const [isStickerDragging, setIsStickerDragging] = useState(false);
  const [stickerTargetMesh, setStickerTargetMesh] = useState<Mesh | null>(null);
  const [decalTransform, setDecalTransform] = useState<StickerTransform>({
    position: [0, 0.35, 0.25],
    normal: [0, 0, 1],
    uv: [0.5, 0.5],
    scale: 0.35,
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

  const updateStickerTransformFromEvent = (event: ThreeEvent<PointerEvent>) => {
    const surfaceHit = event.intersections.find((hit) => {
      const data = (hit.object as { userData?: Record<string, unknown> }).userData;
      return Boolean(data?.avatarSurface);
    });

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
        setDecalTextureUrl((current) => {
          if (current && current.startsWith("blob:")) {
            URL.revokeObjectURL(current);
          }
          return result;
        });
        setDecalFileName(file.name);
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
      }
    };
    reader.readAsDataURL(file);
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
    if (activeType === "outfit")
      return [SLOT_NAMES.top, SLOT_NAMES.bottom, SLOT_NAMES.footwear];
    return [];
  }, [activeType]);
  const canUseReplacement = replacementSlots.length > 0;
  const shouldReplaceTexture = Boolean(replaceTextureUrlState) && canUseReplacement;
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
          decalTextureUrl,
          stickerTargetMeshName: stickerTargetMesh?.name || null,
          decalTransform,
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

  return (
    <main className="creator-shell">
      <section className="stage-panel">
        <button
          className="paint-toggle-button"
          type="button"
          aria-label={copy.paintPanel}
          onClick={() => setIsPaintPanelOpen((current) => !current)}
        >
          <span>{isPaintPanelOpen ? "×" : "◈"}</span>
        </button>
        <div className="stage-toolbar">
          <button
            className="locale-toggle"
            type="button"
            onClick={() => setLocale((current) => (current === "ru" ? "en" : "ru"))}
            aria-label={`Switch language to ${locale === "ru" ? "English" : "Russian"}`}
          >
            <span className="locale-chip locale-chip--active">{locale === "ru" ? "R" : "E"}</span>
          </button>
          <button className="next-button" type="button" onClick={handleNext}>
            {copy.next} <span aria-hidden>→</span>
          </button>
        </div>

        {isPaintPanelOpen ? (
          <PaintPanel
            copy={copy}
            decalFileName={decalFileName}
            hasDecal={Boolean(decalTextureUrl)}
            onUploadDecal={() => decalUploadInputRef.current?.click()}
            onRemoveDecal={() => {
              setDecalTextureUrl((current) => {
                if (current && current.startsWith("blob:")) {
                  URL.revokeObjectURL(current);
                }
                return null;
              });
              setDecalFileName("");
              setStickerTargetMesh(null);
              setIsStickerEditMode(false);
            }}
            isDecalEditMode={isStickerEditMode}
            onToggleDecalEditMode={setIsStickerEditMode}
            decalScale={decalTransform.scale}
            onDecalScale={(value) =>
              setDecalTransform((current) => ({
                ...current,
                scale: value,
              }))
            }
            decalRotationDeg={decalTransform.rotationDeg}
            onDecalRotationDeg={(value) =>
              setDecalTransform((current) => ({
                ...current,
                rotationDeg: value,
              }))
            }
            textureFileName={replaceFileName}
            hasTexture={Boolean(replaceTextureUrlState)}
            canUseReplacement={canUseReplacement}
            onUploadTexture={() => textureUploadInputRef.current?.click()}
            onRemoveTexture={() => {
              setReplaceTextureUrlState((current) => {
                if (current && current.startsWith("blob:")) {
                  URL.revokeObjectURL(current);
                }
                return null;
              });
              setReplaceFileName("");
            }}
            replaceScale={replaceScale}
            onReplaceScale={setReplaceScale}
            replaceScaleX={replaceScaleX}
            onReplaceScaleX={setReplaceScaleX}
            replaceScaleY={replaceScaleY}
            onReplaceScaleY={setReplaceScaleY}
            replaceRotationDeg={replaceRotationDeg}
            onReplaceRotationDeg={setReplaceRotationDeg}
          />
        ) : null}

        <div className="stage-canvas-wrap">
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            camera={{ position: [0, 1.34, 5.05], fov: 31 }}
            onPointerUp={() => setIsStickerDragging(false)}
            onPointerLeave={() => setIsStickerDragging(false)}
          >
            <SceneBridge
              onReady={({ renderer, scene, camera }) => {
                rendererRef.current = renderer;
                sceneRef.current = scene;
                cameraRef.current = camera;
              }}
            />
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
                onPointerDown={(event) => {
                  if (!decalTextureUrl || !isStickerEditMode) return;
                  updateStickerTransformFromEvent(event);
                  setIsStickerDragging(true);
                  event.stopPropagation();
                }}
                onPointerMove={(event) => {
                  if (!decalTextureUrl || !isStickerEditMode || !isStickerDragging)
                    return;
                  updateStickerTransformFromEvent(event);
                  event.stopPropagation();
                }}
                onPointerUp={(event) => {
                  if (!decalTextureUrl || !isStickerEditMode) return;
                  setIsStickerDragging(false);
                  event.stopPropagation();
                }}
              >
                {selectedPreset?.baseModelUrl ? (
                  <AvatarModel
                    modelUrl={selectedPreset.baseModelUrl}
                    hiddenMeshes={composedScene.hiddenBaseMeshes}
                    tintByMesh={tintByMesh}
                    idleAnimationUrl={idleAnimationUrl}
                    replaceTextureUrl={shouldReplaceTexture ? replaceTextureUrlState : null}
                    replaceTextureMeshes={shouldReplaceTexture ? replacementSlots : []}
                    replaceTextureScale={replaceScale}
                    replaceTextureScaleX={replaceScaleX}
                    replaceTextureScaleY={replaceScaleY}
                    replaceTextureRotationDeg={replaceRotationDeg}
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
                    replaceTextureUrl={shouldReplaceTexture ? replaceTextureUrlState : null}
                    replaceTextureMeshes={shouldReplaceTexture ? replacementSlots : []}
                    replaceTextureScale={replaceScale}
                    replaceTextureScaleX={replaceScaleX}
                    replaceTextureScaleY={replaceScaleY}
                    replaceTextureRotationDeg={replaceRotationDeg}
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
                {decalTextureUrl ? (
                  <SurfaceSticker
                    textureUrl={decalTextureUrl}
                    transform={decalTransform}
                    targetMesh={stickerTargetMesh}
                  />
                ) : null}
              </group>
              <AutoStickerProjector
                enabled={Boolean(decalTextureUrl)}
                hasTarget={Boolean(stickerTargetMesh)}
                onPick={({ mesh, point, normal, uv }) => {
                  setStickerTargetMesh(mesh);
                  setDecalTransform((current) => ({
                    ...current,
                    position: [point.x, point.y, point.z],
                    normal: [normal.x, normal.y, normal.z],
                    uv: uv || current.uv,
                  }));
                }}
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

        <input
          ref={decalUploadInputRef}
          type="file"
          accept="image/png"
          className="texture-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            handleUploadByTarget(file, "decal");
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
            handleUploadByTarget(file, "replace");
            event.currentTarget.value = "";
          }}
        />
        {isExportModalOpen ? (
          <ExportPreviewModal
            copy={copy}
            previewUrl={exportPreviewUrl}
            downloadUrl={exportDownloadUrl}
            fileName={exportFileName}
            onClose={() => setIsExportModalOpen(false)}
          />
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
