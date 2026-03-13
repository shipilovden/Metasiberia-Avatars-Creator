import { useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, Mesh, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Copy = {
  uvEditorTitle: string;
  uvEditorHint: string;
  uvApply: string;
  uvReset: string;
  uvClearApplied: string;
  uvTarget: string;
  uvEmpty: string;
};

type SlotOption = {
  id: string;
  label: string;
};

type LoadedUvMesh = {
  geometry: BufferGeometry;
  baseTextureImage: CanvasImageSource | null;
};

type UvDecalEditorProps = {
  copy: Copy;
  slotOptions: SlotOption[];
  selectedSlot: string | null;
  onSelectSlot: (slot: string) => void;
  modelUrl: string | null;
  decalTextureUrl: string | null;
  draftUv: [number, number];
  scale: number;
  rotationDeg: number;
  onDraftUvChange: (uv: [number, number]) => void;
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

type InteractionState =
  | {
      mode: "decal";
      pointerId: number;
    }
  | {
      mode: "pan";
      pointerId: number;
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
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

const DEFAULT_PANEL_SIZE: PanelSize = { width: 420, height: 650 };
const DEFAULT_VIEWPORT: ViewportState = { zoom: 1, panX: 0, panY: 0 };
const MIN_PANEL_WIDTH = 340;
const MIN_PANEL_HEIGHT = 400;
const MAX_PANEL_WIDTH_FALLBACK = 760;
const MAX_PANEL_HEIGHT_FALLBACK = 840;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 10;

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

const uvToScreen = (
  uv: [number, number],
  size: CanvasSize,
  viewport: ViewportState
) => {
  const metrics = getCanvasMetrics(size, viewport);
  return {
    x: metrics.originX + uv[0] * metrics.viewSize,
    y: metrics.originY + (1 - uv[1]) * metrics.viewSize,
  };
};

const screenToUv = (
  x: number,
  y: number,
  size: CanvasSize,
  viewport: ViewportState
) => {
  const metrics = getCanvasMetrics(size, viewport);
  return {
    u: (x - metrics.originX) / Math.max(1, metrics.viewSize),
    v: 1 - (y - metrics.originY) / Math.max(1, metrics.viewSize),
  };
};

export function UvDecalEditor({
  copy,
  slotOptions,
  selectedSlot,
  onSelectSlot,
  modelUrl,
  decalTextureUrl,
  draftUv,
  scale,
  rotationDeg,
  onDraftUvChange,
  onApply,
  onReset,
  onClearApplied,
  hasApplied,
}: UvDecalEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState>(null);
  const resizeStateRef = useRef<ResizeState>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>(() => clampPanelSize(DEFAULT_PANEL_SIZE));
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [loadedMesh, setLoadedMesh] = useState<LoadedUvMesh | null>(null);
  const [decalImage, setDecalImage] = useState<HTMLImageElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const activeSlot = selectedSlot || slotOptions[0]?.id || null;

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
    if (!decalTextureUrl) {
      setDecalImage(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) {
        setDecalImage(image);
      }
    };
    image.src = decalTextureUrl;

    return () => {
      cancelled = true;
    };
  }, [decalTextureUrl]);

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
        current.width === width && current.height === height
          ? current
          : { width, height }
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
        indexAttribute
          ? indexAttribute.getX(triangleIndex * 3 + vertexOffset)
          : triangleIndex * 3 + vertexOffset;

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

    if (decalImage) {
      const center = uvToScreen(draftUv, canvasSize, viewport);
      const width = Math.max(16, viewSize * scale);
      const aspect =
        (decalImage.naturalWidth || decalImage.width) /
        Math.max(1, decalImage.naturalHeight || decalImage.height);
      const height = width / Math.max(0.1, aspect);

      context.save();
      context.translate(center.x, center.y);
      context.rotate((-rotationDeg * Math.PI) / 180);
      context.drawImage(decalImage, -width / 2, -height / 2, width, height);
      context.strokeStyle = "rgba(0, 217, 232, 0.92)";
      context.lineWidth = 2;
      context.strokeRect(-width / 2, -height / 2, width, height);
      context.restore();
    }
  }, [canvasSize, decalImage, draftUv, loadedMesh, rotationDeg, scale, viewport]);

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
    const uv = screenToUv(event.clientX - rect.left, event.clientY - rect.top, canvasSize, viewport);
    onDraftUvChange([clamp01(uv.u), clamp01(uv.v)]);
    interactionRef.current = {
      mode: "decal",
      pointerId: event.pointerId,
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
    const uv = screenToUv(event.clientX - rect.left, event.clientY - rect.top, canvasSize, viewport);
    onDraftUvChange([clamp01(uv.u), clamp01(uv.v)]);
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
    const uvBeforeZoom = screenToUv(pointerX, pointerY, canvasSize, viewport);
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = clamp(viewport.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
    const nextViewSize = Math.min(canvasSize.width, canvasSize.height) * nextZoom;
    const screenV = 1 - uvBeforeZoom.v;
    const nextOriginX = pointerX - uvBeforeZoom.u * nextViewSize;
    const nextOriginY = pointerY - screenV * nextViewSize;

    setViewport({
      zoom: nextZoom,
      panX: nextOriginX + nextViewSize * 0.5 - canvasSize.width * 0.5,
      panY: nextOriginY + nextViewSize * 0.5 - canvasSize.height * 0.5,
    });
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
