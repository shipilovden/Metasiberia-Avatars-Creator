import {
  CanvasTexture,
  ClampToEdgeWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
} from "three";
import type { AppliedUvDecal } from "./shared";

export const readFileAsImage = (blob: Blob) =>
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

export const getPrimaryTextureMap = (material: unknown) => {
  const entry = Array.isArray(material) ? material[0] : material;
  const map = (entry as { map?: Texture | null } | null)?.map || null;
  return map?.image ? map : null;
};

export const drawReplacementPatternFromImage = ({
  canvas,
  image,
  scale,
  scaleX,
  scaleY,
  rotationDeg,
}: {
  canvas: HTMLCanvasElement;
  image: CanvasImageSource;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
}) => {
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
  const sourceWidth = "width" in image ? Number(image.width) || 0 : 0;
  const sourceHeight = "height" in image ? Number(image.height) || 0 : 0;
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext || sourceWidth <= 0 || sourceHeight <= 0) {
    return;
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

      const sampleX = Math.max(
        0,
        Math.min(
          sourceCanvas.width - 1,
          Math.round(Math.max(0, Math.min(1, uv.x)) * (sourceCanvas.width - 1))
        )
      );
      const sampleY = Math.max(
        0,
        Math.min(
          sourceCanvas.height - 1,
          Math.round(Math.max(0, Math.min(1, uv.y)) * (sourceCanvas.height - 1))
        )
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

export const drawUvDecalOverlayToCanvas = ({
  canvas,
  decalImage,
  uv,
  scale,
  scaleX,
  scaleY,
  rotationDeg,
}: {
  canvas: HTMLCanvasElement;
  decalImage: CanvasImageSource;
  uv: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
}) => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const centerX = uv[0] * canvas.width;
  const centerY = (1 - uv[1]) * canvas.height;
  const decalWidth = "width" in decalImage ? Number(decalImage.width) || 1 : 1;
  const decalHeight = "height" in decalImage ? Number(decalImage.height) || 1 : 1;
  const aspect = decalWidth / Math.max(1, decalHeight);
  const widthUv = Math.max(0.01, scale) * Math.max(0.01, scaleX);
  const heightUv =
    (Math.max(0.01, scale) * Math.max(0.01, scaleY)) / Math.max(0.1, aspect);
  const width = Math.max(2, canvas.width * widthUv);
  const height = Math.max(2, canvas.height * heightUv);

  context.save();
  context.translate(centerX, centerY);
  context.rotate((-rotationDeg * Math.PI) / 180);
  context.drawImage(decalImage, -width / 2, -height / 2, width, height);
  context.restore();
};

export const buildCombinedPreviewTexture = async ({
  baseMap,
  replacementTexture,
  replaceTextureScale,
  replaceTextureScaleX,
  replaceTextureScaleY,
  replaceTextureRotationDeg,
  appliedUvDecals,
}: {
  baseMap: Texture;
  replacementTexture: Texture | null;
  replaceTextureScale: number;
  replaceTextureScaleX: number;
  replaceTextureScaleY: number;
  replaceTextureRotationDeg: number;
  appliedUvDecals: readonly AppliedUvDecal[];
}) => {
  const baseImage = baseMap.image as CanvasImageSource | undefined;
  const width = baseImage && "width" in baseImage ? Number(baseImage.width) || 0 : 0;
  const height = baseImage && "height" in baseImage ? Number(baseImage.height) || 0 : 0;
  if (!baseImage || width <= 0 || height <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  if (replacementTexture?.image) {
    drawReplacementPatternFromImage({
      canvas,
      image: replacementTexture.image as CanvasImageSource,
      scale: replaceTextureScale,
      scaleX: replaceTextureScaleX,
      scaleY: replaceTextureScaleY,
      rotationDeg: replaceTextureRotationDeg,
    });
  } else {
    context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  }

  for (const appliedUvDecal of appliedUvDecals) {
    const decalImage = await readFileAsImage(
      await fetch(appliedUvDecal.textureUrl).then((response) => response.blob())
    );
    drawUvDecalOverlayToCanvas({
      canvas,
      decalImage,
      uv: appliedUvDecal.uv,
      scale: appliedUvDecal.scale,
      scaleX: appliedUvDecal.scaleX,
      scaleY: appliedUvDecal.scaleY,
      rotationDeg: appliedUvDecal.rotationDeg,
    });
  }

  const bakedTexture = new CanvasTexture(canvas);
  bakedTexture.colorSpace = SRGBColorSpace;
  bakedTexture.flipY = false;
  bakedTexture.needsUpdate = true;
  return bakedTexture;
};
