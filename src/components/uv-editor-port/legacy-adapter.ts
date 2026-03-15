import type { UvDecalEditorProps } from "../UvDecalEditor";
import type { UvPortLayer, UvPortMeshDocument } from "./types";

const isRussianCopy = (value: string) => /[А-Яа-яЁё]/.test(value);

export const createUvPortDocumentFromLegacyProps = (
  props: UvDecalEditorProps
): UvPortMeshDocument => {
  const {
    copy,
    slotOptions,
    selectedSlot,
    appliedDecals,
    decalTextureUrl,
    draftUv,
    scale,
    scaleX,
    scaleY,
    rotationDeg,
  } = props;
  const activeSlot = selectedSlot || slotOptions[0]?.id || null;
  const isRussian = isRussianCopy(`${copy.uvEditorTitle} ${copy.uvEditorHint}`);

  const baseLayer: UvPortLayer = {
    id: activeSlot ? `base:${activeSlot}` : "base:none",
    kind: "base",
    name: isRussian ? "Базовая карта" : "Base map",
    meshName: activeSlot,
    textureUrl: null,
    uv: null,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    opacity: 1,
    visible: true,
    locked: true,
  };

  const uvLayoutLayer: UvPortLayer = {
    id: activeSlot ? `uv-layout:${activeSlot}` : "uv-layout:none",
    kind: "uv-layout",
    name: isRussian ? "UV раскладка" : "UV layout",
    meshName: activeSlot,
    textureUrl: null,
    uv: null,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    opacity: 1,
    visible: true,
    locked: true,
  };

  const meshLayers = activeSlot
    ? appliedDecals
        .filter((entry) => entry.meshName === activeSlot)
        .map<UvPortLayer>((entry, index) => ({
          id: entry.id,
          kind: "decal",
          name: isRussian ? `Слой ${index + 1}` : `Layer ${index + 1}`,
          meshName: entry.meshName,
          textureUrl: entry.textureUrl,
          uv: entry.uv,
          scale: entry.scale,
          scaleX: entry.scaleX,
          scaleY: entry.scaleY,
          rotationDeg: entry.rotationDeg,
          opacity: 1,
          visible: true,
          locked: false,
        }))
    : [];

  const draftLayer: UvPortLayer | null =
    activeSlot && decalTextureUrl
      ? {
          id: "draft:current",
          kind: "draft",
          name: isRussian ? "Черновик" : "Draft layer",
          meshName: activeSlot,
          textureUrl: decalTextureUrl,
          uv: draftUv,
          scale,
          scaleX,
          scaleY,
          rotationDeg,
          opacity: 1,
          visible: true,
          locked: false,
        }
      : null;

  const layers = [uvLayoutLayer, baseLayer, ...meshLayers, ...(draftLayer ? [draftLayer] : [])];

  return {
    meshName: activeSlot,
    selectedLayerId: draftLayer?.id || meshLayers[meshLayers.length - 1]?.id || baseLayer.id,
    activeTool: "transform",
    paintTarget: "image",
    cropShape: "rect",
    layers,
    plannedFeatures: isRussian
      ? [
          "слои и preview уже подключены",
          "crop / brush / mask переносим поэтапно",
          "экспорт останется на RPM post-process",
        ]
      : [
          "layers and preview are already wired",
          "crop / brush / mask will be ported in stages",
          "export will stay on the RPM post-process",
        ],
  };
};
