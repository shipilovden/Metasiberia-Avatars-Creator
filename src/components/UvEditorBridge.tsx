import { UvDecalEditor, type UvDecalEditorProps } from "./UvDecalEditor";
import { ExtractedUvEditorPort } from "./uv-editor-port/ExtractedUvEditorPort";
import type { UvPortToolbarControls } from "./uv-editor-port/types";

export const USE_EXTRACTED_UV_EDITOR_PORT =
  import.meta.env.VITE_USE_EXTRACTED_UV_EDITOR !== "0";

export type UvEditorBridgeProps = UvDecalEditorProps & {
  extractedControls?: UvPortToolbarControls;
};

export type { UvDecalEditorProps };

export function UvEditorBridge(props: UvEditorBridgeProps) {
  const { extractedControls: _extractedControls, ...legacyProps } = props;
  return USE_EXTRACTED_UV_EDITOR_PORT ? (
    <ExtractedUvEditorPort {...props} />
  ) : (
    <UvDecalEditor {...legacyProps} />
  );
}
