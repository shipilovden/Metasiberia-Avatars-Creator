import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

export type FloatingRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type InteractionState =
  | {
      mode: "drag";
      pointerId: number;
      startX: number;
      startY: number;
      startRect: FloatingRect;
    }
  | {
      mode: "resize";
      pointerId: number;
      edge: ResizeEdge;
      startX: number;
      startY: number;
      startRect: FloatingRect;
    }
  | null;

type FloatingWindowOptions = {
  initialRect: () => FloatingRect;
  minWidth: number;
  minHeight: number;
  viewportMargin?: number;
};

const RESIZE_EDGES: readonly ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getViewport = () => {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900 };
  }

  return { width: window.innerWidth, height: window.innerHeight };
};

const clampRect = (
  rect: FloatingRect,
  minWidth: number,
  minHeight: number,
  viewportMargin: number
) => {
  const viewport = getViewport();
  const maxWidth = Math.max(minWidth, viewport.width - viewportMargin * 2);
  const maxHeight = Math.max(minHeight, viewport.height - viewportMargin * 2);
  const width = clamp(rect.width, minWidth, maxWidth);
  const height = clamp(rect.height, minHeight, maxHeight);
  const left = clamp(rect.left, viewportMargin, viewport.width - viewportMargin - width);
  const top = clamp(rect.top, viewportMargin, viewport.height - viewportMargin - height);

  return { left, top, width, height };
};

const resizeRect = (
  rect: FloatingRect,
  edge: ResizeEdge,
  deltaX: number,
  deltaY: number,
  minWidth: number,
  minHeight: number,
  viewportMargin: number
) => {
  let next = { ...rect };

  if (edge.includes("e")) {
    next.width = rect.width + deltaX;
  }
  if (edge.includes("s")) {
    next.height = rect.height + deltaY;
  }
  if (edge.includes("w")) {
    next.left = rect.left + deltaX;
    next.width = rect.width - deltaX;
  }
  if (edge.includes("n")) {
    next.top = rect.top + deltaY;
    next.height = rect.height - deltaY;
  }

  if (next.width < minWidth) {
    if (edge.includes("w")) {
      next.left -= minWidth - next.width;
    }
    next.width = minWidth;
  }
  if (next.height < minHeight) {
    if (edge.includes("n")) {
      next.top -= minHeight - next.height;
    }
    next.height = minHeight;
  }

  return clampRect(next, minWidth, minHeight, viewportMargin);
};

export const useFloatingWindow = ({
  initialRect,
  minWidth,
  minHeight,
  viewportMargin = 8,
}: FloatingWindowOptions) => {
  const [rect, setRect] = useState<FloatingRect>(() =>
    clampRect(initialRect(), minWidth, minHeight, viewportMargin)
  );
  const [interaction, setInteraction] = useState<InteractionState>(null);

  useEffect(() => {
    const handleWindowResize = () => {
      setRect((current) => clampRect(current, minWidth, minHeight, viewportMargin));
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [minHeight, minWidth, viewportMargin]);

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = interaction.mode === "drag" ? "grabbing" : "nwse-resize";

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== interaction.pointerId) {
        return;
      }

      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;

      if (interaction.mode === "drag") {
        setRect(
          clampRect(
            {
              ...interaction.startRect,
              left: interaction.startRect.left + deltaX,
              top: interaction.startRect.top + deltaY,
            },
            minWidth,
            minHeight,
            viewportMargin
          )
        );
        return;
      }

      setRect(
        resizeRect(
          interaction.startRect,
          interaction.edge,
          deltaX,
          deltaY,
          minWidth,
          minHeight,
          viewportMargin
        )
      );
    };

    const finishInteraction = (event: PointerEvent) => {
      if (event.pointerId !== interaction.pointerId) {
        return;
      }
      setInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishInteraction);
    window.addEventListener("pointercancel", finishInteraction);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishInteraction);
      window.removeEventListener("pointercancel", finishInteraction);
    };
  }, [interaction, minHeight, minWidth, viewportMargin]);

  const frameStyle = useMemo(
    () =>
      ({
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }) satisfies CSSProperties,
    [rect]
  );

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, [role='button']")) {
      return;
    }

    setInteraction({
      mode: "drag",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rect,
    });
  };

  const getHandleProps = (edge: ResizeEdge) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setInteraction({
        mode: "resize",
        edge,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: rect,
      });
    },
  });

  return {
    frameStyle,
    isDragging: interaction?.mode === "drag",
    isResizing: interaction?.mode === "resize",
    headerProps: {
      onPointerDown: beginDrag,
    },
    resizeEdges: RESIZE_EDGES,
    getHandleProps,
  };
};
