import { useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, Mesh, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Copy = {
  uvEditorTitle: string;
  uvEditorHint: string;
  uvApply: string;
  uvReset: string;
  uvUndoLabel: string;
  uvClearApplied: string;
  uvTarget: string;
  uvEmpty: string;
};

type SlotOption = {
  id: string;
  label: string;
};

type AppliedUvDecal = {
  id: string;
  meshName: string;
  uv: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  textureUrl: string;
};

type LoadedUvMesh = {
  geometry: BufferGeometry;
  baseTextureImage: CanvasImageSource | null;
};

export type UvDecalEditorProps = {
  copy: Copy;
  slotOptions: SlotOption[];
  selectedSlot: string | null;
  onSelectSlot: (slot: string) => void;
  modelUrl: string | null;
  decalTextureUrl: string | null;
  appliedDecals: readonly AppliedUvDecal[];
  draftUv: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  onDraftUvChange: (uv: [number, number]) => void;
  onScaleXChange: (value: number) => void;
  onScaleYChange: (value: number) => void;
  onApply: () => void;
  onReset: () => void;
  onClearApplied: () => void;
  hasApplied: boolean;
};

type PanelSize = {
  width: number;
  height: number;
};

type ViewportState = {
  zoom: number;
  panX: number;
  panY: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

type DraftSnapshot = {
  uv: [number, number];
  scaleX: number;
  scaleY: number;
};

type HandleName = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type InteractionState =
  | {
      mode: "move";
      pointerId: number;
      offsetU: number;
      offsetV: number;
    }
  | {
      mode: "pan";
      pointerId: number;
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      mode: "resize";
      pointerId: number;
      handle: HandleName;
      startCenter: { x: number; y: number };
      startWidth: number;
      startHeight: number;
      baseWidth: number;
      baseHeight: number;
      rotationRad: number;
    }
  | null;

type ResizeState =
  | {
      pointerId: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    }
  | null;

type ScreenPoint = {
  x: number;
  y: number;
};

const DEFAULT_PANEL_SIZE: PanelSize = { width: 420, height: 650 };
const DEFAULT_VIEWPORT: ViewportState = { zoom: 1, panX: 0, panY: 0 };
const MIN_PANEL_WIDTH = 340;
const MIN_PANEL_HEIGHT = 400;
const MAX_PANEL_WIDTH_FALLBACK = 760;
const MAX_PANEL_HEIGHT_FALLBACK = 840;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 10;
const MIN_SCALE_AXIS = 0.01;
const MAX_SCALE_AXIS = 8;
const MIN_SCREEN_SIZE = 4;
const HANDLE_SIZE = 10;
const HANDLE_HIT_RADIUS = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

const getPanelBounds = () => {
  if (typeof window === "undefined") {
    return {
      maxWidth: MAX_PANEL_WIDTH_FALLBACK,
      maxHeight: MAX_PANEL_HEIGHT_FALLBACK,
    };
  }

  return {
    maxWidth: Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH_FALLBACK, Math.floor(window.innerWidth * 0.6))),
    maxHeight: Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT_FALLBACK, window.innerHeight - 96)),
  };
};

const clampPanelSize = (size: PanelSize): PanelSize => {
  const bounds = getPanelBounds();
  return {
    width: clamp(size.width, MIN_PANEL_WIDTH, bounds.maxWidth),
    height: clamp(size.height, MIN_PANEL_HEIGHT, bounds.maxHeight),
  };
};

const getMaterialTexture = (mesh: Mesh) => {
  const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const texture = (sourceMaterial as { map?: Texture | null } | null)?.map || null;
  return texture?.image ? (texture.image as CanvasImageSource) : null;
};

const findMeshByName = (
  root: { traverse: (fn: (object: unknown) => void) => void },
  meshName: string
): Mesh | null => {
  let targetMesh: Mesh | null = null;
  root.traverse((object) => {
    if (targetMesh) {
      return;
    }

    const mesh = object as Mesh & { isMesh?: boolean };
    if (mesh.isMesh && mesh.name === meshName) {
      targetMesh = mesh;
    }
  });
  return targetMesh;
};

const getCanvasMetrics = (size: CanvasSize, viewport: ViewportState) => {
  const viewSize = Math.min(size.width, size.height) * viewport.zoom;
  const originX = size.width * 0.5 + viewport.panX - viewSize * 0.5;
  const originY = size.height * 0.5 + viewport.panY - viewSize * 0.5;

  return {
    originX,
    originY,
    viewSize,
  };
};

const uvToScreen = (uv: [number, number], size: CanvasSize, viewport: ViewportState) => {
  const metrics = getCanvasMetrics(size, viewport);
  return {
    x: metrics.originX + uv[0] * metrics.viewSize,
    y: metrics.originY + (1 - uv[1]) * metrics.viewSize,
  };
};

const screenToUv = (x: number, y: number, size: CanvasSize, viewport: ViewportState) => {
  const metrics = getCanvasMetrics(size, viewport);
  return {
    u: (x - metrics.originX) / Math.max(1, metrics.viewSize),
    v: 1 - (y - metrics.originY) / Math.max(1, metrics.viewSize),
  };
};

const getZoomedViewport = ({
  viewport,
  size,
  pointerX,
  pointerY,
  zoomFactor,
}: {
  viewport: ViewportState;
  size: CanvasSize;
  pointerX: number;
  pointerY: number;
  zoomFactor: number;
}): ViewportState => {
  const uvBeforeZoom = screenToUv(pointerX, pointerY, size, viewport);
  const nextZoom = clamp(viewport.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
  const nextViewSize = Math.min(size.width, size.height) * nextZoom;
  const screenV = 1 - uvBeforeZoom.v;
  const nextOriginX = pointerX - uvBeforeZoom.u * nextViewSize;
  const nextOriginY = pointerY - screenV * nextViewSize;

  return {
    zoom: nextZoom,
    panX: nextOriginX + nextViewSize * 0.5 - size.width * 0.5,
    panY: nextOriginY + nextViewSize * 0.5 - size.height * 0.5,
  };
};

const getDecalScreenMetrics = ({
  image,
  draftUv,
  scale,
  scaleX,
  scaleY,
  size,
  viewport,
}: {
  image: HTMLImageElement;
  draftUv: [number, number];
  scale: number;
  scaleX: number;
  scaleY: number;
  size: CanvasSize;
  viewport: ViewportState;
}) => {
  const center = uvToScreen(draftUv, size, viewport);
  const { viewSize } = getCanvasMetrics(size, viewport);
  const baseWidth = Math.max(MIN_SCREEN_SIZE, viewSize * scale);
  const aspect =
    (image.naturalWidth || image.width || 1) /
    Math.max(1, image.naturalHeight || image.height || 1);
  const baseHeight = Math.max(MIN_SCREEN_SIZE, baseWidth / Math.max(0.1, aspect));

  return {
    center,
    baseWidth,
    baseHeight,
    width: Math.max(MIN_SCREEN_SIZE, baseWidth * Math.max(MIN_SCALE_AXIS, scaleX)),
    height: Math.max(MIN_SCREEN_SIZE, baseHeight * Math.max(MIN_SCALE_AXIS, scaleY)),
    rotationRad: (-rotationDegToRad(0) + 0),
  };
};

const rotationDegToRad = (rotationDeg: number) => (-rotationDeg * Math.PI) / 180;

const rotatePoint = (point: ScreenPoint, angleRad: number): ScreenPoint => ({
  x: point.x * Math.cos(angleRad) - point.y * Math.sin(angleRad),
  y: point.x * Math.sin(angleRad) + point.y * Math.cos(angleRad),
});

const toLocalPoint = (point: ScreenPoint, center: ScreenPoint, angleRad: number) =>
  rotatePoint({ x: point.x - center.x, y: point.y - center.y }, -angleRad);

const toScreenPoint = (point: ScreenPoint, center: ScreenPoint, angleRad: number) => {
  const rotated = rotatePoint(point, angleRad);
  return { x: center.x + rotated.x, y: center.y + rotated.y };
};

const isInsideRect = (point: ScreenPoint, width: number, height: number) =>
  Math.abs(point.x) <= width * 0.5 && Math.abs(point.y) <= height * 0.5;

const HANDLE_FACTORS: Record<HandleName, ScreenPoint> = {
  n: { x: 0, y: -0.5 },
  s: { x: 0, y: 0.5 },
  e: { x: 0.5, y: 0 },
  w: { x: -0.5, y: 0 },
  ne: { x: 0.5, y: -0.5 },
  nw: { x: -0.5, y: -0.5 },
  se: { x: 0.5, y: 0.5 },
  sw: { x: -0.5, y: 0.5 },
};

const getHandlePositions = (center: ScreenPoint, width: number, height: number, angleRad: number) =>
  (Object.entries(HANDLE_FACTORS) as [HandleName, ScreenPoint][]).map(([handle, factor]) => ({
    handle,
    point: toScreenPoint(
      {
        x: factor.x * width,
        y: factor.y * height,
      },
      center,
      angleRad
    ),
  }));

const drawDecal = ({
  context,
  image,
  center,
  width,
  height,
  rotationDeg,
  strokeStyle,
  drawHandles,
}: {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  center: ScreenPoint;
  width: number;
  height: number;
  rotationDeg: number;
  strokeStyle?: string;
  drawHandles?: boolean;
}) => {
  const rotationRad = rotationDegToRad(rotationDeg);
  context.save();
  context.translate(center.x, center.y);
  context.rotate(rotationRad);
  context.drawImage(image, -width * 0.5, -height * 0.5, width, height);
  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = 2;
    context.strokeRect(-width * 0.5, -height * 0.5, width, height);
  }
  if (drawHandles) {
    const localHandlePoints = Object.values(HANDLE_FACTORS);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#00d9e8";
    context.lineWidth = 1.5;
    for (const factor of localHandlePoints) {
      const x = factor.x * width;
      const y = factor.y * height;
      context.beginPath();
      context.rect(x - HANDLE_SIZE * 0.5, y - HANDLE_SIZE * 0.5, HANDLE_SIZE, HANDLE_SIZE);
      context.fill();
      context.stroke();
    }
  }
  context.restore();
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

export function UvDecalEditor({
  copy,
  slotOptions,
  selectedSlot,
  onSelectSlot,
  modelUrl,
  decalTextureUrl,
  appliedDecals,
  draftUv,
  scale,
  scaleX,
  scaleY,
  rotationDeg,
  onDraftUvChange,
  onScaleXChange,
  onScaleYChange,
  onApply,
  onReset,
  onClearApplied,
  hasApplied,
}: UvDecalEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState>(null);
  const resizeStateRef = useRef<ResizeState>(null);
  const undoStackRef = useRef<DraftSnapshot[]>([]);
  const [panelSize, setPanelSize] = useState<PanelSize>(() => clampPanelSize(DEFAULT_PANEL_SIZE));
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [loadedMesh, setLoadedMesh] = useState<LoadedUvMesh | null>(null);
  const [decalImages, setDecalImages] = useState<Record<string, HTMLImageElement>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);

  const activeSlot = selectedSlot || slotOptions[0]?.id || null;
  const activeAppliedDecals = useMemo(
    () => appliedDecals.filter((entry) => entry.meshName === activeSlot),
    [activeSlot, appliedDecals]
  );
  const draftImage = decalTextureUrl ? decalImages[decalTextureUrl] || null : null;
  const uniqueTextureUrls = useMemo(() => {
    const urls = new Set<string>();
    if (decalTextureUrl) {
      urls.add(decalTextureUrl);
    }
    for (const decal of activeAppliedDecals) {
      urls.add(decal.textureUrl);
    }
    return Array.from(urls);
  }, [activeAppliedDecals, decalTextureUrl]);

  const pushUndoSnapshot = () => {
    undoStackRef.current.push({
      uv: [draftUv[0], draftUv[1]],
      scaleX,
      scaleY,
    });
    setUndoDepth(undoStackRef.current.length);
  };

  const applySnapshot = (snapshot: DraftSnapshot) => {
    onDraftUvChange(snapshot.uv);
    onScaleXChange(snapshot.scaleX);
    onScaleYChange(snapshot.scaleY);
  };

  const draftScreenState = useMemo(() => {
    if (!draftImage || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return null;
    }

    const center = uvToScreen(draftUv, canvasSize, viewport);
    const { viewSize } = getCanvasMetrics(canvasSize, viewport);
    const baseWidth = Math.max(MIN_SCREEN_SIZE, viewSize * scale);
    const aspect =
      (draftImage.naturalWidth || draftImage.width || 1) /
      Math.max(1, draftImage.naturalHeight || draftImage.height || 1);
    const baseHeight = Math.max(MIN_SCREEN_SIZE, baseWidth / Math.max(0.1, aspect));
    const width = Math.max(MIN_SCREEN_SIZE, baseWidth * Math.max(MIN_SCALE_AXIS, scaleX));
    const height = Math.max(MIN_SCREEN_SIZE, baseHeight * Math.max(MIN_SCALE_AXIS, scaleY));
    const rotationRad = rotationDegToRad(rotationDeg);

    return {
      center,
      baseWidth,
      baseHeight,
      width,
      height,
      rotationRad,
      handlePositions: getHandlePositions(center, width, height, rotationRad),
    };
  }, [canvasSize, draftImage, draftUv, rotationDeg, scale, scaleX, scaleY, viewport]);

  useEffect(() => {
    if (!modelUrl || !activeSlot) {
      setLoadedMesh(null);
      return;
    }

    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) {
          return;
        }

        const mesh = findMeshByName(gltf.scene, activeSlot);
        if (!mesh) {
          setLoadedMesh(null);
          return;
        }

        setLoadedMesh({
          geometry: mesh.geometry.clone(),
          baseTextureImage: getMaterialTexture(mesh),
        });
      },
      undefined,
      () => {
        if (!cancelled) {
          setLoadedMesh(null);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [activeSlot, modelUrl]);

  useEffect(() => {
    let cancelled = false;
    const missingUrls = uniqueTextureUrls.filter((url) => !decalImages[url]);
    if (!missingUrls.length) {
      return;
    }

    (async () => {
      const loadedPairs = await Promise.all(
        missingUrls.map(async (url) => {
          try {
            return [url, await loadImage(url)] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) {
        return;
      }

      setDecalImages((current) => {
        const next = { ...current };
        for (const pair of loadedPairs) {
          if (pair) {
            next[pair[0]] = pair[1];
          }
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [decalImages, uniqueTextureUrls]);

  useEffect(() => {
    const bounds = clampPanelSize(panelSize);
    if (bounds.width !== panelSize.width || bounds.height !== panelSize.height) {
      setPanelSize(bounds);
    }

    const handleWindowResize = () => {
      setPanelSize((current) => clampPanelSize(current));
    };

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [panelSize]);

  useEffect(() => {
    const element = canvasWrapRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextEntry = entries[0];
      if (!nextEntry) {
        return;
      }

      const width = Math.max(1, Math.round(nextEntry.contentRect.width));
      const height = Math.max(1, Math.round(nextEntry.contentRect.height));

      setCanvasSize((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, [activeSlot, modelUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const geometry = loadedMesh?.geometry;
    const uvAttribute = geometry?.getAttribute("uv");
    if (!canvas || !geometry || !uvAttribute || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvasSize.width * dpr));
    canvas.height = Math.max(1, Math.round(canvasSize.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const { originX, originY, viewSize } = getCanvasMetrics(canvasSize, viewport);
    context.fillStyle = "#f6f6f6";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#ffffff";
    context.fillRect(originX, originY, viewSize, viewSize);

    if (loadedMesh.baseTextureImage) {
      context.globalAlpha = 0.96;
      context.drawImage(loadedMesh.baseTextureImage, originX, originY, viewSize, viewSize);
      context.globalAlpha = 1;
    }

    context.save();
    context.strokeStyle = "rgba(0, 0, 0, 0.12)";
    context.lineWidth = 1;
    context.beginPath();

    const indexAttribute = geometry.getIndex();
    const triangleCount = indexAttribute
      ? Math.floor(indexAttribute.count / 3)
      : Math.floor(uvAttribute.count / 3);

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const readIndex = (vertexOffset: number) =>
        indexAttribute ? indexAttribute.getX(triangleIndex * 3 + vertexOffset) : triangleIndex * 3 + vertexOffset;

      const a = readIndex(0);
      const b = readIndex(1);
      const c = readIndex(2);
      const pointA = uvToScreen([uvAttribute.getX(a), uvAttribute.getY(a)], canvasSize, viewport);
      const pointB = uvToScreen([uvAttribute.getX(b), uvAttribute.getY(b)], canvasSize, viewport);
      const pointC = uvToScreen([uvAttribute.getX(c), uvAttribute.getY(c)], canvasSize, viewport);

      context.moveTo(pointA.x, pointA.y);
      context.lineTo(pointB.x, pointB.y);
      context.lineTo(pointC.x, pointC.y);
      context.lineTo(pointA.x, pointA.y);
    }

    context.stroke();
    context.restore();

    context.strokeStyle = "rgba(0, 0, 0, 0.18)";
    context.lineWidth = 1;
    context.strokeRect(originX, originY, viewSize, viewSize);

    for (const appliedDecal of activeAppliedDecals) {
      const image = decalImages[appliedDecal.textureUrl];
      if (!image) {
        continue;
      }

      const center = uvToScreen(appliedDecal.uv, canvasSize, viewport);
      const baseWidth = Math.max(MIN_SCREEN_SIZE, viewSize * appliedDecal.scale);
      const aspect =
        (image.naturalWidth || image.width || 1) /
        Math.max(1, image.naturalHeight || image.height || 1);
      const baseHeight = Math.max(MIN_SCREEN_SIZE, baseWidth / Math.max(0.1, aspect));
      const width = Math.max(MIN_SCREEN_SIZE, baseWidth * Math.max(MIN_SCALE_AXIS, appliedDecal.scaleX));
      const height = Math.max(MIN_SCREEN_SIZE, baseHeight * Math.max(MIN_SCALE_AXIS, appliedDecal.scaleY));

      drawDecal({
        context,
        image,
        center,
        width,
        height,
        rotationDeg: appliedDecal.rotationDeg,
      });
    }

    if (draftImage && draftScreenState) {
      drawDecal({
        context,
        image: draftImage,
        center: draftScreenState.center,
        width: draftScreenState.width,
        height: draftScreenState.height,
        rotationDeg,
        strokeStyle: "rgba(0, 217, 232, 0.92)",
        drawHandles: true,
      });
    }
  }, [
    activeAppliedDecals,
    canvasSize,
    decalImages,
    draftImage,
    draftScreenState,
    loadedMesh,
    rotationDeg,
    viewport,
  ]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);

    if (event.button === 1 || event.button === 2 || event.altKey) {
      interactionRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
      };
      setIsPanning(true);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const nextUv = screenToUv(pointer.x, pointer.y, canvasSize, viewport);

    if (draftImage && draftScreenState) {
      for (const handle of draftScreenState.handlePositions) {
        const distance = Math.hypot(pointer.x - handle.point.x, pointer.y - handle.point.y);
        if (distance <= HANDLE_HIT_RADIUS) {
          pushUndoSnapshot();
          interactionRef.current = {
            mode: "resize",
            pointerId: event.pointerId,
            handle: handle.handle,
            startCenter: draftScreenState.center,
            startWidth: draftScreenState.width,
            startHeight: draftScreenState.height,
            baseWidth: draftScreenState.baseWidth,
            baseHeight: draftScreenState.baseHeight,
            rotationRad: draftScreenState.rotationRad,
          };
          return;
        }
      }

      const localPointer = toLocalPoint(pointer, draftScreenState.center, draftScreenState.rotationRad);
      if (isInsideRect(localPointer, draftScreenState.width, draftScreenState.height)) {
        pushUndoSnapshot();
        interactionRef.current = {
          mode: "move",
          pointerId: event.pointerId,
          offsetU: draftUv[0] - nextUv.u,
          offsetV: draftUv[1] - nextUv.v,
        };
        return;
      }
    }

    pushUndoSnapshot();
    onDraftUvChange([clamp01(nextUv.u), clamp01(nextUv.v)]);
    interactionRef.current = {
      mode: "move",
      pointerId: event.pointerId,
      offsetU: 0,
      offsetV: 0,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (!interaction || !canvas || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (interaction.mode === "pan") {
      setViewport((current) => ({
        ...current,
        panX: interaction.startPanX + (event.clientX - interaction.startX),
        panY: interaction.startPanY + (event.clientY - interaction.startY),
      }));
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    if (interaction.mode === "move") {
      const uv = screenToUv(pointer.x, pointer.y, canvasSize, viewport);
      onDraftUvChange([
        clamp01(uv.u + interaction.offsetU),
        clamp01(uv.v + interaction.offsetV),
      ]);
      return;
    }

    const localPointer = toLocalPoint(pointer, interaction.startCenter, interaction.rotationRad);
    const minWidth = Math.max(MIN_SCREEN_SIZE, interaction.baseWidth * MIN_SCALE_AXIS);
    const minHeight = Math.max(MIN_SCREEN_SIZE, interaction.baseHeight * MIN_SCALE_AXIS);
    let left = -interaction.startWidth * 0.5;
    let right = interaction.startWidth * 0.5;
    let top = -interaction.startHeight * 0.5;
    let bottom = interaction.startHeight * 0.5;

    if (interaction.handle.includes("e")) {
      right = Math.max(left + minWidth, localPointer.x);
    }
    if (interaction.handle.includes("w")) {
      left = Math.min(right - minWidth, localPointer.x);
    }
    if (interaction.handle.includes("s")) {
      bottom = Math.max(top + minHeight, localPointer.y);
    }
    if (interaction.handle.includes("n")) {
      top = Math.min(bottom - minHeight, localPointer.y);
    }

    const nextWidth = Math.max(minWidth, right - left);
    const nextHeight = Math.max(minHeight, bottom - top);
    const nextCenterLocal = {
      x: (left + right) * 0.5,
      y: (top + bottom) * 0.5,
    };
    const nextCenterScreen = toScreenPoint(nextCenterLocal, interaction.startCenter, interaction.rotationRad);
    const nextUv = screenToUv(nextCenterScreen.x, nextCenterScreen.y, canvasSize, viewport);

    onDraftUvChange([clamp01(nextUv.u), clamp01(nextUv.v)]);
    onScaleXChange(clamp(nextWidth / Math.max(1, interaction.baseWidth), MIN_SCALE_AXIS, MAX_SCALE_AXIS));
    onScaleYChange(clamp(nextHeight / Math.max(1, interaction.baseHeight), MIN_SCALE_AXIS, MAX_SCALE_AXIS));
  };

  const finishCanvasInteraction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    interactionRef.current = null;
    setIsPanning(false);
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport((current) =>
      getZoomedViewport({
        viewport: current,
        size: canvasSize,
        pointerX,
        pointerY,
        zoomFactor,
      })
    );
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: panelSize.width,
      startHeight: panelSize.height,
    };
    setIsResizing(true);
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    setPanelSize(
      clampPanelSize({
        width: resizeState.startWidth + (event.clientX - resizeState.startX),
        height: resizeState.startHeight + (event.clientY - resizeState.startY),
      })
    );
  };

  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeStateRef.current = null;
    setIsResizing(false);
  };

  const handleUndo = () => {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) {
      return;
    }

    setUndoDepth(undoStackRef.current.length);
    applySnapshot(snapshot);
  };

  const hasCanvas = Boolean(activeSlot && modelUrl && loadedMesh);
  const slotButtons = useMemo(() => slotOptions, [slotOptions]);

  return (
    <div
      className={`uv-editor${isResizing ? " uv-editor--resizing" : ""}`}
      style={{ width: `${panelSize.width}px`, height: `${panelSize.height}px` }}
    >
      <div className="uv-editor__head">
        <div className="uv-editor__title">{copy.uvEditorTitle}</div>
        <div className="uv-editor__hint">{copy.uvEditorHint}</div>
      </div>

      {slotButtons.length > 1 ? (
        <div className="uv-editor__slots">
          <div className="uv-editor__label">{copy.uvTarget}</div>
          <div className="uv-editor__slot-buttons">
            {slotButtons.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={`uv-editor__slot-btn${activeSlot === slot.id ? " uv-editor__slot-btn--active" : ""}`}
                onClick={() => onSelectSlot(slot.id)}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="uv-editor__actions">
        <button
          type="button"
          className="texture-modal-btn uv-editor__action-btn uv-editor__action-btn--symbol"
          onClick={handleUndo}
          disabled={!undoDepth}
          aria-label={copy.uvUndoLabel}
          title={copy.uvUndoLabel}
        >
          &larr;
        </button>
        <button
          type="button"
          className="texture-modal-btn uv-editor__action-btn"
          onClick={onApply}
          disabled={!decalTextureUrl || !hasCanvas || !activeSlot}
        >
          {copy.uvApply}
        </button>
        <button
          type="button"
          className="texture-modal-btn uv-editor__action-btn"
          onClick={() => {
            pushUndoSnapshot();
            setViewport(DEFAULT_VIEWPORT);
            onReset();
          }}
          disabled={!hasCanvas}
        >
          {copy.uvReset}
        </button>
        <button
          type="button"
          className="texture-modal-btn texture-modal-btn--danger uv-editor__action-btn"
          onClick={onClearApplied}
          disabled={!hasApplied}
        >
          {copy.uvClearApplied}
        </button>
      </div>

      <div ref={canvasWrapRef} className="uv-editor__canvas-wrap">
        {hasCanvas ? (
          <canvas
            ref={canvasRef}
            className={`uv-editor__canvas${isPanning ? " uv-editor__canvas--panning" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishCanvasInteraction}
            onPointerCancel={finishCanvasInteraction}
            onPointerLeave={(event) => {
              if (!canvasRef.current?.hasPointerCapture(event.pointerId)) {
                finishCanvasInteraction(event);
              }
            }}
            onWheel={handleWheel}
            onContextMenu={(event) => event.preventDefault()}
          />
        ) : (
          <div className="uv-editor__empty">{copy.uvEmpty}</div>
        )}
      </div>

      <div
        className="uv-editor__resize-handle"
        aria-hidden="true"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
      />
    </div>
  );
}
