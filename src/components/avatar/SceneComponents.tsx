import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF, useProgress, useTexture } from "@react-three/drei";
import {
  AnimationClip,
  AnimationMixer,
  Camera,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  POSITION_OFFSET,
  SLOT_NAMES,
  getAppliedUvDecalsForMesh,
} from "./shared";
import type {
  AppliedUvDecal,
  MeshSlot,
  MeshTintEntry,
  MeshTintMap,
} from "./shared";
import {
  buildCombinedPreviewTexture,
  getPrimaryTextureMap,
} from "./texture-utils";

const useIdleAnimation = (scene: Group, idleAnimationUrl: string, enabled = true) => {
  const mixerRef = useRef<AnimationMixer | null>(null);
  const clipDurationRef = useRef<number>(0);
  const { animations } = useGLTF(idleAnimationUrl) as {
    scene: Group;
    animations: AnimationClip[];
  };

  useEffect(() => {
    if (!enabled) {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      clipDurationRef.current = 0;
      return;
    }

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
  }, [animations, enabled, scene]);

  useFrame((state) => {
    if (!enabled) {
      return;
    }

    const mixer = mixerRef.current;
    if (!mixer) {
      return;
    }

    const duration = clipDurationRef.current;
    if (duration <= 0) {
      return;
    }

    const time = state.clock.getElapsedTime() % duration;
    mixer.setTime(time);
  });
};

const applyBakedPreviewMap = (material: unknown, bakedTexture: Texture): unknown => {
  const applyOne = (entry: unknown): unknown => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const materialEntry = entry as { clone?: () => unknown };
    if (typeof materialEntry.clone !== "function") {
      return entry;
    }

    const clonedMaterial = materialEntry.clone() as {
      map?: Texture | null;
      color?: { set?: (value: string) => void };
      needsUpdate?: boolean;
    };
    clonedMaterial.map = bakedTexture;
    clonedMaterial.color?.set?.("#ffffff");
    clonedMaterial.needsUpdate = true;
    return clonedMaterial;
  };

  if (Array.isArray(material)) {
    return material.map((entry) => applyOne(entry));
  }

  return applyOne(material);
};

const applyTextureReplacement = ({
  material,
  replacementTexture,
  replaceTextureScale,
  replaceTextureScaleX,
  replaceTextureScaleY,
  replaceTextureRotationDeg,
}: {
  material: unknown;
  replacementTexture: Texture;
  replaceTextureScale: number;
  replaceTextureScaleX: number;
  replaceTextureScaleY: number;
  replaceTextureRotationDeg: number;
}) => {
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

const cloneMaterialWithTint = (
  material: unknown,
  tint: MeshTintEntry,
  textureTintCache: Map<string, CanvasTexture>
) => {
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
            context.drawImage(sourceMap.image as CanvasImageSource, 0, 0, width, height);
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

                const hasNeighbors = x > 0 && x < width - 1 && y > 0 && y < height - 1;
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
                const lipZone =
                  yNorm > 0.5 && yNorm < 0.7 && xNorm > 0.32 && xNorm < 0.68;
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

export function AvatarModel({
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
  enableIdleAnimation = true,
  appliedUvDecals = [],
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
  enableIdleAnimation?: boolean;
  appliedUvDecals?: readonly AppliedUvDecal[];
}) {
  const { scene } = useGLTF(modelUrl) as { scene: Group };
  const [replacementTexture, setReplacementTexture] = useState<Texture | null>(null);
  const [bakedPreviewMaps, setBakedPreviewMaps] = useState<Record<string, Texture>>({});
  const bakedPreviewMapsRef = useRef<Record<string, Texture>>({});
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

  useEffect(() => {
    let cancelled = false;
    const disposeQueue = Object.values(bakedPreviewMapsRef.current);

    const bake = async () => {
      const nextMaps: Record<string, Texture> = {};
      const replaceSet = new Set(replaceTextureMeshes || []);

      const tasks: Promise<void>[] = [];
      scene.traverse((object) => {
        const mesh = object as {
          isMesh?: boolean;
          name?: string;
          material?: unknown;
        };
        if (!mesh.isMesh || !mesh.name) {
          return;
        }

        const shouldReplace = Boolean(replacementTexture && replaceSet.has(mesh.name as MeshSlot));
        const decalsForMesh = getAppliedUvDecalsForMesh(appliedUvDecals, mesh.name);
        if (!shouldReplace && decalsForMesh.length === 0) {
          return;
        }

        const baseMap = mesh.material ? getPrimaryTextureMap(mesh.material) : null;
        if (!baseMap) {
          return;
        }

        tasks.push(
          buildCombinedPreviewTexture({
            baseMap,
            replacementTexture: shouldReplace ? replacementTexture : null,
            replaceTextureScale,
            replaceTextureScaleX,
            replaceTextureScaleY,
            replaceTextureRotationDeg,
            appliedUvDecals: decalsForMesh,
          }).then((texture) => {
            if (texture) {
              nextMaps[mesh.name as string] = texture;
            }
          })
        );
      });

      await Promise.all(tasks);
      if (cancelled) {
        Object.values(nextMaps).forEach((texture) => texture.dispose());
        return;
      }

      bakedPreviewMapsRef.current = nextMaps;
      setBakedPreviewMaps(nextMaps);
      disposeQueue.forEach((texture) => texture.dispose());
    };

    void bake();

    return () => {
      cancelled = true;
    };
  }, [
    appliedUvDecals,
    replaceTextureMeshes,
    replaceTextureRotationDeg,
    replaceTextureScale,
    replaceTextureScaleX,
    replaceTextureScaleY,
    replacementTexture,
    scene,
  ]);

  const preparedScene = useMemo(() => {
    const includeSet = includeMeshes ? new Set(includeMeshes) : null;
    const hiddenSet = new Set(hiddenMeshes || []);
    const replaceSet = new Set(replaceTextureMeshes || []);
    const textureTintCache = new Map<string, CanvasTexture>();
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
      const bakedPreviewMap = mesh.name ? bakedPreviewMaps[mesh.name] : null;
      const shouldReplaceTexture =
        replacementTexture && replaceSet.has(mesh.name as MeshSlot);
      if (bakedPreviewMap && mesh.material) {
        mesh.material = applyBakedPreviewMap(mesh.material, bakedPreviewMap);
      } else if (shouldReplaceTexture && mesh.material) {
        mesh.material = applyTextureReplacement({
          material: mesh.material,
          replacementTexture,
          replaceTextureScale,
          replaceTextureScaleX,
          replaceTextureScaleY,
          replaceTextureRotationDeg,
        });
      }
      if (tintEntry && mesh.material) {
        mesh.material = cloneMaterialWithTint(
          mesh.material,
          tintEntry,
          textureTintCache
        );
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
    bakedPreviewMaps,
    tintByMesh,
    tintKey,
  ]);

  useIdleAnimation(preparedScene, idleAnimationUrl, enableIdleAnimation);
  return <primitive object={preparedScene} position={POSITION_OFFSET} />;
}

export function AvatarHeadMaskLayer({
  modelUrl,
  maskUrl,
  idleAnimationUrl,
  tintColor,
  renderOrder = 20,
  enableIdleAnimation = true,
}: {
  modelUrl: string;
  maskUrl: string;
  idleAnimationUrl: string;
  tintColor?: string;
  renderOrder?: number;
  enableIdleAnimation?: boolean;
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

  useIdleAnimation(preparedScene, idleAnimationUrl, enableIdleAnimation);
  return <primitive object={preparedScene} position={POSITION_OFFSET} />;
}

export function AutoStickerProjector({
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

export function PlaceholderAvatar() {
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

export function SceneLoader() {
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

export function SceneBridge({
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
