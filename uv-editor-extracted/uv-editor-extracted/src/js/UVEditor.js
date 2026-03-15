import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { I18n } from './I18n';
import { ResizableWindow } from './ResizeableWindow';
import { VSCodeContext } from './VSCodeContext';

const UV_TARGET_ID = '__uv-layout__';
const BASE_LAYER_ID = '__base-map__';
const MIN_LAYER_SIZE = 0.025;
const MIN_CROP_SIZE = 0.04;
const MAX_HISTORY = 60;
const HANDLE_SIZE = 8;
const DEFAULT_BRUSH_COLOR = '#ff2d55';
const DEFAULT_BRUSH_SIZE = 24;
const DEFAULT_BRUSH_SOFTNESS = 38;
const TOOL_TRANSFORM = 'transform';
const TOOL_CROP = 'crop';
const TOOL_BRUSH = 'brush';
const TOOL_ERASER = 'eraser';
const TOOL_EYEDROPPER = 'eyedropper';
const PAINT_TARGET_IMAGE = 'image';
const PAINT_TARGET_MASK = 'mask';
const CROP_SHAPE_RECT = 'rect';
const CROP_SHAPE_CIRCLE = 'circle';
const HANDLE_DEFINITIONS = [
  { key: 'nw', kind: 'corner', sx: -1, sy: 1 },
  { key: 'n', kind: 'edge', axis: 'y', sx: 0, sy: 1 },
  { key: 'ne', kind: 'corner', sx: 1, sy: 1 },
  { key: 'e', kind: 'edge', axis: 'x', sx: 1, sy: 0 },
  { key: 'se', kind: 'corner', sx: 1, sy: -1 },
  { key: 's', kind: 'edge', axis: 'y', sx: 0, sy: -1 },
  { key: 'sw', kind: 'corner', sx: -1, sy: -1 },
  { key: 'w', kind: 'edge', axis: 'x', sx: -1, sy: 0 }
];

class UVEditor extends ResizableWindow
{
  constructor(panel, name)
  {
    const container = document.querySelector('.uv-editor');
    const drag_handle = container.querySelector('.uv-editor__header');
    const resize_content = container.querySelector('.resize-content-wrapper');
    const preview_container = document.querySelector('.uv-editor-preview');
    const preview_drag_handle = preview_container.querySelector('.uv-editor-preview__header');
    const preview_resize_content = preview_container.querySelector('.resize-content-wrapper');

    super(container, drag_handle, resize_content);

    this.min_width = 280;
    this.min_height = 250;

    this.name = name;
    this.panel = panel;

    this.$preview_container = preview_container;
    this.$preview_header = preview_drag_handle;
    this.$header_title = container.querySelector('.uv-editor__title');
    this.$status = container.querySelector('.uv-editor__status');
    this.$meta = container.querySelector('.uv-editor__meta');
    this.$hint = container.querySelector('.uv-editor__hint');
    this.$viewport = preview_container.querySelector('.uv-editor__viewport');
    this.$canvas = preview_container.querySelector('.uv-editor__canvas');
    this.$empty = preview_container.querySelector('.uv-editor__empty');
    this.$layers = container.querySelector('.uv-editor__layers');
    this.$layers_empty = container.querySelector('.uv-editor__layers-empty');
    this.$selected_target = container.querySelector('.uv-editor__selected-target');
    this.$opacity_slider = container.querySelector('.uv-editor__opacity-slider');
    this.$opacity_value = container.querySelector('.uv-editor__opacity-value');
    this.$brush_color = container.querySelector('.uv-editor__brush-color');
    this.$brush_size_slider = container.querySelector('.uv-editor__brush-size-slider');
    this.$brush_size_value = container.querySelector('.uv-editor__brush-size-value');
    this.$brush_softness_slider = container.querySelector('.uv-editor__brush-softness-slider');
    this.$brush_softness_value = container.querySelector('.uv-editor__brush-softness-value');
    this.$tool_buttons = Array.from(container.querySelectorAll('.uv-editor__tool'));
    this.$paint_target_buttons = Array.from(container.querySelectorAll('[data-paint-target]'));
    this.$crop_shape_buttons = Array.from(container.querySelectorAll('[data-crop-shape]'));
    this.$image_input = container.querySelector('.uv-editor__image-input');

    this.ctx = this.$canvas.getContext('2d');
    this.preview_window = new ResizableWindow(
      preview_container,
      preview_drag_handle,
      preview_resize_content
    );
    this.preview_window.min_width = 280;
    this.preview_window.min_height = 260;

    this.$close_button = container.querySelector('.uv-editor__close');
    this.$close_button.addEventListener('click', this.handle_close_button_click.bind(this));

    this.uv_meshes = [];
    this.current_mesh = null;
    this.current_uv_bounds = null;
    this.last_non_uv_selection_name = '';
    this.ui_state = 'select-mesh';
    this.view_state = {
      zoom: 1,
      centerU: null,
      centerV: null
    };

    this.max_preview_triangles = 12000;
    this.original_uvs = new WeakMap();
    this.mesh_states = new WeakMap();
    this.material_overrides = new WeakMap();
    this.drag_state = null;
    this.is_adjusting_opacity = false;
    this.document_uri = '';
    this.pending_document_state = null;
    this.is_restoring_document_state = false;
    this.has_restored_document_state = false;
    this.crop_preview = null;

    for (const button of this.$tool_buttons)
    {
      button.addEventListener('click', this.handle_tool_click.bind(this, button));
    }

    this.$image_input.addEventListener('change', this.handle_image_input_change.bind(this));
    this.$opacity_slider.addEventListener('input', this.handle_opacity_slider_input.bind(this));
    this.$opacity_slider.addEventListener('change', () =>
    {
      this.is_adjusting_opacity = false;
      this.queue_persist_document_state();
    });
    this.$brush_color.addEventListener('input', this.handle_brush_color_input.bind(this));
    this.$brush_size_slider.addEventListener('input', this.handle_brush_size_input.bind(this));
    this.$brush_softness_slider.addEventListener('input', this.handle_brush_softness_input.bind(this));

    this.$canvas.addEventListener('pointerdown', this.handle_canvas_pointer_down.bind(this));
    this.$canvas.addEventListener('wheel', this.handle_canvas_wheel.bind(this), {
      passive: false
    });
    this.$canvas.addEventListener('contextmenu', event =>
    {
      event.preventDefault();
    });

    window.addEventListener('pointermove', this.handle_canvas_pointer_move.bind(this));
    window.addEventListener('pointerup', this.handle_canvas_pointer_up.bind(this));
    window.addEventListener('vscode:document-context', this.handle_document_context.bind(this));
  }

  init(scene_controller)
  {
    this.scene_controller = scene_controller;

    if (typeof ResizeObserver !== 'undefined')
    {
      this.resize_observer = new ResizeObserver(() =>
      {
        this.update_responsive_state();
        this.render();
      });

      this.resize_observer.observe(this.$container);
      this.resize_observer.observe(this.$preview_container);
      this.resize_observer.observe(this.$viewport);
    }

    window.addEventListener('resize', this.render.bind(this));
    this.update_title();
    this.update_tool_states();
    this.update_layers_empty_state();
    this.update_responsive_state();
    this.handle_document_context({
      detail: VSCodeContext.document_context || null
    });
  }

  show()
  {
    this.$container.classList.remove('hidden');
    this.$preview_container.classList.remove('hidden');
    this.update_responsive_state();
    requestAnimationFrame(() =>
    {
      this.position_preview_window();
      this.render();
    });
  }

  hide()
  {
    this.$container.classList.add('hidden');
    this.$preview_container.classList.add('hidden');
  }

  handle_close_button_click()
  {
    this.hide();
    this.panel.deactivate_button(this.name);
  }

  position_preview_window()
  {
    if (!this.$preview_container || this.preview_window.has_changed)
    {
      return;
    }

    const margin = 12;
    const main_rect = this.$container.getBoundingClientRect();
    const preview_width = this.$preview_container.offsetWidth || 360;
    const preview_height = this.$preview_container.offsetHeight || 360;

    let left = main_rect.right + 18;
    let top = Math.max(margin, main_rect.top);

    if (left + preview_width > window.innerWidth - margin)
    {
      left = Math.max(margin, window.innerWidth - preview_width - margin);
      top = Math.min(
        Math.max(margin, window.innerHeight - preview_height - margin),
        main_rect.bottom + 18
      );
    }

    this.$preview_container.style.left = `${left}px`;
    this.$preview_container.style.top = `${top}px`;
    this.$preview_container.style.right = 'initial';
  }

  update_title()
  {
    this.$header_title.textContent = `${I18n.t('uv.title')} (${this.get_uv_mesh_count()})`;
  }

  get_uv_mesh_count()
  {
    return this.uv_meshes.length;
  }

  extract_uv_meshes(object3d)
  {
    this.uv_meshes = [];
    this.assign_mesh_keys(object3d, 'root');
  }

  assign_mesh_keys(object3d, key)
  {
    object3d.userData.__uvEditorKey = key;

    if (this.mesh_has_uv(object3d))
    {
      this.uv_meshes.push(object3d);
    }

    object3d.children.forEach((child, index) =>
    {
      this.assign_mesh_keys(child, `${key}/${index}:${child.name || child.type}`);
    });
  }

  get_mesh_state_key(mesh)
  {
    return mesh?.userData?.__uvEditorKey || mesh?.name || mesh?.uuid || '';
  }

  find_uv_mesh_by_key(mesh_key)
  {
    return this.uv_meshes.find(mesh => this.get_mesh_state_key(mesh) === mesh_key) || null;
  }

  mesh_has_uv(object3d)
  {
    return Boolean(object3d?.geometry?.attributes?.uv?.count);
  }

  get_triangle_count(geometry)
  {
    if (geometry.index)
    {
      return Math.floor(geometry.index.count / 3);
    }

    return Math.floor((geometry.attributes.position?.count || 0) / 3);
  }

  set_empty_state(message_key)
  {
    this.$empty.textContent = I18n.t(message_key);
    this.$empty.classList.remove('hidden');
  }

  clear_empty_state()
  {
    this.$empty.classList.add('hidden');
  }

  ensure_mesh_state(mesh)
  {
    if (!mesh)
    {
      return null;
    }

    if (!this.mesh_states.has(mesh))
    {
      const composite_canvas = document.createElement('canvas');
      const composite_ctx = composite_canvas.getContext('2d');

      this.mesh_states.set(mesh, {
        nextLayerId: 1,
        selectedTargetId: UV_TARGET_ID,
        activeTool: TOOL_TRANSFORM,
        brushColor: DEFAULT_BRUSH_COLOR,
        brushSize: DEFAULT_BRUSH_SIZE,
        brushSoftness: DEFAULT_BRUSH_SOFTNESS,
        cropShape: CROP_SHAPE_RECT,
        paintTarget: PAINT_TARGET_IMAGE,
        showMaskPreview: false,
        soloLayerId: '',
        snapEnabled: false,
        snapStep: 0.025,
        rotationStep: (15 * Math.PI) / 180,
        layers: [],
        history: {
          past: [],
          future: []
        },
        compositeCanvas: composite_canvas,
        compositeCtx: composite_ctx,
        editableSlot: null,
        editableSlotSignature: '',
        appliedTexture: null,
        applyFrame: 0
      });
    }

    return this.mesh_states.get(mesh);
  }

  get_current_state()
  {
    return this.current_mesh ? this.ensure_mesh_state(this.current_mesh) : null;
  }

  get_current_history()
  {
    return this.get_current_state()?.history || null;
  }

  handle_document_context(event)
  {
    const context = event?.detail || null;

    if (!context)
    {
      return;
    }

    this.document_uri = context.documentUri || this.document_uri || '';
    this.pending_document_state = context.persistedUVState || VSCodeContext.ctx?.getState?.()?.uvEditorState || null;
    this.has_restored_document_state = false;
    void this.restore_pending_document_state();
  }

  async restore_pending_document_state()
  {
    if (this.is_restoring_document_state || this.has_restored_document_state || !this.pending_document_state || this.uv_meshes.length < 1)
    {
      return;
    }

    this.is_restoring_document_state = true;

    try
    {
      const document_state = this.pending_document_state;
      const mesh_entries = Object.entries(document_state.meshes || {});

      for (const [mesh_key, serialized_state] of mesh_entries)
      {
        const mesh = this.find_uv_mesh_by_key(mesh_key);

        if (!mesh)
        {
          continue;
        }

        const state = this.ensure_mesh_state(mesh);
        state.activeTool = serialized_state.activeTool || TOOL_TRANSFORM;
        state.brushColor = serialized_state.brushColor || DEFAULT_BRUSH_COLOR;
        state.brushSize = Number(serialized_state.brushSize) || DEFAULT_BRUSH_SIZE;
        state.brushSoftness = Number.isFinite(Number(serialized_state.brushSoftness))
          ? Math.min(100, Math.max(0, Number(serialized_state.brushSoftness)))
          : DEFAULT_BRUSH_SOFTNESS;
        state.cropShape = serialized_state.cropShape === CROP_SHAPE_CIRCLE
          ? CROP_SHAPE_CIRCLE
          : CROP_SHAPE_RECT;
        state.paintTarget = serialized_state.paintTarget || PAINT_TARGET_IMAGE;
        state.showMaskPreview = Boolean(serialized_state.showMaskPreview);
        state.soloLayerId = serialized_state.soloLayerId || '';
        state.snapEnabled = Boolean(serialized_state.snapEnabled);
        state.selectedTargetId = serialized_state.selectedTargetId || UV_TARGET_ID;
        state.layers = [];

        const base_layer = this.create_base_layer(null);
        const serialized_base = serialized_state.baseLayer || null;

        if (serialized_base?.sourceDataUrl)
        {
          base_layer.image = await this.load_image_from_data_url(serialized_base.sourceDataUrl).catch(() => null);
          base_layer.sourceDataUrl = serialized_base.sourceDataUrl;
        }

        if (serialized_base)
        {
          Object.assign(base_layer, serialized_base);
        }

        state.layers.push(base_layer);

        for (const serialized_layer of serialized_state.layers || [])
        {
          const image = await this.load_image_from_data_url(serialized_layer.sourceDataUrl).catch(() => null);

          if (!image)
          {
            continue;
          }

          const layer = this.create_decal_layer(
            image,
            serialized_layer.name || I18n.t('uv.layers.decal'),
            state,
            serialized_layer.sourceDataUrl || ''
          );

          if (serialized_layer.maskDataUrl)
          {
            layer.maskImage = await this.load_image_from_data_url(serialized_layer.maskDataUrl).catch(() => null);
            layer.maskDataUrl = serialized_layer.maskDataUrl;
          }

          Object.assign(layer, serialized_layer);
          layer.renderCanvas = null;
          layer.renderDirty = true;
          state.layers.push(layer);
        }

        this.ensure_selection_target(state);
        this.normalize_active_tool(state);
      }

      const preferred_mesh = this.find_uv_mesh_by_key(document_state.selectedMeshKey);

      if (preferred_mesh)
      {
        this.has_restored_document_state = true;
        this.set_current_mesh(preferred_mesh);
      }
      else if (!this.current_mesh && this.uv_meshes[0])
      {
        this.has_restored_document_state = true;
        this.set_current_mesh(this.uv_meshes[0]);
      }

      this.has_restored_document_state = true;
      this.pending_document_state = document_state;
      this.update_summary();
      this.build_layer_list();
      this.update_control_panel();
      this.schedule_apply_to_current_mesh();
      this.render();
    }
    finally
    {
      this.is_restoring_document_state = false;
    }
  }

  queue_persist_document_state()
  {
    if (this.is_restoring_document_state)
    {
      return;
    }

    const state = this.serialize_document_state();

    if (!state)
    {
      return;
    }

    this.pending_document_state = state;

    const current_webview_state = VSCodeContext.ctx?.getState?.() || {};

    VSCodeContext.ctx?.setState?.({
      ...current_webview_state,
      uvEditorState: state
    });

    VSCodeContext.ctx?.postMessage?.({
      type: 'persistUVEditorState',
      state
    });
  }

  serialize_document_state()
  {
    if (this.uv_meshes.length < 1)
    {
      return null;
    }

    const meshes = {};

    for (const mesh of this.uv_meshes)
    {
      const state = this.mesh_states.get(mesh);

      if (!state)
      {
        continue;
      }

      const base_layer = this.get_base_layer(state);
        const serialized_layers = state.layers
        .filter(layer => layer.kind === 'decal')
        .map(layer =>
        {
          return {
            centerU: layer.centerU,
            centerV: layer.centerV,
            defaultHeightV: layer.defaultHeightV,
            defaultWidthU: layer.defaultWidthU,
            heightV: layer.heightV,
            id: layer.id,
            kind: layer.kind,
            locked: Boolean(layer.locked),
            maskDataUrl: layer.maskDataUrl || '',
            name: layer.name,
            opacity: layer.opacity ?? 1,
            rotation: layer.rotation,
            sourceDataUrl: layer.sourceDataUrl || '',
            visible: layer.visible !== false,
            widthU: layer.widthU
          };
        });

      meshes[this.get_mesh_state_key(mesh)] = {
        baseLayer: base_layer ? {
          centerU: base_layer.centerU,
          centerV: base_layer.centerV,
          defaultHeightV: base_layer.defaultHeightV,
          defaultWidthU: base_layer.defaultWidthU,
          heightV: base_layer.heightV,
          locked: Boolean(base_layer.locked),
          opacity: base_layer.opacity ?? 1,
          rotation: base_layer.rotation,
          sourceDataUrl: base_layer.sourceDataUrl || '',
          visible: base_layer.visible !== false,
          widthU: base_layer.widthU
        } : null,
        layers: serialized_layers,
        activeTool: state.activeTool || TOOL_TRANSFORM,
        brushColor: state.brushColor || DEFAULT_BRUSH_COLOR,
        brushSize: state.brushSize || DEFAULT_BRUSH_SIZE,
        brushSoftness: state.brushSoftness ?? DEFAULT_BRUSH_SOFTNESS,
        cropShape: state.cropShape === CROP_SHAPE_CIRCLE ? CROP_SHAPE_CIRCLE : CROP_SHAPE_RECT,
        paintTarget: state.paintTarget || PAINT_TARGET_IMAGE,
        showMaskPreview: Boolean(state.showMaskPreview),
        soloLayerId: state.soloLayerId || '',
        selectedTargetId: state.selectedTargetId,
        snapEnabled: Boolean(state.snapEnabled)
      };
    }

    return {
      meshes,
      selectedMeshKey: this.get_mesh_state_key(this.current_mesh)
    };
  }

  get_base_layer(state = this.get_current_state())
  {
    return state?.layers.find(layer => layer.id === BASE_LAYER_ID) || null;
  }

  get_layer_by_id(layer_id, state = this.get_current_state())
  {
    return state?.layers.find(layer => layer.id === layer_id) || null;
  }

  get_active_layer(state = this.get_current_state())
  {
    if (!state || state.selectedTargetId === UV_TARGET_ID)
    {
      return null;
    }

    return this.get_layer_by_id(state.selectedTargetId, state);
  }

  is_paintable_decal(layer = this.get_active_layer())
  {
    return Boolean(layer && layer.kind === 'decal');
  }

  is_paintable_layer(layer = this.get_active_layer())
  {
    return Boolean(layer && (layer.kind === 'decal' || layer.kind === 'base'));
  }

  get_active_tool(state = this.get_current_state())
  {
    return state?.activeTool || TOOL_TRANSFORM;
  }

  get_paint_target(state = this.get_current_state())
  {
    return state?.paintTarget === PAINT_TARGET_MASK ? PAINT_TARGET_MASK : PAINT_TARGET_IMAGE;
  }

  get_crop_shape(state = this.get_current_state())
  {
    return state?.cropShape === CROP_SHAPE_CIRCLE ? CROP_SHAPE_CIRCLE : CROP_SHAPE_RECT;
  }

  get_solo_layer_id(state = this.get_current_state())
  {
    return state?.soloLayerId || '';
  }

  is_solo_active(state = this.get_current_state())
  {
    return Boolean(this.get_solo_layer_id(state));
  }

  get_show_mask_preview(state = this.get_current_state())
  {
    return Boolean(state?.showMaskPreview);
  }

  is_layer_effectively_visible(layer, state = this.get_current_state())
  {
    if (!layer || layer.visible === false)
    {
      return false;
    }

    const solo_layer_id = this.get_solo_layer_id(state);

    if (!solo_layer_id)
    {
      return true;
    }

    return layer.id === solo_layer_id;
  }

  normalize_active_tool(state = this.get_current_state())
  {
    if (!state)
    {
      return TOOL_TRANSFORM;
    }

    const active_layer = this.get_active_layer(state);

    if (state.paintTarget === PAINT_TARGET_MASK && !this.is_paintable_decal(active_layer))
    {
      state.paintTarget = PAINT_TARGET_IMAGE;
    }

    if (state.activeTool === TOOL_CROP && !this.is_paintable_decal(active_layer))
    {
      state.activeTool = TOOL_TRANSFORM;
    }

    if (
      (
        state.activeTool === TOOL_BRUSH ||
        state.activeTool === TOOL_ERASER ||
        state.activeTool === TOOL_EYEDROPPER
      ) &&
      !this.is_paintable_layer(active_layer)
    )
    {
      state.activeTool = TOOL_TRANSFORM;
    }

    if (state.activeTool === TOOL_EYEDROPPER && this.get_paint_target(state) === PAINT_TARGET_MASK)
    {
      state.activeTool = TOOL_BRUSH;
    }

    return state.activeTool || TOOL_TRANSFORM;
  }

  set_active_tool(tool)
  {
    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    const requested_tool = [TOOL_TRANSFORM, TOOL_CROP, TOOL_BRUSH, TOOL_ERASER, TOOL_EYEDROPPER].includes(tool)
      ? tool
      : TOOL_TRANSFORM;

    if (requested_tool === TOOL_CROP && !this.is_paintable_decal(this.get_active_layer(state)))
    {
      state.activeTool = TOOL_TRANSFORM;
    }
    else if (
      requested_tool !== TOOL_TRANSFORM &&
      requested_tool !== TOOL_CROP &&
      !this.is_paintable_layer(this.get_active_layer(state))
    )
    {
      state.activeTool = TOOL_TRANSFORM;
    }
    else if (requested_tool === TOOL_EYEDROPPER && this.get_paint_target(state) === PAINT_TARGET_MASK)
    {
      state.activeTool = TOOL_BRUSH;
    }
    else
    {
      state.activeTool = requested_tool;
    }

    this.crop_preview = null;
    this.drag_state = null;
    this.update_summary();
    this.update_control_panel();
    this.render();
    this.queue_persist_document_state();
  }

  set_paint_target(target)
  {
    const state = this.get_current_state();
    const layer = this.get_active_layer(state);

    if (!state || !this.is_paintable_layer(layer))
    {
      return;
    }

    const next_target = target === PAINT_TARGET_MASK ? PAINT_TARGET_MASK : PAINT_TARGET_IMAGE;

    if (next_target === PAINT_TARGET_MASK && !this.is_paintable_decal(layer))
    {
      state.paintTarget = PAINT_TARGET_IMAGE;
      this.update_control_panel();
      return;
    }

    if (next_target === PAINT_TARGET_MASK && !this.has_layer_mask(layer))
    {
      this.push_history_snapshot();
      this.ensure_layer_mask_canvas(layer);
      this.sync_layer_mask_source(layer);
      this.mark_layer_render_dirty(layer);
      this.schedule_apply_to_current_mesh();
    }

    state.paintTarget = next_target;

    if (next_target === PAINT_TARGET_MASK && this.get_active_tool(state) === TOOL_EYEDROPPER)
    {
      state.activeTool = TOOL_BRUSH;
    }

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.render();
    this.queue_persist_document_state();
  }

  set_crop_shape(shape)
  {
    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    state.cropShape = shape === CROP_SHAPE_CIRCLE ? CROP_SHAPE_CIRCLE : CROP_SHAPE_RECT;
    this.update_summary();
    this.update_control_panel();
    this.render();
    this.queue_persist_document_state();
  }

  toggle_solo_layer(layer_id)
  {
    const state = this.get_current_state();

    if (!state || !this.get_layer_by_id(layer_id, state))
    {
      return;
    }

    state.soloLayerId = state.soloLayerId === layer_id ? '' : layer_id;

    if (state.soloLayerId)
    {
      state.selectedTargetId = layer_id;
    }

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.render();
    this.queue_persist_document_state();
  }

  toggle_show_mask_preview()
  {
    const state = this.get_current_state();
    const layer = this.get_active_layer(state);

    if (!state || !this.is_paintable_decal(layer) || !this.has_layer_mask(layer))
    {
      return;
    }

    state.showMaskPreview = !state.showMaskPreview;
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.render();
    this.queue_persist_document_state();
  }

  invert_active_layer_mask()
  {
    const layer = this.get_active_layer();

    if (!this.is_paintable_decal(layer) || layer.locked)
    {
      return;
    }

    this.push_history_snapshot();
    const mask = this.ensure_layer_mask_canvas(layer);
    const context = mask?.getContext('2d');

    if (!mask || !context)
    {
      return;
    }

    const image_data = context.getImageData(0, 0, mask.width, mask.height);
    const { data } = image_data;

    for (let index = 0; index < data.length; index += 4)
    {
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = 255 - data[index + 3];
    }

    context.putImageData(image_data, 0, 0);
    this.sync_layer_mask_source(layer);
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
  }

  handle_brush_color_input(event)
  {
    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    state.brushColor = event.target.value || DEFAULT_BRUSH_COLOR;
    this.queue_persist_document_state();
  }

  handle_brush_size_input(event)
  {
    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    state.brushSize = Math.min(128, Math.max(1, Number(event.target.value) || DEFAULT_BRUSH_SIZE));
    this.update_control_panel();
    this.queue_persist_document_state();
  }

  handle_brush_softness_input(event)
  {
    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    state.brushSoftness = Math.min(100, Math.max(0, Number(event.target.value) || 0));
    this.update_control_panel();
    this.queue_persist_document_state();
  }

  get_active_target_label(state = this.get_current_state())
  {
    if (!state || state.selectedTargetId === UV_TARGET_ID)
    {
      return I18n.t('uv.layers.uvLayout');
    }

    const layer = this.get_active_layer(state);

    if (!layer)
    {
      return I18n.t('uv.layers.uvLayout');
    }

    if (layer.kind === 'base')
    {
      return I18n.t('uv.layers.baseMap');
    }

    if (
      this.get_active_tool(state) !== TOOL_TRANSFORM &&
      this.get_paint_target(state) === PAINT_TARGET_MASK
    )
    {
      return `${layer.name} / ${I18n.t('uv.layers.mask')}`;
    }

    return layer.name;
  }

  get_decal_layer_count(state = this.get_current_state())
  {
    return state?.layers.filter(layer => layer.kind === 'decal').length || 0;
  }

  has_layer_mask(layer)
  {
    return Boolean(layer?.maskImage || layer?.maskDataUrl);
  }

  mark_layer_render_dirty(layer)
  {
    if (!layer)
    {
      return;
    }

    layer.renderDirty = true;

    if (!this.has_layer_mask(layer))
    {
      layer.renderCanvas = null;
    }
  }

  create_blank_mask_canvas(width, height)
  {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  ensure_layer_mask_canvas(layer)
  {
    if (!layer)
    {
      return null;
    }

    if (layer.maskImage instanceof HTMLCanvasElement)
    {
      return layer.maskImage;
    }

    const width = Math.max(1, layer.naturalWidth || layer.image?.naturalWidth || layer.image?.width || 1);
    const height = Math.max(1, layer.naturalHeight || layer.image?.naturalHeight || layer.image?.height || 1);

    if (!layer.maskImage)
    {
      layer.maskImage = this.create_blank_mask_canvas(width, height);
      return layer.maskImage;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context?.drawImage(layer.maskImage, 0, 0, canvas.width, canvas.height);
    layer.maskImage = canvas;
    return canvas;
  }

  sync_layer_mask_source(layer)
  {
    if (!(layer?.maskImage instanceof HTMLCanvasElement))
    {
      layer.maskDataUrl = '';
      return;
    }

    layer.maskDataUrl = layer.maskImage.toDataURL('image/png');
    this.mark_layer_render_dirty(layer);
  }

  reset_active_layer_mask()
  {
    const layer = this.get_active_layer();

    if (!this.is_paintable_decal(layer) || layer.locked)
    {
      return;
    }

    this.push_history_snapshot();
    const mask = this.ensure_layer_mask_canvas(layer);
    const context = mask?.getContext('2d');

    if (!mask || !context)
    {
      return;
    }

    context.clearRect(0, 0, mask.width, mask.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, mask.width, mask.height);
    this.sync_layer_mask_source(layer);
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
  }

  clone_layer(layer)
  {
    const clone = {
      ...layer,
      renderCanvas: null,
      renderDirty: true
    };

    if (layer?.image instanceof HTMLCanvasElement)
    {
      const canvas = document.createElement('canvas');
      canvas.width = layer.image.width;
      canvas.height = layer.image.height;
      const context = canvas.getContext('2d');
      context?.drawImage(layer.image, 0, 0);
      clone.image = canvas;
    }

    if (layer?.maskImage instanceof HTMLCanvasElement)
    {
      const mask_canvas = document.createElement('canvas');
      mask_canvas.width = layer.maskImage.width;
      mask_canvas.height = layer.maskImage.height;
      const mask_context = mask_canvas.getContext('2d');
      mask_context?.drawImage(layer.maskImage, 0, 0);
      clone.maskImage = mask_canvas;
    }

    return clone;
  }

  clone_layers(layers)
  {
    return layers.map(layer => this.clone_layer(layer));
  }

  capture_original_uvs(mesh)
  {
    const geometry = mesh?.geometry;

    if (!geometry || this.original_uvs.has(geometry))
    {
      return;
    }

    const uv_attribute = geometry.attributes?.uv;

    if (!uv_attribute?.array)
    {
      return;
    }

    this.original_uvs.set(geometry, uv_attribute.array.slice());
  }

  clone_current_uvs()
  {
    return this.current_mesh?.geometry?.attributes?.uv?.array?.slice() || null;
  }

  create_editor_snapshot()
  {
    const state = this.get_current_state();

    if (!state)
    {
      return null;
    }

    return {
      layers: this.clone_layers(state.layers),
      activeTool: state.activeTool,
      brushColor: state.brushColor,
      brushSize: state.brushSize,
      brushSoftness: state.brushSoftness,
      cropShape: state.cropShape,
      paintTarget: state.paintTarget,
      showMaskPreview: state.showMaskPreview,
      soloLayerId: state.soloLayerId,
      selectedTargetId: state.selectedTargetId,
      snapEnabled: state.snapEnabled,
      uv: this.clone_current_uvs(),
      viewState: {
        ...this.view_state
      }
    };
  }

  push_history_snapshot()
  {
    const state = this.get_current_state();
    const snapshot = this.create_editor_snapshot();

    if (!state || !snapshot)
    {
      return;
    }

    state.history.past.push(snapshot);

    if (state.history.past.length > MAX_HISTORY)
    {
      state.history.past.shift();
    }

    state.history.future = [];
    this.update_tool_states();
  }

  restore_editor_snapshot(snapshot)
  {
    if (!snapshot || !this.current_mesh)
    {
      return;
    }

    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    state.layers = this.clone_layers(snapshot.layers);
    state.activeTool = snapshot.activeTool || TOOL_TRANSFORM;
    state.brushColor = snapshot.brushColor || DEFAULT_BRUSH_COLOR;
    state.brushSize = Number(snapshot.brushSize) || DEFAULT_BRUSH_SIZE;
    state.brushSoftness = Number.isFinite(snapshot.brushSoftness)
      ? Math.min(100, Math.max(0, snapshot.brushSoftness))
      : DEFAULT_BRUSH_SOFTNESS;
    state.cropShape = snapshot.cropShape === CROP_SHAPE_CIRCLE
      ? CROP_SHAPE_CIRCLE
      : CROP_SHAPE_RECT;
    state.paintTarget = snapshot.paintTarget === PAINT_TARGET_MASK
      ? PAINT_TARGET_MASK
      : PAINT_TARGET_IMAGE;
    state.showMaskPreview = Boolean(snapshot.showMaskPreview);
    state.soloLayerId = snapshot.soloLayerId || '';
    state.selectedTargetId = snapshot.selectedTargetId || UV_TARGET_ID;
    state.snapEnabled = Boolean(snapshot.snapEnabled);
    this.view_state = {
      ...snapshot.viewState
    };

    const uv_attribute = this.current_mesh.geometry.attributes.uv;

    if (uv_attribute?.array && snapshot.uv)
    {
      uv_attribute.array.set(snapshot.uv);
      uv_attribute.needsUpdate = true;
      this.current_uv_bounds = this.compute_uv_bounds(uv_attribute);
    }

    this.ensure_selection_target(state);
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.update_tool_states();
    this.render();
  }

  undo_current_state()
  {
    const history = this.get_current_history();

    if (!history || history.past.length < 1)
    {
      return;
    }

    const current_snapshot = this.create_editor_snapshot();
    const previous_snapshot = history.past.pop();

    if (current_snapshot)
    {
      history.future.push(current_snapshot);
    }

    this.restore_editor_snapshot(previous_snapshot);
    this.queue_persist_document_state();
    this.update_tool_states();
  }

  redo_current_state()
  {
    const history = this.get_current_history();

    if (!history || history.future.length < 1)
    {
      return;
    }

    const current_snapshot = this.create_editor_snapshot();
    const next_snapshot = history.future.pop();

    if (current_snapshot)
    {
      history.past.push(current_snapshot);
    }

    this.restore_editor_snapshot(next_snapshot);
    this.queue_persist_document_state();
    this.update_tool_states();
  }

  compute_uv_bounds(uv_attribute)
  {
    let min_u = Infinity;
    let max_u = -Infinity;
    let min_v = Infinity;
    let max_v = -Infinity;

    for (let i = 0; i < uv_attribute.count; i++)
    {
      const u = uv_attribute.getX(i);
      const v = uv_attribute.getY(i);

      min_u = Math.min(min_u, u);
      max_u = Math.max(max_u, u);
      min_v = Math.min(min_v, v);
      max_v = Math.max(max_v, v);
    }

    return { minU: min_u, maxU: max_u, minV: min_v, maxV: max_v };
  }

  get_display_bounds()
  {
    if (!this.current_uv_bounds)
    {
      return {
        minU: -0.05,
        maxU: 1.05,
        minV: -0.05,
        maxV: 1.05
      };
    }

    const min_u = Math.min(-0.05, this.current_uv_bounds.minU);
    const max_u = Math.max(1.05, this.current_uv_bounds.maxU);
    const min_v = Math.min(-0.05, this.current_uv_bounds.minV);
    const max_v = Math.max(1.05, this.current_uv_bounds.maxV);

    const span_u = Math.max(1, max_u - min_u);
    const span_v = Math.max(1, max_v - min_v);

    return {
      minU: min_u - span_u * 0.08,
      maxU: max_u + span_u * 0.08,
      minV: min_v - span_v * 0.08,
      maxV: max_v + span_v * 0.08
    };
  }

  set_current_mesh(mesh)
  {
    this.current_mesh = mesh;
    this.current_uv_bounds = mesh ? this.compute_uv_bounds(mesh.geometry.attributes.uv) : null;
    this.reset_view_state();
    this.capture_original_uvs(mesh);
    void this.sync_current_mesh_state();
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.update_tool_states();
    this.queue_persist_document_state();
    this.render();
  }

  async sync_current_mesh_state()
  {
    if (!this.current_mesh)
    {
      return;
    }

    const mesh = this.current_mesh;
    const state = this.ensure_mesh_state(mesh);
    const editable_slot = this.get_editable_texture_slot(mesh);
    const signature = `${editable_slot?.material?.uuid || 'none'}:${editable_slot?.texture?.uuid || 'none'}`;

    state.editableSlot = editable_slot;

    if (!this.get_base_layer(state))
    {
      state.layers.unshift(this.create_base_layer(null));
    }

    if (state.editableSlotSignature === signature && this.get_base_layer(state)?.image)
    {
      return;
    }

    state.editableSlotSignature = signature;

    const base_layer = this.get_base_layer(state);

    if (base_layer?.sourceDataUrl && base_layer.image)
    {
      this.update_summary();
      this.build_layer_list();
      this.update_control_panel();
      this.schedule_apply_to_current_mesh();
      this.render();
      return;
    }

    const drawable = editable_slot?.texture ? await this.get_drawable_texture_source(editable_slot.texture) : null;

    if (mesh !== this.current_mesh)
    {
      return;
    }

    base_layer.image = drawable;
    base_layer.naturalWidth = drawable?.naturalWidth || drawable?.videoWidth || drawable?.width || 1024;
    base_layer.naturalHeight = drawable?.naturalHeight || drawable?.videoHeight || drawable?.height || 1024;
    base_layer.sourceDataUrl = '';

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.render();
  }

  get_editable_texture_slot(mesh)
  {
    if (!mesh?.material)
    {
      return {
        channel: 'map',
        label: I18n.t('uv.checker'),
        material: null,
        texture: null
      };
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const material of materials)
    {
      if (!material)
      {
        continue;
      }

      const override = this.material_overrides.get(material);
      const original_map = override?.originalMap ?? material.map ?? null;

      if (original_map?.isTexture)
      {
        return {
          channel: 'map',
          label: `${material.name || material.type || I18n.t('common.material')}:map`,
          material,
          texture: original_map
        };
      }
    }

    return {
      channel: 'map',
      label: I18n.t('uv.checker'),
      material: materials[0] || null,
      texture: null
    };
  }

  create_base_layer(image)
  {
    return {
      centerU: 0.5,
      centerV: 0.5,
      defaultHeightV: 1,
      defaultWidthU: 1,
      heightV: 1,
      id: BASE_LAYER_ID,
      image,
      kind: 'base',
      name: I18n.t('uv.layers.baseMap'),
      naturalHeight: image?.naturalHeight || image?.videoHeight || image?.height || 1024,
      naturalWidth: image?.naturalWidth || image?.videoWidth || image?.width || 1024,
      opacity: 1,
      rotation: 0,
      sourceDataUrl: '',
      locked: false,
      visible: true,
      widthU: 1
    };
  }

  create_decal_layer(image, name, state, source_data_url = '')
  {
    const aspect = Math.max(0.05, (image?.naturalWidth || image?.width || 1) / Math.max(1, image?.naturalHeight || image?.height || 1));
    let width_u = 0.34;
    let height_v = 0.34;

    if (aspect >= 1)
    {
      height_v = width_u / aspect;
    }
    else
    {
      width_u = height_v * aspect;
    }

    return {
      centerU: 0.5,
      centerV: 0.5,
      defaultHeightV: height_v,
      defaultWidthU: width_u,
      heightV: height_v,
      id: `layer-${state.nextLayerId++}`,
      image,
      kind: 'decal',
      locked: false,
      maskDataUrl: '',
      maskImage: null,
      name,
      naturalHeight: image?.naturalHeight || image?.videoHeight || image?.height || 1,
      naturalWidth: image?.naturalWidth || image?.videoWidth || image?.width || 1,
      opacity: 1,
      rotation: 0,
      renderCanvas: null,
      renderDirty: true,
      sourceDataUrl: source_data_url,
      visible: true,
      widthU: width_u
    };
  }

  ensure_selection_target(state = this.get_current_state())
  {
    if (!state)
    {
      return;
    }

    if (state.selectedTargetId === UV_TARGET_ID)
    {
      return;
    }

    if (!this.get_layer_by_id(state.selectedTargetId, state))
    {
      state.selectedTargetId = UV_TARGET_ID;
    }

    if (state.soloLayerId && !this.get_layer_by_id(state.soloLayerId, state))
    {
      state.soloLayerId = '';
    }

    if (state.showMaskPreview)
    {
      const active_layer = this.get_active_layer(state);

      if (!this.is_paintable_decal(active_layer) || !this.has_layer_mask(active_layer))
      {
        state.showMaskPreview = false;
      }
    }
  }

  set_selected_target(target_id, options = {})
  {
    const {
      rebuildLayers = true,
      render = true
    } = options;
    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    state.selectedTargetId = target_id;
    this.ensure_selection_target(state);
    this.normalize_active_tool(state);
    this.update_summary();
    this.update_control_panel();
    this.update_tool_states();

    if (rebuildLayers)
    {
      this.build_layer_list();
    }

    if (render)
    {
      this.render();
    }

    this.queue_persist_document_state();
  }

  update_contents(object3d)
  {
    this.extract_uv_meshes(object3d);
    this.update_title();

    if (this.uv_meshes.length < 1)
    {
      this.current_mesh = null;
      this.current_uv_bounds = null;
      this.reset_view_state();
      this.drag_state = null;
      this.show_no_uv_model_state();
      this.build_layer_list();
      this.update_control_panel();
      this.update_tool_states();
      this.render();
      return;
    }

    void this.restore_pending_document_state();

    if (!this.current_mesh || !this.uv_meshes.includes(this.current_mesh))
    {
      const preferred_mesh = this.find_uv_mesh_by_key(this.pending_document_state?.selectedMeshKey);

      if (preferred_mesh)
      {
        this.set_current_mesh(preferred_mesh);
        return;
      }

      this.set_current_mesh(this.uv_meshes[0]);
      return;
    }

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.update_tool_states();
    this.render();
  }

  handle_object_click(object3d)
  {
    const uv_target = this.resolve_uv_target(object3d);

    if (uv_target)
    {
      this.set_current_mesh(uv_target);
      return;
    }

    this.current_mesh = null;
    this.current_uv_bounds = null;
    this.reset_view_state();
    this.drag_state = null;
    this.show_selection_without_uv_state(object3d);
    this.build_layer_list();
    this.update_control_panel();
    this.update_tool_states();
    this.render();
  }

  resolve_uv_target(object3d)
  {
    if (this.mesh_has_uv(object3d))
    {
      return object3d;
    }

    if (typeof object3d?.traverse !== 'function')
    {
      return null;
    }

    let resolved = null;

    object3d.traverse(child =>
    {
      if (!resolved && this.mesh_has_uv(child))
      {
        resolved = child;
      }
    });

    return resolved;
  }

  update_summary()
  {
    if (!this.current_mesh || !this.current_uv_bounds)
    {
      this.ui_state = 'select-mesh';
      this.set_empty_state('uv.empty.selectMesh');
      this.$status.textContent = I18n.t('uv.empty.selectMesh');
      this.$status.title = this.$status.textContent;
      this.$meta.textContent = I18n.t('uv.meta.followSelection');
      this.$meta.title = this.$meta.textContent;
      this.$hint.textContent = I18n.t('uv.hint.noSelection');
      this.$hint.title = this.$hint.textContent;
      this.update_layers_empty_state();
      return;
    }

    const state = this.get_current_state();
    const editable_slot = state?.editableSlot || this.get_editable_texture_slot(this.current_mesh);
    const geometry = this.current_mesh.geometry;
    const bounds = this.current_uv_bounds;
    const uv_count = geometry.attributes.uv.count;
    const triangle_count = this.get_triangle_count(geometry);
    const active_target_label = this.get_active_target_label(state);
    const layer_count_label = I18n.t('uv.layers.count', {
      count: this.get_decal_layer_count(state)
    });
    const base_label = editable_slot?.label || I18n.t('uv.checker');
    const active_tool = this.normalize_active_tool(state);

    this.ui_state = 'ready';
    this.clear_empty_state();
    this.$status.textContent = this.current_mesh.name || I18n.t('common.unnamedMesh');
    this.$status.title = this.$status.textContent;
    this.$meta.textContent = I18n.t('uv.summary', {
      layers: layer_count_label,
      maxU: bounds.maxU.toFixed(2),
      maxV: bounds.maxV.toFixed(2),
      minU: bounds.minU.toFixed(2),
      minV: bounds.minV.toFixed(2),
      target: I18n.t('uv.target.editing', {
        target: active_target_label
      }),
      texture: base_label,
      triangleCount: triangle_count,
      uvCount: uv_count
    });
    this.$meta.title = this.$meta.textContent;
    this.$hint.textContent = state?.selectedTargetId === UV_TARGET_ID
      ? I18n.t('uv.hint.ready')
      : (
        active_tool === TOOL_CROP
          ? I18n.t('uv.hint.crop')
          : (
            active_tool === TOOL_BRUSH || active_tool === TOOL_ERASER
              ? I18n.t('uv.hint.brush')
              : (
                active_tool === TOOL_EYEDROPPER
                  ? I18n.t('uv.hint.eyedropper')
                  : I18n.t('uv.hint.layer')
              )
          )
      );

    if (
      state?.selectedTargetId !== UV_TARGET_ID &&
      (active_tool === TOOL_BRUSH || active_tool === TOOL_ERASER) &&
      this.get_paint_target(state) === PAINT_TARGET_MASK
    )
    {
      this.$hint.textContent = I18n.t('uv.hint.mask');
    }

    this.$hint.title = this.$hint.textContent;

    this.update_layers_empty_state();
  }

  show_no_uv_model_state()
  {
    this.ui_state = 'no-uv-model';
    this.set_empty_state('uv.empty.noUvModel');
    this.$status.textContent = I18n.t('uv.status.unavailable');
    this.$status.title = this.$status.textContent;
    this.$meta.textContent = I18n.t('uv.meta.noUvModel');
    this.$meta.title = this.$meta.textContent;
    this.$hint.textContent = I18n.t('uv.hint.noUvModel');
    this.$hint.title = this.$hint.textContent;
    this.update_layers_empty_state();
  }

  show_selection_without_uv_state(object3d)
  {
    this.ui_state = 'selection-no-uv';
    this.last_non_uv_selection_name = object3d?.name || object3d?.type || I18n.t('uv.status.objectWithoutUvs');
    this.set_empty_state('uv.empty.noMeshSelection');
    this.$status.textContent = this.last_non_uv_selection_name;
    this.$status.title = this.$status.textContent;
    this.$meta.textContent = I18n.t('uv.meta.noSelection');
    this.$meta.title = this.$meta.textContent;
    this.$hint.textContent = I18n.t('uv.hint.noSelection');
    this.$hint.title = this.$hint.textContent;
    this.update_layers_empty_state();
  }

  update_tool_states()
  {
    const has_mesh = Boolean(this.current_mesh && this.mesh_has_uv(this.current_mesh));
    const history = has_mesh ? this.get_current_history() : null;
    const can_undo = Boolean(history?.past?.length);
    const can_redo = Boolean(history?.future?.length);

    for (const button of this.$tool_buttons)
    {
      switch (button.dataset.action)
      {
      case 'undo':
        button.disabled = !can_undo;
        break;
      case 'redo':
        button.disabled = !can_redo;
        break;
      case 'upload-images':
      case 'apply-to-model':
      case 'save-model':
      case 'export-png':
      case 'fit-view':
        button.disabled = !has_mesh;
        break;
      default:
        button.disabled = !has_mesh;
        break;
      }
    }

    this.update_control_panel();
  }

  update_layers_empty_state()
  {
    if (!this.current_mesh)
    {
      this.$layers_empty.textContent = I18n.t('uv.empty.selectMesh');
      this.$layers_empty.classList.remove('hidden');
      return;
    }

    this.$layers_empty.textContent = I18n.t('uv.layers.empty');
    this.$layers_empty.classList.toggle('hidden', this.get_decal_layer_count() > 0);
  }

  update_control_panel()
  {
    const state = this.get_current_state();
    const active_layer = this.get_active_layer(state);
    const active_tool = this.normalize_active_tool(state);
    const has_mesh = Boolean(this.current_mesh);
    const can_edit_layer = this.is_paintable_layer(active_layer);
    const can_edit_decal = this.is_paintable_decal(active_layer);
    const paint_target = this.get_paint_target(state);
    const crop_shape = this.get_crop_shape(state);
    const has_mask = this.has_layer_mask(active_layer);

    this.$selected_target.textContent = has_mesh ? this.get_active_target_label(state) : '';
    this.$opacity_slider.disabled = !active_layer;
    this.$opacity_slider.value = `${Math.round((active_layer?.opacity ?? 1) * 100)}`;
    this.$opacity_value.textContent = `${Math.round((active_layer?.opacity ?? 1) * 100)}%`;
    this.$brush_color.disabled = !can_edit_layer || paint_target === PAINT_TARGET_MASK;
    this.$brush_color.value = state?.brushColor || DEFAULT_BRUSH_COLOR;
    this.$brush_size_slider.disabled = !can_edit_layer || ![TOOL_BRUSH, TOOL_ERASER].includes(active_tool);
    this.$brush_size_slider.value = `${state?.brushSize || DEFAULT_BRUSH_SIZE}`;
    this.$brush_size_value.textContent = `${state?.brushSize || DEFAULT_BRUSH_SIZE}px`;
    this.$brush_softness_slider.disabled = !can_edit_layer || ![TOOL_BRUSH, TOOL_ERASER].includes(active_tool);
    this.$brush_softness_slider.value = `${state?.brushSoftness ?? DEFAULT_BRUSH_SOFTNESS}`;
    this.$brush_softness_value.textContent = `${state?.brushSoftness ?? DEFAULT_BRUSH_SOFTNESS}%`;

    for (const button of this.$tool_buttons)
    {
      button.classList.remove('uv-editor__tool--active');

      switch (button.dataset.action)
      {
      case 'rename-layer':
      case 'duplicate-layer':
        button.disabled = !active_layer || active_layer.kind !== 'decal';
        break;
      case 'center-target':
      case 'fit-target':
        button.disabled = !active_layer || Boolean(active_layer?.locked);
        break;
      case 'toggle-lock':
        button.disabled = !active_layer;
        button.classList.toggle('uv-editor__tool--active', button.dataset.action === 'toggle-lock' && Boolean(active_layer?.locked));
        break;
      case 'toggle-show-mask':
        button.disabled = !can_edit_decal || !has_mask;
        button.classList.toggle('uv-editor__tool--active', Boolean(state?.showMaskPreview));
        break;
      case 'invert-mask':
        button.disabled = !can_edit_decal || Boolean(active_layer?.locked) || !has_mask;
        break;
      case 'tool-transform':
        button.disabled = !has_mesh;
        button.classList.toggle('uv-editor__tool--active', active_tool === TOOL_TRANSFORM);
        break;
      case 'tool-crop':
        button.disabled = !can_edit_decal || Boolean(active_layer?.locked);
        button.classList.toggle('uv-editor__tool--active', active_tool === TOOL_CROP);
        break;
      case 'crop-rect':
        button.disabled = !can_edit_decal;
        button.classList.toggle('uv-editor__tool--active', crop_shape === CROP_SHAPE_RECT);
        break;
      case 'crop-circle':
        button.disabled = !can_edit_decal;
        button.classList.toggle('uv-editor__tool--active', crop_shape === CROP_SHAPE_CIRCLE);
        break;
      case 'tool-brush':
        button.disabled = !can_edit_layer || Boolean(active_layer?.locked);
        button.classList.toggle('uv-editor__tool--active', active_tool === TOOL_BRUSH);
        break;
      case 'tool-eraser':
        button.disabled = !can_edit_layer || Boolean(active_layer?.locked);
        button.classList.toggle('uv-editor__tool--active', active_tool === TOOL_ERASER);
        break;
      case 'tool-eyedropper':
        button.disabled = !can_edit_layer || paint_target === PAINT_TARGET_MASK;
        button.classList.toggle('uv-editor__tool--active', active_tool === TOOL_EYEDROPPER);
        break;
      case 'reset-mask':
        button.disabled = !can_edit_decal || Boolean(active_layer?.locked) || !has_mask;
        break;
      case 'toggle-snap':
        button.classList.toggle('uv-editor__tool--active', Boolean(state?.snapEnabled));
        break;
      default:
        break;
      }
    }

    for (const button of this.$paint_target_buttons)
    {
      if (button.dataset.action === 'reset-mask')
      {
        button.disabled = !can_edit_decal || Boolean(active_layer?.locked) || !has_mask;
        continue;
      }

      button.disabled = !can_edit_decal;
      button.classList.toggle('uv-editor__tool--active', button.dataset.paintTarget === paint_target);
    }
  }

  build_layer_list()
  {
    this.$layers.innerHTML = '';

    if (!this.current_mesh)
    {
      this.update_layers_empty_state();
      return;
    }

    const state = this.get_current_state();

    if (!state)
    {
      this.update_layers_empty_state();
      return;
    }

    this.ensure_selection_target(state);

    const uv_row = this.create_target_row({
      isActive: state.selectedTargetId === UV_TARGET_ID,
      meta: I18n.t('uv.hint.memory'),
      name: I18n.t('uv.layers.uvLayout'),
      rowClass: 'uv-editor__layer uv-editor__layer--uv',
      targetId: UV_TARGET_ID
    });

    this.$layers.appendChild(uv_row);

    const layers = [...state.layers].reverse();

    for (const layer of layers)
    {
      this.$layers.appendChild(this.create_layer_row(layer, state));
    }

    this.update_layers_empty_state();
  }

  create_target_row({ targetId, name, meta, isActive, rowClass })
  {
    const row = document.createElement('div');
    row.className = rowClass + (isActive ? ' uv-editor__layer--active' : '');
    row.dataset.targetId = targetId;
    row.addEventListener('click', () =>
    {
      this.set_selected_target(targetId);
    });

    const thumb = document.createElement('div');
    thumb.className = 'uv-editor__layer-thumb uv-editor__layer-thumb--uv';
    thumb.textContent = 'UV';

    const grip = document.createElement('div');
    grip.className = 'uv-editor__layer-grip uv-editor__layer-grip--static';
    grip.textContent = '::';

    const text = document.createElement('div');
    text.className = 'uv-editor__layer-text uv-editor__layer-main';

    const title = document.createElement('div');
    title.className = 'uv-editor__layer-name';
    title.textContent = name;

    const meta_label = document.createElement('div');
    meta_label.className = 'uv-editor__layer-meta';
    meta_label.textContent = meta;

    text.appendChild(title);
    text.appendChild(meta_label);

    const actions = document.createElement('div');
    actions.className = 'uv-editor__layer-actions uv-editor__layer-actions--placeholder';

    row.appendChild(grip);
    row.appendChild(thumb);
    row.appendChild(text);
    row.appendChild(actions);

    return row;
  }

  create_layer_row(layer, state)
  {
    const is_active = state.selectedTargetId === layer.id;
    const row = document.createElement('div');
    row.className = 'uv-editor__layer';
    const is_solo = state.soloLayerId === layer.id;
    const is_mask_preview = is_active && this.get_show_mask_preview(state) && this.has_layer_mask(layer);

    if (is_active)
    {
      row.classList.add('uv-editor__layer--active');
    }

    if (!layer.visible)
    {
      row.classList.add('uv-editor__layer--hidden');
    }

    if (layer.locked)
    {
      row.classList.add('uv-editor__layer--locked');
    }

    if (is_solo)
    {
      row.classList.add('uv-editor__layer--solo');
    }

    if (is_mask_preview)
    {
      row.classList.add('uv-editor__layer--mask-preview');
    }

    row.dataset.layerId = layer.id;
    row.draggable = layer.kind === 'decal';
    row.addEventListener('click', () =>
    {
      this.set_selected_target(layer.id);
    });
    row.addEventListener('dragstart', event =>
    {
      if (layer.kind !== 'decal')
      {
        event.preventDefault();
        return;
      }

      if (!event.dataTransfer)
      {
        event.preventDefault();
        return;
      }

      row.classList.add('uv-editor__layer--dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', layer.id);
    });
    row.addEventListener('dragend', () =>
    {
      this.clear_layer_drop_markers();
      row.classList.remove('uv-editor__layer--dragging');
    });
    row.addEventListener('dragover', event =>
    {
      const drag_types = Array.from(event.dataTransfer?.types || []);

      if (!drag_types.includes('text/plain'))
      {
        return;
      }

      event.preventDefault();
      const place = this.get_layer_drop_position(row, event);
      this.mark_layer_drop_target(row, place);
      event.dataTransfer.dropEffect = 'move';
    });
    row.addEventListener('dragleave', () =>
    {
      row.classList.remove('uv-editor__layer--drop-before', 'uv-editor__layer--drop-after');
    });
    row.addEventListener('drop', event =>
    {
      event.preventDefault();
      const dragged_id = event.dataTransfer.getData('text/plain');
      const place = this.get_layer_drop_position(row, event);
      this.clear_layer_drop_markers();
      this.reorder_layer_by_drop(dragged_id, layer.id, place);
    });

    const grip = document.createElement('div');
    grip.className = 'uv-editor__layer-grip';
    grip.textContent = '::';
    grip.title = I18n.t('uv.layers.dragTitle');

    if (layer.kind !== 'decal')
    {
      grip.classList.add('uv-editor__layer-grip--static');
      grip.title = '';
    }

    const thumb = this.create_layer_thumbnail(layer, state);

    const text = document.createElement('div');
    text.className = 'uv-editor__layer-text uv-editor__layer-main';

    const header = document.createElement('div');
    header.className = 'uv-editor__layer-header';

    const name = document.createElement('div');
    name.className = 'uv-editor__layer-name';
    name.textContent = layer.kind === 'base' ? I18n.t('uv.layers.baseMap') : layer.name;

    const badges = document.createElement('div');
    badges.className = 'uv-editor__layer-badges';
    badges.appendChild(this.create_layer_badge(`${Math.round((layer.opacity ?? 1) * 100)}%`, 'opacity'));

    if (this.has_layer_mask(layer))
    {
      badges.appendChild(this.create_layer_badge(I18n.t('uv.layers.maskShort'), 'mask'));
    }

    if (layer.locked)
    {
      badges.appendChild(this.create_layer_badge(I18n.t('uv.layers.lockedShort'), 'lock'));
    }

    if (is_solo)
    {
      badges.appendChild(this.create_layer_badge(I18n.t('uv.layers.soloShort'), 'solo'));
    }

    header.appendChild(name);
    header.appendChild(badges);

    const meta = document.createElement('div');
    meta.className = 'uv-editor__layer-meta';
    const meta_parts = [
      layer.kind === 'base' ? I18n.t('uv.layers.baseMap') : I18n.t('uv.layers.decal')
    ];

    if (!layer.visible)
    {
      meta_parts.push(I18n.t('uv.layers.hidden'));
    }

    if (is_mask_preview)
    {
      meta_parts.push(I18n.t('uv.tools.showMask'));
    }

    meta.textContent = meta_parts.join(' | ');

    text.appendChild(header);
    text.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'uv-editor__layer-actions';

    const visibility_button = this.create_layer_action_button(
      layer.visible ? 'V' : 'H',
      I18n.t('uv.layers.visibilityTitle'),
      event =>
      {
        event.stopPropagation();
        this.toggle_layer_visibility(layer.id);
      }
    );

    actions.appendChild(visibility_button);

    const solo_button = this.create_layer_action_button(
      'S',
      I18n.t('uv.layers.soloTitle'),
      event =>
      {
        event.stopPropagation();
        this.toggle_solo_layer(layer.id);
      }
    );
    solo_button.classList.toggle('uv-editor__layer-action--active', is_solo);
    actions.appendChild(solo_button);

    if (layer.kind === 'decal')
    {
      const delete_button = this.create_layer_action_button(
        'X',
        I18n.t('uv.layers.deleteTitle'),
        event =>
        {
          event.stopPropagation();
          this.delete_layer(layer.id);
        }
      );

      actions.appendChild(delete_button);
    }

    row.appendChild(grip);
    row.appendChild(thumb);
    row.appendChild(text);
    row.appendChild(actions);

    return row;
  }

  create_layer_badge(label, modifier = '')
  {
    const badge = document.createElement('span');
    badge.className = `uv-editor__layer-badge uv-editor__layer-badge--${modifier}`;
    badge.textContent = label;
    return badge;
  }

  create_layer_thumbnail(layer, state)
  {
    const wrap = document.createElement('div');
    wrap.className = 'uv-editor__layer-thumb';
    const canvas = document.createElement('canvas');
    const width = 38;
    const height = 38;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    this.draw_checker_thumbnail_background(context, width, height);
    const source = this.get_show_mask_preview(state) && state.selectedTargetId === layer.id && this.has_layer_mask(layer)
      ? layer.maskImage
      : this.get_layer_render_source(layer);

    if (source)
    {
      const source_width = source.width || source.naturalWidth || 1;
      const source_height = source.height || source.naturalHeight || 1;
      const fit = Math.min(width / source_width, height / source_height);
      const draw_width = Math.max(1, Math.round(source_width * fit));
      const draw_height = Math.max(1, Math.round(source_height * fit));
      const offset_x = Math.round((width - draw_width) * 0.5);
      const offset_y = Math.round((height - draw_height) * 0.5);
      context.imageSmoothingEnabled = true;
      context.drawImage(source, offset_x, offset_y, draw_width, draw_height);
    }

    wrap.appendChild(canvas);
    return wrap;
  }

  draw_checker_thumbnail_background(context, width, height)
  {
    context.fillStyle = '#1b1b1b';
    context.fillRect(0, 0, width, height);

    const cell = 8;

    for (let y = 0; y < height; y += cell)
    {
      for (let x = 0; x < width; x += cell)
      {
        context.fillStyle = ((x / cell) + (y / cell)) % 2 === 0
          ? 'rgba(255, 255, 255, 0.06)'
          : 'rgba(255, 255, 255, 0.02)';
        context.fillRect(x, y, cell, cell);
      }
    }
  }

  get_layer_drop_position(row, event)
  {
    const rect = row.getBoundingClientRect();
    return event.clientY < rect.top + rect.height * 0.5 ? 'before' : 'after';
  }

  mark_layer_drop_target(row, place)
  {
    this.clear_layer_drop_markers();
    row.classList.add(place === 'before' ? 'uv-editor__layer--drop-before' : 'uv-editor__layer--drop-after');
  }

  clear_layer_drop_markers()
  {
    this.$layers.querySelectorAll('.uv-editor__layer--drop-before, .uv-editor__layer--drop-after').forEach(row =>
    {
      row.classList.remove('uv-editor__layer--drop-before', 'uv-editor__layer--drop-after');
    });
  }

  reorder_layer_by_drop(dragged_id, target_id, place)
  {
    const state = this.get_current_state();
    const dragged = this.get_layer_by_id(dragged_id, state);
    const target = this.get_layer_by_id(target_id, state);

    if (!state || !dragged || !target || dragged.id === target.id || dragged.kind !== 'decal')
    {
      return;
    }

    const display_ids = [...state.layers].reverse().map(layer => layer.id).filter(id => id !== dragged.id && id !== UV_TARGET_ID);
    const target_index = display_ids.indexOf(target.id);

    if (target_index < 0)
    {
      return;
    }

    const insert_index = place === 'before' ? target_index : target_index + 1;
    display_ids.splice(insert_index, 0, dragged.id);

    const normalized_display_ids = display_ids.filter(id => id !== BASE_LAYER_ID);
    normalized_display_ids.push(BASE_LAYER_ID);
    const new_state_ids = normalized_display_ids.reverse();
    const layer_by_id = new Map(state.layers.map(layer => [layer.id, layer]));
    const next_layers = new_state_ids.map(id => layer_by_id.get(id)).filter(Boolean);

    if (next_layers.length !== state.layers.length)
    {
      return;
    }

    this.push_history_snapshot();
    state.layers = next_layers;
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
  }

  create_layer_action_button(label, title, handler)
  {
    const button = document.createElement('button');
    button.className = 'button uv-editor__layer-action';
    button.type = 'button';
    button.title = title;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  toggle_layer_visibility(layer_id)
  {
    const layer = this.get_layer_by_id(layer_id);

    if (!layer)
    {
      return;
    }

    this.push_history_snapshot();
    layer.visible = !layer.visible;

    if (!layer.visible && this.get_solo_layer_id() === layer.id)
    {
      const state = this.get_current_state();

      if (state)
      {
        state.soloLayerId = '';
      }
    }

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
    this.update_tool_states();
  }

  move_layer(layer_id, direction)
  {
    const state = this.get_current_state();
    const index = state?.layers.findIndex(layer => layer.id === layer_id) ?? -1;

    if (!state || index < 1)
    {
      return;
    }

    const next_index = Math.min(state.layers.length - 1, Math.max(1, index + direction));

    if (next_index === index)
    {
      return;
    }

    this.push_history_snapshot();

    const [layer] = state.layers.splice(index, 1);
    state.layers.splice(next_index, 0, layer);

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
  }

  delete_layer(layer_id)
  {
    const state = this.get_current_state();
    const index = state?.layers.findIndex(layer => layer.id === layer_id) ?? -1;

    if (!state || index < 0 || state.layers[index]?.kind !== 'decal')
    {
      return;
    }

    this.push_history_snapshot();
    state.layers.splice(index, 1);

    if (state.selectedTargetId === layer_id)
    {
      state.selectedTargetId = UV_TARGET_ID;
    }

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.update_tool_states();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
  }

  handle_opacity_slider_input(event)
  {
    const layer = this.get_active_layer();

    if (!layer)
    {
      this.$opacity_slider.value = '100';
      this.$opacity_value.textContent = '100%';
      return;
    }

    if (!this.is_adjusting_opacity)
    {
      this.push_history_snapshot();
      this.is_adjusting_opacity = true;
    }

    const next_opacity = Math.min(1, Math.max(0, Number(event.target.value) / 100));

    layer.opacity = next_opacity;
    this.$opacity_value.textContent = `${Math.round(next_opacity * 100)}%`;

    this.schedule_apply_to_current_mesh();
    this.build_layer_list();
    this.render();
  }

  toggle_active_layer_lock()
  {
    const layer = this.get_active_layer();

    if (!layer)
    {
      return;
    }

    this.push_history_snapshot();
    layer.locked = !layer.locked;
    this.build_layer_list();
    this.update_control_panel();
    this.queue_persist_document_state();
    this.render();
  }

  rename_active_layer()
  {
    const layer = this.get_active_layer();

    if (!layer || layer.kind !== 'decal')
    {
      return;
    }

    const next_name = window.prompt(I18n.t('uv.layers.renamePrompt'), layer.name);

    if (!next_name)
    {
      return;
    }

    this.push_history_snapshot();
    layer.name = next_name.trim() || layer.name;
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.queue_persist_document_state();
  }

  duplicate_active_layer()
  {
    const layer = this.get_active_layer();
    const state = this.get_current_state();

    if (!layer || !state || layer.kind !== 'decal')
    {
      return;
    }

    this.push_history_snapshot();

    const duplicate = {
      ...this.clone_layer(layer),
      centerU: layer.centerU + 0.03,
      centerV: layer.centerV - 0.03,
      id: `layer-${state.nextLayerId++}`,
      name: `${layer.name} Copy`
    };

    state.layers.push(duplicate);
    state.selectedTargetId = duplicate.id;
    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
  }

  center_active_target()
  {
    const layer = this.get_active_layer();

    if (!layer || layer.locked)
    {
      return;
    }

    this.push_history_snapshot();
    layer.centerU = 0.5;
    layer.centerV = 0.5;
    this.after_layer_transform_change();
    this.queue_persist_document_state();
  }

  fit_active_target()
  {
    const layer = this.get_active_layer();

    if (!layer || layer.locked)
    {
      return;
    }

    this.push_history_snapshot();
    layer.centerU = 0.5;
    layer.centerV = 0.5;
    layer.rotation = 0;
    layer.widthU = 1;
    layer.heightV = 1;
    layer.defaultWidthU = Math.max(layer.defaultWidthU, layer.widthU);
    layer.defaultHeightV = Math.max(layer.defaultHeightV, layer.heightV);
    this.after_layer_transform_change();
    this.queue_persist_document_state();
  }

  toggle_snap()
  {
    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    state.snapEnabled = !state.snapEnabled;
    this.update_control_panel();
    this.queue_persist_document_state();
    this.render();
  }

  apply_snap(value, step)
  {
    return Math.round(value / step) * step;
  }

  should_snap()
  {
    return Boolean(this.get_current_state()?.snapEnabled);
  }

  arrays_match(first, second)
  {
    if (!first || !second || first.length !== second.length)
    {
      return false;
    }

    for (let i = 0; i < first.length; i++)
    {
      if (first[i] !== second[i])
      {
        return false;
      }
    }

    return true;
  }

  get_canvas_metrics()
  {
    const rect = this.$viewport.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;

    return {
      dpr,
      height,
      rect,
      transform: this.get_uv_transform(width, height),
      width
    };
  }

  update_responsive_state()
  {
    const rect = this.$container.getBoundingClientRect();
    const width = rect.width || this.$container.offsetWidth || 0;

    this.$container.classList.toggle('uv-editor--compact', width > 0 && width <= 720);
    this.$container.classList.toggle('uv-editor--narrow', width > 0 && width <= 560);
    this.$container.classList.toggle('uv-editor--micro', width > 0 && width <= 420);
  }

  handle_tool_click(button)
  {
    switch (button.dataset.action)
    {
    case 'undo':
      this.undo_current_state();
      return;
    case 'redo':
      this.redo_current_state();
      return;
    case 'upload-images':
      this.$image_input.value = '';
      this.$image_input.click();
      return;
    case 'apply-to-model':
      void this.apply_layers_to_mesh(this.current_mesh);
      return;
    case 'save-model':
      void this.save_model_to_extension().catch(error =>
      {
        console.error('Failed to export GLB model', error);
      });
      return;
    case 'export-png':
      void this.export_png_to_extension();
      return;
    case 'toggle-snap':
      this.toggle_snap();
      return;
    case 'fit-view':
      this.reset_view_state();
      this.render();
      return;
    case 'tool-transform':
      this.set_active_tool(TOOL_TRANSFORM);
      return;
    case 'tool-crop':
      this.set_active_tool(TOOL_CROP);
      return;
    case 'crop-rect':
      this.set_crop_shape(CROP_SHAPE_RECT);
      return;
    case 'crop-circle':
      this.set_crop_shape(CROP_SHAPE_CIRCLE);
      return;
    case 'tool-brush':
      this.set_active_tool(TOOL_BRUSH);
      return;
    case 'tool-eraser':
      this.set_active_tool(TOOL_ERASER);
      return;
    case 'tool-eyedropper':
      this.set_active_tool(TOOL_EYEDROPPER);
      return;
    case 'paint-image':
      this.set_paint_target(PAINT_TARGET_IMAGE);
      return;
    case 'paint-mask':
      this.set_paint_target(PAINT_TARGET_MASK);
      return;
    case 'reset-mask':
      this.reset_active_layer_mask();
      return;
    case 'toggle-show-mask':
      this.toggle_show_mask_preview();
      return;
    case 'invert-mask':
      this.invert_active_layer_mask();
      return;
    case 'rename-layer':
      this.rename_active_layer();
      return;
    case 'duplicate-layer':
      this.duplicate_active_layer();
      return;
    case 'toggle-lock':
      this.toggle_active_layer_lock();
      return;
    case 'center-target':
      this.center_active_target();
      return;
    case 'fit-target':
      this.fit_active_target();
      return;
    default:
      break;
    }

    if (!this.current_mesh || !this.mesh_has_uv(this.current_mesh))
    {
      return;
    }

    switch (button.dataset.action)
    {
    case 'move-left':
      this.translate_active_target(-0.025, 0);
      break;
    case 'move-right':
      this.translate_active_target(0.025, 0);
      break;
    case 'move-up':
      this.translate_active_target(0, 0.025);
      break;
    case 'move-down':
      this.translate_active_target(0, -0.025);
      break;
    case 'scale-up':
      this.scale_active_target(1.05);
      break;
    case 'scale-down':
      this.scale_active_target(0.95);
      break;
    case 'rotate-left':
      this.rotate_active_target((-15 * Math.PI) / 180);
      break;
    case 'rotate-right':
      this.rotate_active_target((15 * Math.PI) / 180);
      break;
    case 'reset':
      this.reset_active_target();
      break;
    default:
      break;
    }
  }

  async handle_image_input_change(event)
  {
    const files = Array.from(event.target.files || []);

    if (files.length < 1 || !this.current_mesh)
    {
      return;
    }

    const state = this.get_current_state();

    if (!state)
    {
      return;
    }

    const loaded_layers = [];

    for (const file of files)
    {
      const image_payload = await this.load_image_from_file(file).catch(() => null);

      if (!image_payload)
      {
        continue;
      }

      loaded_layers.push(this.create_decal_layer(
        image_payload.image,
        file.name,
        state,
        image_payload.dataUrl
      ));
    }

    if (loaded_layers.length < 1)
    {
      return;
    }

    this.push_history_snapshot();
    state.layers.push(...loaded_layers);
    state.selectedTargetId = loaded_layers[loaded_layers.length - 1].id;

    this.update_summary();
    this.build_layer_list();
    this.update_control_panel();
    this.update_tool_states();
    this.schedule_apply_to_current_mesh();
    this.queue_persist_document_state();
    this.render();
  }

  async load_image_from_file(file)
  {
    const image_url = URL.createObjectURL(file);
    const image = new Image();
    const data_url = await new Promise((resolve, reject) =>
    {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    try
    {
      await new Promise((resolve, reject) =>
      {
        image.onload = resolve;
        image.onerror = reject;
        image.src = image_url;
      });

      return {
        dataUrl: data_url,
        image
      };
    }
    finally
    {
      URL.revokeObjectURL(image_url);
    }
  }

  async load_image_from_data_url(data_url)
  {
    if (!data_url)
    {
      return null;
    }

    const image = new Image();

    await new Promise((resolve, reject) =>
    {
      image.onload = resolve;
      image.onerror = reject;
      image.src = data_url;
    });

    return image;
  }

  translate_active_target(delta_u, delta_v)
  {
    const layer = this.get_active_layer();

    if (layer)
    {
      if (layer.locked)
      {
        return;
      }

      this.push_history_snapshot();
      const state = this.get_current_state();
      const next_center_u = layer.centerU + delta_u;
      const next_center_v = layer.centerV + delta_v;

      layer.centerU = this.should_snap() ? this.apply_snap(next_center_u, state.snapStep) : next_center_u;
      layer.centerV = this.should_snap() ? this.apply_snap(next_center_v, state.snapStep) : next_center_v;
      this.after_layer_transform_change();
      this.queue_persist_document_state();
      return;
    }

    this.translate_current_uvs(delta_u, delta_v);
  }

  scale_active_target(factor)
  {
    const layer = this.get_active_layer();

    if (layer)
    {
      if (layer.locked)
      {
        return;
      }

      this.push_history_snapshot();
      const state = this.get_current_state();
      const next_width = Math.max(MIN_LAYER_SIZE, layer.widthU * factor);
      const next_height = Math.max(MIN_LAYER_SIZE, layer.heightV * factor);
      layer.widthU = this.should_snap() ? Math.max(MIN_LAYER_SIZE, this.apply_snap(next_width, state.snapStep)) : next_width;
      layer.heightV = this.should_snap() ? Math.max(MIN_LAYER_SIZE, this.apply_snap(next_height, state.snapStep)) : next_height;
      this.after_layer_transform_change();
      this.queue_persist_document_state();
      return;
    }

    this.scale_current_uvs(factor);
  }

  rotate_active_target(radians)
  {
    const layer = this.get_active_layer();

    if (layer)
    {
      if (layer.locked)
      {
        return;
      }

      this.push_history_snapshot();
      const state = this.get_current_state();
      const next_rotation = layer.rotation + radians;
      layer.rotation = this.should_snap() ? this.apply_snap(next_rotation, state.rotationStep) : next_rotation;
      this.after_layer_transform_change();
      this.queue_persist_document_state();
      return;
    }

    this.rotate_current_uvs(radians);
  }

  reset_active_target()
  {
    const layer = this.get_active_layer();

    if (layer)
    {
      if (layer.locked)
      {
        return;
      }

      this.push_history_snapshot();
      layer.centerU = 0.5;
      layer.centerV = 0.5;
      layer.rotation = 0;
      layer.widthU = layer.defaultWidthU;
      layer.heightV = layer.defaultHeightV;
      this.after_layer_transform_change();
      this.queue_persist_document_state();
      return;
    }

    this.reset_current_uvs();
  }

  after_layer_transform_change()
  {
    this.update_summary();
    this.update_control_panel();
    this.schedule_apply_to_current_mesh();
    this.render();
  }

  translate_current_uvs(delta_u, delta_v)
  {
    const uv_attribute = this.current_mesh?.geometry?.attributes?.uv;
    const state = this.get_current_state();

    if (!uv_attribute)
    {
      return;
    }

    this.push_history_snapshot();

    for (let index = 0; index < uv_attribute.count; index++)
    {
      let next_u = uv_attribute.getX(index) + delta_u;
      let next_v = uv_attribute.getY(index) + delta_v;

      if (this.should_snap())
      {
        next_u = this.apply_snap(next_u, state.snapStep);
        next_v = this.apply_snap(next_v, state.snapStep);
      }

      uv_attribute.setXY(
        index,
        next_u,
        next_v
      );
    }

    uv_attribute.needsUpdate = true;
    this.current_uv_bounds = this.compute_uv_bounds(uv_attribute);
    this.update_summary();
    this.queue_persist_document_state();
    this.render();
  }

  get_uv_centroid(uv_attribute)
  {
    let sum_u = 0;
    let sum_v = 0;

    for (let index = 0; index < uv_attribute.count; index++)
    {
      sum_u += uv_attribute.getX(index);
      sum_v += uv_attribute.getY(index);
    }

    return {
      u: sum_u / uv_attribute.count,
      v: sum_v / uv_attribute.count
    };
  }

  scale_current_uvs(factor)
  {
    const uv_attribute = this.current_mesh?.geometry?.attributes?.uv;
    const state = this.get_current_state();

    if (!uv_attribute)
    {
      return;
    }

    this.push_history_snapshot();
    const center = this.get_uv_centroid(uv_attribute);

    for (let index = 0; index < uv_attribute.count; index++)
    {
      const u = uv_attribute.getX(index);
      const v = uv_attribute.getY(index);
      let next_u = center.u + (u - center.u) * factor;
      let next_v = center.v + (v - center.v) * factor;

      if (this.should_snap())
      {
        next_u = this.apply_snap(next_u, state.snapStep);
        next_v = this.apply_snap(next_v, state.snapStep);
      }

      uv_attribute.setXY(
        index,
        next_u,
        next_v
      );
    }

    uv_attribute.needsUpdate = true;
    this.current_uv_bounds = this.compute_uv_bounds(uv_attribute);
    this.update_summary();
    this.queue_persist_document_state();
    this.render();
  }

  rotate_current_uvs(radians)
  {
    const uv_attribute = this.current_mesh?.geometry?.attributes?.uv;
    const state = this.get_current_state();

    if (!uv_attribute)
    {
      return;
    }

    this.push_history_snapshot();
    const center = this.get_uv_centroid(uv_attribute);
    const snapped_radians = this.should_snap() ? this.apply_snap(radians, state.rotationStep) : radians;
    const cos = Math.cos(snapped_radians);
    const sin = Math.sin(snapped_radians);

    for (let index = 0; index < uv_attribute.count; index++)
    {
      const u = uv_attribute.getX(index) - center.u;
      const v = uv_attribute.getY(index) - center.v;

      uv_attribute.setXY(
        index,
        center.u + (u * cos) - (v * sin),
        center.v + (u * sin) + (v * cos)
      );
    }

    uv_attribute.needsUpdate = true;
    this.current_uv_bounds = this.compute_uv_bounds(uv_attribute);
    this.update_summary();
    this.queue_persist_document_state();
    this.render();
  }

  reset_current_uvs()
  {
    const geometry = this.current_mesh?.geometry;
    const uv_attribute = geometry?.attributes?.uv;
    const original = this.original_uvs.get(geometry);

    if (!uv_attribute || !original || this.arrays_match(uv_attribute.array, original))
    {
      return;
    }

    this.push_history_snapshot();
    uv_attribute.array.set(original);
    uv_attribute.needsUpdate = true;
    this.current_uv_bounds = this.compute_uv_bounds(uv_attribute);
    this.update_summary();
    this.queue_persist_document_state();
    this.render();
  }

  get_view_bounds()
  {
    const base_bounds = this.get_display_bounds();
    const base_width = Math.max(0.0001, base_bounds.maxU - base_bounds.minU);
    const base_height = Math.max(0.0001, base_bounds.maxV - base_bounds.minV);
    const zoom = Math.min(24, Math.max(0.35, this.view_state.zoom || 1));
    const center_u = Number.isFinite(this.view_state.centerU)
      ? this.view_state.centerU
      : (base_bounds.minU + base_bounds.maxU) * 0.5;
    const center_v = Number.isFinite(this.view_state.centerV)
      ? this.view_state.centerV
      : (base_bounds.minV + base_bounds.maxV) * 0.5;
    const visible_width = base_width / zoom;
    const visible_height = base_height / zoom;

    return {
      maxU: center_u + visible_width * 0.5,
      maxV: center_v + visible_height * 0.5,
      minU: center_u - visible_width * 0.5,
      minV: center_v - visible_height * 0.5
    };
  }

  get_uv_transform(width, height)
  {
    const bounds = this.get_view_bounds();
    const padding = 20;
    const available_width = Math.max(1, width - padding * 2);
    const available_height = Math.max(1, height - padding * 2);
    const uv_width = Math.max(0.0001, bounds.maxU - bounds.minU);
    const uv_height = Math.max(0.0001, bounds.maxV - bounds.minV);
    const scale = Math.min(available_width / uv_width, available_height / uv_height);
    const draw_width = uv_width * scale;
    const draw_height = uv_height * scale;
    const offset_x = (width - draw_width) / 2 - bounds.minU * scale;
    const offset_y = (height - draw_height) / 2 + bounds.maxV * scale;

    return {
      bounds,
      offsetX: offset_x,
      offsetY: offset_y,
      scale
    };
  }

  uv_to_screen(u, v, transform)
  {
    return {
      x: transform.offsetX + u * transform.scale,
      y: transform.offsetY - v * transform.scale
    };
  }

  screen_to_uv(x, y, transform)
  {
    return {
      u: (x - transform.offsetX) / transform.scale,
      v: (transform.offsetY - y) / transform.scale
    };
  }

  layer_local_to_uv(local_x, local_y, layer)
  {
    const cos = Math.cos(layer.rotation);
    const sin = Math.sin(layer.rotation);

    return {
      u: layer.centerU + local_x * cos - local_y * sin,
      v: layer.centerV + local_x * sin + local_y * cos
    };
  }

  uv_to_layer_local(u, v, layer)
  {
    const dx = u - layer.centerU;
    const dy = v - layer.centerV;
    const cos = Math.cos(layer.rotation);
    const sin = Math.sin(layer.rotation);

    return {
      x: (dx * cos) + (dy * sin),
      y: (-dx * sin) + (dy * cos)
    };
  }

  get_layer_corners(layer)
  {
    return this.get_local_box_corners(layer, this.get_layer_local_bounds(layer));
  }

  get_layer_local_bounds(layer)
  {
    const half_width = layer.widthU * 0.5;
    const half_height = layer.heightV * 0.5;

    return {
      bottom: -half_height,
      left: -half_width,
      right: half_width,
      top: half_height
    };
  }

  get_local_box_corners(layer, bounds)
  {
    return {
      ne: this.layer_local_to_uv(bounds.right, bounds.top, layer),
      nw: this.layer_local_to_uv(bounds.left, bounds.top, layer),
      se: this.layer_local_to_uv(bounds.right, bounds.bottom, layer),
      sw: this.layer_local_to_uv(bounds.left, bounds.bottom, layer)
    };
  }

  get_handle_local_position(bounds, definition)
  {
    switch (definition.key)
    {
    case 'nw':
      return { x: bounds.left, y: bounds.top };
    case 'n':
      return { x: 0, y: bounds.top };
    case 'ne':
      return { x: bounds.right, y: bounds.top };
    case 'e':
      return { x: bounds.right, y: 0 };
    case 'se':
      return { x: bounds.right, y: bounds.bottom };
    case 's':
      return { x: 0, y: bounds.bottom };
    case 'sw':
      return { x: bounds.left, y: bounds.bottom };
    case 'w':
      return { x: bounds.left, y: 0 };
    default:
      return { x: 0, y: 0 };
    }
  }

  get_layer_handle_screen_positions(layer, transform, bounds = this.get_layer_local_bounds(layer))
  {
    const positions = {};

    for (const definition of HANDLE_DEFINITIONS)
    {
      const local = this.get_handle_local_position(bounds, definition);
      const uv = this.layer_local_to_uv(local.x, local.y, layer);
      positions[definition.key] = this.uv_to_screen(uv.u, uv.v, transform);
    }

    return positions;
  }

  is_point_inside_local_bounds(local, bounds)
  {
    return (
      local.x >= bounds.left &&
      local.x <= bounds.right &&
      local.y >= bounds.bottom &&
      local.y <= bounds.top
    );
  }

  is_point_inside_layer(pointer_uv, layer)
  {
    if (!layer)
    {
      return false;
    }

    const local = this.uv_to_layer_local(pointer_uv.u, pointer_uv.v, layer);

    return this.is_point_inside_local_bounds(local, this.get_layer_local_bounds(layer));
  }

  hit_test_handle(pointer_x, pointer_y, layer, transform, bounds = this.get_layer_local_bounds(layer))
  {
    if (!layer)
    {
      return null;
    }

    const handles = this.get_layer_handle_screen_positions(layer, transform, bounds);

    for (const definition of HANDLE_DEFINITIONS)
    {
      const handle = handles[definition.key];
      const distance = Math.hypot(pointer_x - handle.x, pointer_y - handle.y);

      if (distance <= HANDLE_SIZE + 2)
      {
        return definition;
      }
    }

    return null;
  }

  hit_test_active_layer_handle(pointer_x, pointer_y, transform)
  {
    return this.hit_test_handle(pointer_x, pointer_y, this.get_active_layer(), transform);
  }

  ensure_editable_layer_canvas(layer)
  {
    if (!layer?.image)
    {
      return null;
    }

    if (layer.image instanceof HTMLCanvasElement)
    {
      return layer.image;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, layer.naturalWidth || layer.image.naturalWidth || layer.image.width || 1);
    canvas.height = Math.max(1, layer.naturalHeight || layer.image.naturalHeight || layer.image.height || 1);
    const context = canvas.getContext('2d');
    context?.drawImage(layer.image, 0, 0, canvas.width, canvas.height);
    layer.image = canvas;
    layer.naturalWidth = canvas.width;
    layer.naturalHeight = canvas.height;
    this.mark_layer_render_dirty(layer);
    return canvas;
  }

  sync_layer_canvas_source(layer)
  {
    if (!(layer?.image instanceof HTMLCanvasElement))
    {
      return;
    }

    layer.sourceDataUrl = layer.image.toDataURL('image/png');
    layer.naturalWidth = layer.image.width;
    layer.naturalHeight = layer.image.height;
    this.mark_layer_render_dirty(layer);
  }

  get_layer_render_source(layer)
  {
    if (!layer?.image)
    {
      return null;
    }

    if (layer.kind !== 'decal' || !this.has_layer_mask(layer))
    {
      return layer.image;
    }

    const image = this.ensure_editable_layer_canvas(layer);
    const mask = this.ensure_layer_mask_canvas(layer);

    if (!image || !mask)
    {
      return layer.image;
    }

    if (!layer.renderCanvas)
    {
      layer.renderCanvas = document.createElement('canvas');
      layer.renderDirty = true;
    }

    if (layer.renderCanvas.width !== image.width || layer.renderCanvas.height !== image.height)
    {
      layer.renderCanvas.width = image.width;
      layer.renderCanvas.height = image.height;
      layer.renderDirty = true;
    }

    if (layer.renderDirty)
    {
      const render_context = layer.renderCanvas.getContext('2d');
      render_context.clearRect(0, 0, layer.renderCanvas.width, layer.renderCanvas.height);
      render_context.globalCompositeOperation = 'source-over';
      render_context.drawImage(image, 0, 0, layer.renderCanvas.width, layer.renderCanvas.height);
      render_context.globalCompositeOperation = 'destination-in';
      render_context.drawImage(mask, 0, 0, layer.renderCanvas.width, layer.renderCanvas.height);
      render_context.globalCompositeOperation = 'source-over';
      layer.renderDirty = false;
    }

    return layer.renderCanvas;
  }

  get_layer_pixel_point(pointer_uv, layer, canvas = layer?.image)
  {
    if (!layer || !canvas)
    {
      return null;
    }

    const local = this.uv_to_layer_local(pointer_uv.u, pointer_uv.v, layer);
    const bounds = this.get_layer_local_bounds(layer);

    if (!this.is_point_inside_local_bounds(local, bounds))
    {
      return null;
    }

    const normalized_x = (local.x - bounds.left) / Math.max(MIN_LAYER_SIZE, bounds.right - bounds.left);
    const normalized_y = (bounds.top - local.y) / Math.max(MIN_LAYER_SIZE, bounds.top - bounds.bottom);

    return {
      x: Math.max(0, Math.min(canvas.width - 1, normalized_x * canvas.width)),
      y: Math.max(0, Math.min(canvas.height - 1, normalized_y * canvas.height))
    };
  }

  paint_active_layer_at(pointer_uv, previous_point = null)
  {
    const layer = this.get_active_layer();
    const state = this.get_current_state();

    if (!this.is_paintable_layer(layer) || layer.locked)
    {
      return false;
    }

    const paint_target = this.get_paint_target(state);
    const canvas = paint_target === PAINT_TARGET_MASK
      ? this.ensure_layer_mask_canvas(layer)
      : this.ensure_editable_layer_canvas(layer);
    const point = this.get_layer_pixel_point(pointer_uv, layer, canvas);

    if (!canvas || !point)
    {
      return false;
    }

    const context = canvas.getContext('2d');
    const active_tool = this.get_active_tool(state);
    const color = paint_target === PAINT_TARGET_MASK
      ? '#ffffff'
      : (state?.brushColor || DEFAULT_BRUSH_COLOR);
    const size = Math.max(1, state?.brushSize || DEFAULT_BRUSH_SIZE);
    const softness = Math.min(1, Math.max(0, (state?.brushSoftness ?? DEFAULT_BRUSH_SOFTNESS) / 100));
    const is_eraser = active_tool === TOOL_ERASER;
    const distance = previous_point ? Math.hypot(point.x - previous_point.x, point.y - previous_point.y) : 0;
    const step = Math.max(1, size * 0.18);
    const steps = previous_point ? Math.max(1, Math.ceil(distance / step)) : 1;

    context.save();

    for (let index = 0; index < steps; index++)
    {
      const progress = steps === 1 ? 1 : (index / (steps - 1));
      const stamp_x = previous_point ? previous_point.x + (point.x - previous_point.x) * progress : point.x;
      const stamp_y = previous_point ? previous_point.y + (point.y - previous_point.y) * progress : point.y;
      this.paint_brush_stamp(context, stamp_x, stamp_y, {
        color,
        isEraser: is_eraser,
        paintTarget: paint_target,
        radius: size * 0.5,
        softness
      });
    }

    context.restore();

    this.mark_layer_render_dirty(layer);

    return point;
  }

  paint_brush_stamp(context, x, y, settings)
  {
    const {
      radius,
      softness,
      color,
      isEraser,
      paintTarget
    } = settings;
    const clamped_radius = Math.max(0.5, radius);
    const inner_radius = clamped_radius * (1 - softness);
    const gradient = context.createRadialGradient(x, y, inner_radius, x, y, clamped_radius);
    const color_stop = paintTarget === PAINT_TARGET_MASK
      ? (isEraser ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)')
      : this.hex_to_rgba(color, 1);
    const transparent_stop = paintTarget === PAINT_TARGET_MASK
      ? (isEraser ? 'rgba(0, 0, 0, 0)' : 'rgba(255, 255, 255, 0)')
      : this.hex_to_rgba(color, 0);

    gradient.addColorStop(0, color_stop);
    gradient.addColorStop(Math.min(0.98, inner_radius / clamped_radius), color_stop);
    gradient.addColorStop(1, transparent_stop);

    context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, clamped_radius, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';
  }

  hex_to_rgba(hex, alpha)
  {
    const value = (hex || DEFAULT_BRUSH_COLOR).replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map(part => part + part).join('')
      : value.padEnd(6, '0').slice(0, 6);
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  sample_active_layer_color(pointer_uv)
  {
    const layer = this.get_active_layer();

    if (!this.is_paintable_layer(layer))
    {
      return null;
    }

    const canvas = this.ensure_editable_layer_canvas(layer);
    const point = this.get_layer_pixel_point(pointer_uv, layer, canvas);

    if (!canvas || !point)
    {
      return null;
    }

    const context = canvas.getContext('2d');
    const pixel = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;

    return {
      alpha: pixel[3],
      color: `#${[pixel[0], pixel[1], pixel[2]].map(value => value.toString(16).padStart(2, '0')).join('')}`
    };
  }

  create_crop_box_from_layer(layer)
  {
    const bounds = {
      ...this.get_layer_local_bounds(layer)
    };

    if (this.get_crop_shape() !== CROP_SHAPE_CIRCLE)
    {
      return bounds;
    }

    const center_x = (bounds.left + bounds.right) * 0.5;
    const center_y = (bounds.top + bounds.bottom) * 0.5;
    const size = Math.min(bounds.right - bounds.left, bounds.top - bounds.bottom);
    const half = size * 0.5;

    return {
      bottom: center_y - half,
      left: center_x - half,
      right: center_x + half,
      top: center_y + half
    };
  }

  get_crop_box_handle(pointer_x, pointer_y, layer, transform, crop_box)
  {
    return this.hit_test_handle(pointer_x, pointer_y, layer, transform, crop_box);
  }

  find_topmost_layer_at_point(pointer_uv, state = this.get_current_state())
  {
    if (!state)
    {
      return null;
    }

    for (let index = state.layers.length - 1; index >= 1; index--)
    {
      const layer = state.layers[index];

      if (this.is_layer_effectively_visible(layer, state) && this.is_point_inside_layer(pointer_uv, layer))
      {
        return layer;
      }
    }

    if (state.selectedTargetId === BASE_LAYER_ID)
    {
      const base_layer = this.get_base_layer(state);

      if (this.is_layer_effectively_visible(base_layer, state) && this.is_point_inside_layer(pointer_uv, base_layer))
      {
        return base_layer;
      }
    }

    return null;
  }

  handle_canvas_pointer_down(event)
  {
    if (!this.current_mesh)
    {
      return;
    }

    const metrics = this.get_canvas_metrics();
    const pointer_x = event.clientX - metrics.rect.left;
    const pointer_y = event.clientY - metrics.rect.top;
    const pointer_uv = this.screen_to_uv(pointer_x, pointer_y, metrics.transform);
    const is_pan_mode = event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey);
    const state = this.get_current_state();
    const active_tool = this.normalize_active_tool(state);
    let active_layer = this.get_active_layer(state);
    const hit_layer = this.find_topmost_layer_at_point(pointer_uv, state);

    if (is_pan_mode)
    {
      event.preventDefault();
      this.drag_state = {
        hasMoved: false,
        mode: 'pan',
        pointerId: event.pointerId,
        scale: metrics.transform.scale,
        startCenterU: this.view_state.centerU,
        startCenterV: this.view_state.centerV,
        startClientX: event.clientX,
        startClientY: event.clientY
      };

      this.$canvas.setPointerCapture?.(event.pointerId);
      this.$viewport.classList.add('uv-editor__viewport--panning');
      return;
    }

    if (
      hit_layer?.kind === 'decal' &&
      active_tool !== TOOL_TRANSFORM &&
      state.selectedTargetId !== BASE_LAYER_ID &&
      state.selectedTargetId !== hit_layer.id
    )
    {
      this.set_selected_target(hit_layer.id, {
        rebuildLayers: true,
        render: false
      });
      active_layer = this.get_active_layer(state);
    }

    if (active_tool === TOOL_EYEDROPPER && this.is_paintable_layer(active_layer))
    {
      event.preventDefault();
      const sample = this.sample_active_layer_color(pointer_uv);

      if (sample?.alpha > 0)
      {
        state.brushColor = sample.color;
        this.$brush_color.value = sample.color;
        this.update_control_panel();
        this.queue_persist_document_state();
      }

      return;
    }

    if ((active_tool === TOOL_BRUSH || active_tool === TOOL_ERASER) && this.is_paintable_layer(active_layer))
    {
      event.preventDefault();
      const preview_canvas = this.get_paint_target(state) === PAINT_TARGET_MASK
        ? this.ensure_layer_mask_canvas(active_layer)
        : this.ensure_editable_layer_canvas(active_layer);
      const preview_point = this.get_layer_pixel_point(pointer_uv, active_layer, preview_canvas);

      if (preview_point)
      {
        this.push_history_snapshot();
      }

      const initial_point = preview_point ? this.paint_active_layer_at(pointer_uv) : null;

      if (initial_point)
      {
        this.drag_state = {
          hasCommittedHistory: true,
          hasMoved: false,
          lastPaintPoint: initial_point,
          mode: 'brush',
          paintTarget: this.get_paint_target(state),
          pointerId: event.pointerId,
          targetId: active_layer.id
        };

        this.$canvas.setPointerCapture?.(event.pointerId);
        this.$viewport.classList.add('uv-editor__viewport--dragging');
        this.schedule_apply_to_current_mesh();
        this.render();
      }

      return;
    }

    if (active_tool === TOOL_CROP && this.is_paintable_decal(active_layer))
    {
      const crop_box = this.create_crop_box_from_layer(active_layer);
      const crop_handle = this.get_crop_box_handle(pointer_x, pointer_y, active_layer, metrics.transform, crop_box);
      const local_pointer = this.uv_to_layer_local(pointer_uv.u, pointer_uv.v, active_layer);

      if (crop_handle || this.is_point_inside_local_bounds(local_pointer, crop_box))
      {
        event.preventDefault();
        this.drag_state = {
          cropBox: crop_box,
          cropHandle: crop_handle,
          hasCommittedHistory: false,
          hasMoved: false,
          mode: crop_handle ? 'crop-transform' : 'crop-move',
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startCropBox: {
            ...crop_box
          },
          startLayer: this.clone_layer(active_layer),
          startPointerLocal: local_pointer,
          targetId: active_layer.id
        };

        this.$canvas.setPointerCapture?.(event.pointerId);
        this.$viewport.classList.add('uv-editor__viewport--dragging');
        this.render();
        return;
      }
    }

    const handle_hit = this.hit_test_active_layer_handle(pointer_x, pointer_y, metrics.transform);

    if (handle_hit)
    {
      event.preventDefault();

      if (!active_layer || active_layer.locked)
      {
        return;
      }

      const half_width = active_layer.widthU * 0.5;
      const half_height = active_layer.heightV * 0.5;

      this.drag_state = {
        hasCommittedHistory: false,
        hasMoved: false,
        mode: 'layer-transform',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        transformHandle: handle_hit,
        startLayer: this.clone_layer(active_layer),
        startPointerUv: pointer_uv,
        targetId: active_layer.id,
        targetLocalAngle: Math.atan2(handle_hit.sy * half_height, handle_hit.sx * half_width)
      };

      this.$canvas.setPointerCapture?.(event.pointerId);
      this.$viewport.classList.add('uv-editor__viewport--dragging');
      return;
    }

    if (hit_layer)
    {
      event.preventDefault();

      if (state.selectedTargetId !== hit_layer.id)
      {
        this.set_selected_target(hit_layer.id, {
          rebuildLayers: true,
          render: false
        });
      }

      if (hit_layer.locked)
      {
        this.render();
        return;
      }

      this.drag_state = {
        hasCommittedHistory: false,
        hasMoved: false,
        mode: 'layer-move',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLayer: this.clone_layer(hit_layer),
        startPointerUv: pointer_uv,
        targetId: hit_layer.id
      };

      this.$canvas.setPointerCapture?.(event.pointerId);
      this.$viewport.classList.add('uv-editor__viewport--dragging');
      return;
    }

    if (state?.selectedTargetId !== UV_TARGET_ID)
    {
      return;
    }

    event.preventDefault();
    this.drag_state = {
      hasCommittedHistory: false,
      hasMoved: false,
      mode: 'uv-move',
      pointerId: event.pointerId,
      scale: metrics.transform.scale,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startUVs: this.clone_current_uvs()
    };

    this.$canvas.setPointerCapture?.(event.pointerId);
    this.$viewport.classList.add('uv-editor__viewport--dragging');
  }

  handle_canvas_wheel(event)
  {
    event.preventDefault();

    if (!this.current_mesh)
    {
      return;
    }

    const metrics = this.get_canvas_metrics();
    const pointer_x = event.clientX - metrics.rect.left;
    const pointer_y = event.clientY - metrics.rect.top;
    const previous_uv = this.screen_to_uv(pointer_x, pointer_y, metrics.transform);
    const zoom_factor = event.deltaY < 0 ? 1.12 : 0.89;
    const next_zoom = Math.min(24, Math.max(0.35, this.view_state.zoom * zoom_factor));

    if (next_zoom === this.view_state.zoom)
    {
      return;
    }

    this.view_state.zoom = next_zoom;

    const next_transform = this.get_uv_transform(metrics.width, metrics.height);
    const next_uv = this.screen_to_uv(pointer_x, pointer_y, next_transform);

    this.view_state.centerU += previous_uv.u - next_uv.u;
    this.view_state.centerV += previous_uv.v - next_uv.v;

    this.render();
  }

  handle_canvas_pointer_move(event)
  {
    if (!this.drag_state || this.drag_state.pointerId !== event.pointerId || !this.current_mesh)
    {
      return;
    }

    const metrics = this.get_canvas_metrics();
    const pointer_x = event.clientX - metrics.rect.left;
    const pointer_y = event.clientY - metrics.rect.top;
    const pointer_uv = this.screen_to_uv(pointer_x, pointer_y, metrics.transform);
    const delta_x = event.clientX - this.drag_state.startClientX;
    const delta_y = event.clientY - this.drag_state.startClientY;

    if (Math.abs(delta_x) > 0.5 || Math.abs(delta_y) > 0.5)
    {
      this.drag_state.hasMoved = true;
    }

    if (this.drag_state.mode === 'pan')
    {
      this.view_state.centerU = this.drag_state.startCenterU - (delta_x / this.drag_state.scale);
      this.view_state.centerV = this.drag_state.startCenterV + (delta_y / this.drag_state.scale);
      this.render();
      return;
    }

    if (this.drag_state.mode === 'brush')
    {
      const next_point = this.paint_active_layer_at(pointer_uv, this.drag_state.lastPaintPoint);

      if (next_point)
      {
        this.drag_state.lastPaintPoint = next_point;
        this.schedule_apply_to_current_mesh();
        this.render();
      }

      return;
    }

    if (this.drag_state.mode === 'uv-move')
    {
      this.handle_uv_drag_move(delta_x, delta_y);
      return;
    }

    if (!this.drag_state.hasMoved)
    {
      return;
    }

    if (!this.drag_state.hasCommittedHistory)
    {
      this.push_history_snapshot();
      this.drag_state.hasCommittedHistory = true;
    }

    const layer = this.get_layer_by_id(this.drag_state.targetId);

    if (!layer)
    {
      return;
    }

    if (this.drag_state.mode === 'crop-transform' || this.drag_state.mode === 'crop-move')
    {
      const local_pointer = this.uv_to_layer_local(pointer_uv.u, pointer_uv.v, this.drag_state.startLayer);

      if (this.drag_state.mode === 'crop-transform')
      {
        this.drag_state.cropBox = this.apply_crop_handle_drag(this.drag_state.startLayer, this.drag_state.startCropBox, local_pointer, this.drag_state.cropHandle);
      }
      else
      {
        this.drag_state.cropBox = this.apply_crop_move_drag(this.drag_state.startLayer, this.drag_state.startCropBox, local_pointer, this.drag_state.startPointerLocal);
      }

      this.render();
      return;
    }

    if (this.drag_state.mode === 'layer-move')
    {
      const state = this.get_current_state();
      const next_center_u = this.drag_state.startLayer.centerU + (pointer_uv.u - this.drag_state.startPointerUv.u);
      const next_center_v = this.drag_state.startLayer.centerV + (pointer_uv.v - this.drag_state.startPointerUv.v);

      layer.centerU = this.should_snap() ? this.apply_snap(next_center_u, state.snapStep) : next_center_u;
      layer.centerV = this.should_snap() ? this.apply_snap(next_center_v, state.snapStep) : next_center_v;
      this.after_layer_transform_change();
      return;
    }

    if (this.drag_state.mode === 'layer-transform')
    {
      if (this.drag_state.transformHandle?.kind === 'edge')
      {
        this.apply_edge_drag_transform(layer, pointer_uv, this.drag_state);
      }
      else
      {
        this.apply_corner_drag_transform(layer, pointer_uv, this.drag_state);
      }

      this.after_layer_transform_change();
    }
  }

  handle_uv_drag_move(delta_x, delta_y)
  {
    if (!this.drag_state || !this.current_mesh)
    {
      return;
    }

    if (this.drag_state.hasMoved && !this.drag_state.hasCommittedHistory)
    {
      this.push_history_snapshot();
      this.drag_state.hasCommittedHistory = true;
    }

    const delta_u = delta_x / this.drag_state.scale;
    const delta_v = -delta_y / this.drag_state.scale;
    const uv_attribute = this.current_mesh.geometry.attributes.uv;
    const state = this.get_current_state();

    for (let index = 0; index < uv_attribute.count; index++)
    {
      const base_index = index * 2;
      let next_u = this.drag_state.startUVs[base_index] + delta_u;
      let next_v = this.drag_state.startUVs[base_index + 1] + delta_v;

      if (this.should_snap())
      {
        next_u = this.apply_snap(next_u, state.snapStep);
        next_v = this.apply_snap(next_v, state.snapStep);
      }

      uv_attribute.setXY(
        index,
        next_u,
        next_v
      );
    }

    uv_attribute.needsUpdate = true;
    this.current_uv_bounds = this.compute_uv_bounds(uv_attribute);
    this.update_summary();
    this.render();
  }

  apply_corner_drag_transform(layer, pointer_uv, drag_state)
  {
    const center_u = drag_state.startLayer.centerU;
    const center_v = drag_state.startLayer.centerV;
    const vector_angle = Math.atan2(pointer_uv.v - center_v, pointer_uv.u - center_u);
    const rotation = vector_angle - drag_state.targetLocalAngle;
    const dx = pointer_uv.u - center_u;
    const dy = pointer_uv.v - center_v;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const local_x = (dx * cos) + (dy * sin);
    const local_y = (-dx * sin) + (dy * cos);
    const state = this.get_current_state();
    const next_rotation = this.should_snap() ? this.apply_snap(rotation, state.rotationStep) : rotation;
    const next_width = Math.max(MIN_LAYER_SIZE, Math.abs(local_x) * 2);
    const next_height = Math.max(MIN_LAYER_SIZE, Math.abs(local_y) * 2);

    layer.centerU = center_u;
    layer.centerV = center_v;
    layer.rotation = next_rotation;
    layer.widthU = this.should_snap() ? Math.max(MIN_LAYER_SIZE, this.apply_snap(next_width, state.snapStep)) : next_width;
    layer.heightV = this.should_snap() ? Math.max(MIN_LAYER_SIZE, this.apply_snap(next_height, state.snapStep)) : next_height;
  }

  apply_edge_drag_transform(layer, pointer_uv, drag_state)
  {
    const local = this.uv_to_layer_local(pointer_uv.u, pointer_uv.v, drag_state.startLayer);
    const state = this.get_current_state();

    layer.centerU = drag_state.startLayer.centerU;
    layer.centerV = drag_state.startLayer.centerV;
    layer.rotation = drag_state.startLayer.rotation;

    if (drag_state.transformHandle.axis === 'x')
    {
      const next_width = Math.max(MIN_LAYER_SIZE, Math.abs(local.x) * 2);
      layer.widthU = this.should_snap() ? Math.max(MIN_LAYER_SIZE, this.apply_snap(next_width, state.snapStep)) : next_width;
      layer.heightV = drag_state.startLayer.heightV;
      return;
    }

    const next_height = Math.max(MIN_LAYER_SIZE, Math.abs(local.y) * 2);
    layer.widthU = drag_state.startLayer.widthU;
    layer.heightV = this.should_snap() ? Math.max(MIN_LAYER_SIZE, this.apply_snap(next_height, state.snapStep)) : next_height;
  }

  apply_crop_handle_drag(start_layer, start_crop_box, local_pointer, handle)
  {
    const bounds = this.get_layer_local_bounds(start_layer);
    const next_box = {
      ...start_crop_box
    };
    const min_width = Math.max(MIN_LAYER_SIZE, start_layer.widthU * MIN_CROP_SIZE);
    const min_height = Math.max(MIN_LAYER_SIZE, start_layer.heightV * MIN_CROP_SIZE);
    const keys = new Set(handle?.key?.split('') || []);

    if (keys.has('w'))
    {
      next_box.left = Math.max(bounds.left, Math.min(local_pointer.x, next_box.right - min_width));
    }

    if (keys.has('e'))
    {
      next_box.right = Math.min(bounds.right, Math.max(local_pointer.x, next_box.left + min_width));
    }

    if (keys.has('n'))
    {
      next_box.top = Math.min(bounds.top, Math.max(local_pointer.y, next_box.bottom + min_height));
    }

    if (keys.has('s'))
    {
      next_box.bottom = Math.max(bounds.bottom, Math.min(local_pointer.y, next_box.top - min_height));
    }

    if (this.get_crop_shape() === CROP_SHAPE_CIRCLE && handle)
    {
      return this.apply_square_crop_handle_drag({
        bounds,
        handle,
        localPointer: local_pointer,
        minSize: Math.max(min_width, min_height),
        startCropBox: start_crop_box
      });
    }

    return next_box;
  }

  clamp_requested_box_size(requested_size, min_size, max_size)
  {
    if (!Number.isFinite(max_size) || max_size <= 0)
    {
      return 0;
    }

    const minimum = Math.min(min_size, max_size);
    return Math.max(minimum, Math.min(Math.max(requested_size, minimum), max_size));
  }

  apply_square_crop_handle_drag({ startCropBox, localPointer, handle, bounds, minSize })
  {
    if (handle.kind === 'corner')
    {
      const anchor_x = handle.sx > 0 ? startCropBox.left : startCropBox.right;
      const anchor_y = handle.sy > 0 ? startCropBox.bottom : startCropBox.top;
      const requested_size = Math.max(
        Math.abs(localPointer.x - anchor_x),
        Math.abs(localPointer.y - anchor_y)
      );
      const max_size_x = handle.sx > 0 ? bounds.right - anchor_x : anchor_x - bounds.left;
      const max_size_y = handle.sy > 0 ? bounds.top - anchor_y : anchor_y - bounds.bottom;
      const size = this.clamp_requested_box_size(requested_size, minSize, Math.min(max_size_x, max_size_y));

      return {
        bottom: handle.sy > 0 ? anchor_y : anchor_y - size,
        left: handle.sx > 0 ? anchor_x : anchor_x - size,
        right: handle.sx > 0 ? anchor_x + size : anchor_x,
        top: handle.sy > 0 ? anchor_y + size : anchor_y
      };
    }

    if (handle.axis === 'x')
    {
      const anchor_x = handle.sx > 0 ? startCropBox.left : startCropBox.right;
      const center_y = (startCropBox.top + startCropBox.bottom) * 0.5;
      const requested_size = Math.abs(localPointer.x - anchor_x);
      const max_size_x = handle.sx > 0 ? bounds.right - anchor_x : anchor_x - bounds.left;
      const max_half_height = Math.min(bounds.top - center_y, center_y - bounds.bottom);
      const size = this.clamp_requested_box_size(requested_size, minSize, Math.min(max_size_x, max_half_height * 2));
      const half = size * 0.5;

      return {
        bottom: center_y - half,
        left: handle.sx > 0 ? anchor_x : anchor_x - size,
        right: handle.sx > 0 ? anchor_x + size : anchor_x,
        top: center_y + half
      };
    }

    const anchor_y = handle.sy > 0 ? startCropBox.bottom : startCropBox.top;
    const center_x = (startCropBox.left + startCropBox.right) * 0.5;
    const requested_size = Math.abs(localPointer.y - anchor_y);
    const max_size_y = handle.sy > 0 ? bounds.top - anchor_y : anchor_y - bounds.bottom;
    const max_half_width = Math.min(bounds.right - center_x, center_x - bounds.left);
    const size = this.clamp_requested_box_size(requested_size, minSize, Math.min(max_size_y, max_half_width * 2));
    const half = size * 0.5;

    return {
      bottom: handle.sy > 0 ? anchor_y : anchor_y - size,
      left: center_x - half,
      right: center_x + half,
      top: handle.sy > 0 ? anchor_y + size : anchor_y
    };
  }

  apply_crop_move_drag(start_layer, start_crop_box, local_pointer, start_pointer_local)
  {
    const bounds = this.get_layer_local_bounds(start_layer);
    const width = start_crop_box.right - start_crop_box.left;
    const height = start_crop_box.top - start_crop_box.bottom;
    const delta_x = local_pointer.x - start_pointer_local.x;
    const delta_y = local_pointer.y - start_pointer_local.y;

    let left = start_crop_box.left + delta_x;
    let bottom = start_crop_box.bottom + delta_y;

    left = Math.max(bounds.left, Math.min(left, bounds.right - width));
    bottom = Math.max(bounds.bottom, Math.min(bottom, bounds.top - height));

    return {
      bottom,
      left,
      right: left + width,
      top: bottom + height
    };
  }

  apply_crop_box_to_layer(layer, start_layer, crop_box)
  {
    if (!layer || !start_layer?.image || !crop_box)
    {
      return;
    }

    const layer_bounds = this.get_layer_local_bounds(start_layer);
    const source_width = Math.max(1, start_layer.naturalWidth || start_layer.image.width || 1);
    const source_height = Math.max(1, start_layer.naturalHeight || start_layer.image.height || 1);
    const normalized_left = (crop_box.left - layer_bounds.left) / Math.max(MIN_LAYER_SIZE, start_layer.widthU);
    const normalized_top = (layer_bounds.top - crop_box.top) / Math.max(MIN_LAYER_SIZE, start_layer.heightV);
    const normalized_width = (crop_box.right - crop_box.left) / Math.max(MIN_LAYER_SIZE, start_layer.widthU);
    const normalized_height = (crop_box.top - crop_box.bottom) / Math.max(MIN_LAYER_SIZE, start_layer.heightV);
    const crop_x = Math.max(0, Math.min(source_width - 1, Math.round(normalized_left * source_width)));
    const crop_y = Math.max(0, Math.min(source_height - 1, Math.round(normalized_top * source_height)));
    const crop_width = Math.max(1, Math.min(source_width - crop_x, Math.round(normalized_width * source_width)));
    const crop_height = Math.max(1, Math.min(source_height - crop_y, Math.round(normalized_height * source_height)));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const crop_shape = this.get_crop_shape();
    const crop_center = this.layer_local_to_uv(
      (crop_box.left + crop_box.right) * 0.5,
      (crop_box.top + crop_box.bottom) * 0.5,
      start_layer
    );
    let mask_canvas = null;

    canvas.width = crop_width;
    canvas.height = crop_height;
    context?.drawImage(start_layer.image, crop_x, crop_y, crop_width, crop_height, 0, 0, crop_width, crop_height);

    if (start_layer.maskImage)
    {
      mask_canvas = document.createElement('canvas');
      mask_canvas.width = crop_width;
      mask_canvas.height = crop_height;
      const mask_context = mask_canvas.getContext('2d');
      const mask_source = start_layer.maskImage;
      mask_context?.drawImage(mask_source, crop_x, crop_y, crop_width, crop_height, 0, 0, crop_width, crop_height);
    }

    if (crop_shape === CROP_SHAPE_CIRCLE)
    {
      if (!mask_canvas)
      {
        mask_canvas = document.createElement('canvas');
        mask_canvas.width = crop_width;
        mask_canvas.height = crop_height;
        const mask_context = mask_canvas.getContext('2d');
        mask_context.fillStyle = '#ffffff';
        mask_context.fillRect(0, 0, mask_canvas.width, mask_canvas.height);
      }

      const mask_context = mask_canvas.getContext('2d');
      const radius = Math.min(mask_canvas.width, mask_canvas.height) * 0.5;

      mask_context.save();
      mask_context.globalCompositeOperation = 'destination-in';
      mask_context.beginPath();
      mask_context.arc(mask_canvas.width * 0.5, mask_canvas.height * 0.5, radius, 0, Math.PI * 2);
      mask_context.closePath();
      mask_context.fillStyle = '#ffffff';
      mask_context.fill();
      mask_context.restore();
    }

    layer.image = canvas;
    layer.sourceDataUrl = canvas.toDataURL('image/png');
    layer.naturalWidth = crop_width;
    layer.naturalHeight = crop_height;
    layer.maskImage = mask_canvas;
    layer.maskDataUrl = mask_canvas ? mask_canvas.toDataURL('image/png') : '';
    layer.centerU = crop_center.u;
    layer.centerV = crop_center.v;
    layer.rotation = start_layer.rotation;
    layer.widthU = Math.max(MIN_LAYER_SIZE, crop_box.right - crop_box.left);
    layer.heightV = Math.max(MIN_LAYER_SIZE, crop_box.top - crop_box.bottom);
    layer.defaultWidthU = layer.widthU;
    layer.defaultHeightV = layer.heightV;
    this.mark_layer_render_dirty(layer);
  }

  handle_canvas_pointer_up(event)
  {
    if (!this.drag_state || this.drag_state.pointerId !== event.pointerId)
    {
      return;
    }

    const completed_drag = this.drag_state;
    this.$canvas.releasePointerCapture?.(event.pointerId);
    this.$viewport.classList.remove('uv-editor__viewport--dragging');
    this.$viewport.classList.remove('uv-editor__viewport--panning');

    if ((completed_drag.mode === 'crop-transform' || completed_drag.mode === 'crop-move') && completed_drag.hasMoved)
    {
      const layer = this.get_layer_by_id(completed_drag.targetId);

      if (layer)
      {
        this.apply_crop_box_to_layer(layer, completed_drag.startLayer, completed_drag.cropBox);
        this.after_layer_transform_change();
      }
    }

    if (completed_drag.mode === 'brush')
    {
      const layer = this.get_layer_by_id(completed_drag.targetId);

      if (layer)
      {
        if (completed_drag.paintTarget === PAINT_TARGET_MASK)
        {
          this.sync_layer_mask_source(layer);
        }
        else
        {
          this.sync_layer_canvas_source(layer);
        }
        this.schedule_apply_to_current_mesh();
        this.update_summary();
        this.queue_persist_document_state();
        this.render();
      }
    }

    if (completed_drag.hasMoved && completed_drag.mode !== 'pan' && completed_drag.mode !== 'crop-transform' && completed_drag.mode !== 'crop-move')
    {
      this.queue_persist_document_state();
      this.build_layer_list();
      this.update_control_panel();
    }

    if ((completed_drag.mode === 'crop-transform' || completed_drag.mode === 'crop-move') && completed_drag.hasMoved)
    {
      this.queue_persist_document_state();
      this.build_layer_list();
      this.update_control_panel();
    }

    this.drag_state = null;
    this.update_tool_states();
  }

  reset_view_state()
  {
    const bounds = this.get_display_bounds();

    this.view_state.zoom = 1;
    this.view_state.centerU = (bounds.minU + bounds.maxU) * 0.5;
    this.view_state.centerV = (bounds.minV + bounds.maxV) * 0.5;
  }

  render()
  {
    if (!this.ctx)
    {
      return;
    }

    this.update_responsive_state();

    const metrics = this.get_canvas_metrics();
    const pixel_width = Math.max(1, Math.floor(metrics.width * metrics.dpr));
    const pixel_height = Math.max(1, Math.floor(metrics.height * metrics.dpr));

    if (this.$canvas.width !== pixel_width || this.$canvas.height !== pixel_height)
    {
      this.$canvas.width = pixel_width;
      this.$canvas.height = pixel_height;
    }

    this.ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
    this.ctx.clearRect(0, 0, metrics.width, metrics.height);
    this.ctx.fillStyle = '#181818';
    this.ctx.fillRect(0, 0, metrics.width, metrics.height);

    if (!this.current_mesh || !this.mesh_has_uv(this.current_mesh))
    {
      return;
    }

    this.draw_checker(metrics.transform);
    this.draw_layer_stack(metrics.transform);
    this.draw_grid(metrics.transform);
    this.draw_uvs(metrics.transform);
    this.draw_domain_border(metrics.transform);
    this.draw_active_layer_overlay(metrics.transform);
    this.draw_axis_labels(metrics.transform);
  }

  draw_checker(transform)
  {
    const top_left = this.uv_to_screen(0, 1, transform);
    const bottom_right = this.uv_to_screen(1, 0, transform);
    const size = Math.abs(bottom_right.x - top_left.x);
    const cells = 8;
    const cell_size = size / cells;

    for (let row = 0; row < cells; row++)
    {
      for (let column = 0; column < cells; column++)
      {
        this.ctx.fillStyle = (row + column) % 2 === 0 ? '#242424' : '#313131';
        this.ctx.fillRect(
          top_left.x + column * cell_size,
          top_left.y + row * cell_size,
          cell_size,
          cell_size
        );
      }
    }
  }

  draw_layer_stack(transform)
  {
    const state = this.get_current_state();
    const active_layer = this.get_active_layer(state);
    const show_mask_preview = this.get_show_mask_preview(state) && this.is_paintable_decal(active_layer) && this.has_layer_mask(active_layer);

    if (!state)
    {
      return;
    }

    for (const layer of state.layers)
    {
      if (!this.is_layer_effectively_visible(layer, state) || !layer.image)
      {
        continue;
      }

      if (show_mask_preview && active_layer?.id === layer.id)
      {
        this.draw_layer_image(this.ctx, {
          ...layer,
          image: layer.maskImage || layer.image,
          renderCanvas: null
        }, transform, {
          alpha: 0.95
        });
        continue;
      }

      this.draw_layer_image(this.ctx, layer, transform, {
        alpha: (layer.opacity ?? 1) * (layer.kind === 'base' ? 0.96 : 0.92) * (show_mask_preview ? 0.18 : 1)
      });
    }
  }

  draw_layer_image(ctx, layer, transform, options = {})
  {
    const drawable = this.get_layer_render_source(layer);

    if (!drawable)
    {
      return;
    }

    const { alpha = 1 } = options;
    const center = this.uv_to_screen(layer.centerU, layer.centerV, transform);
    const width = layer.widthU * transform.scale;
    const height = layer.heightV * transform.scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(center.x, center.y);
    ctx.rotate(-layer.rotation);
    ctx.drawImage(drawable, -width * 0.5, -height * 0.5, width, height);
    ctx.restore();
  }

  draw_grid(transform)
  {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    this.ctx.lineWidth = 1;

    this.ctx.beginPath();

    for (let step = 0; step <= 10; step++)
    {
      const u = step / 10;
      const left = this.uv_to_screen(u, 0, transform);
      const right = this.uv_to_screen(u, 1, transform);
      const top = this.uv_to_screen(0, u, transform);
      const bottom = this.uv_to_screen(1, u, transform);

      this.ctx.moveTo(left.x, left.y);
      this.ctx.lineTo(right.x, right.y);

      this.ctx.moveTo(top.x, top.y);
      this.ctx.lineTo(bottom.x, bottom.y);
    }

    this.ctx.stroke();
    this.ctx.restore();
  }

  draw_uvs(transform)
  {
    const geometry = this.current_mesh.geometry;
    const uv_attribute = geometry.attributes.uv;
    const index = geometry.index?.array;
    const triangle_count = this.get_triangle_count(geometry);
    const step = triangle_count > this.max_preview_triangles
      ? Math.ceil(triangle_count / this.max_preview_triangles)
      : 1;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(80, 175, 142, 0.95)';
    this.ctx.lineWidth = triangle_count > 7000 ? 0.8 : 1.1;

    this.ctx.beginPath();

    for (let triangle = 0; triangle < triangle_count; triangle += step)
    {
      const a_index = index ? index[triangle * 3] : triangle * 3;
      const b_index = index ? index[(triangle * 3) + 1] : (triangle * 3) + 1;
      const c_index = index ? index[(triangle * 3) + 2] : (triangle * 3) + 2;

      const a = this.uv_to_screen(uv_attribute.getX(a_index), uv_attribute.getY(a_index), transform);
      const b = this.uv_to_screen(uv_attribute.getX(b_index), uv_attribute.getY(b_index), transform);
      const c = this.uv_to_screen(uv_attribute.getX(c_index), uv_attribute.getY(c_index), transform);

      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.lineTo(c.x, c.y);
      this.ctx.lineTo(a.x, a.y);
    }

    this.ctx.stroke();
    this.ctx.restore();

    if (uv_attribute.count <= 2500)
    {
      this.draw_uv_points(uv_attribute, transform);
    }
  }

  draw_uv_points(uv_attribute, transform)
  {
    this.ctx.save();
    this.ctx.fillStyle = '#f4b675';

    for (let index = 0; index < uv_attribute.count; index++)
    {
      const point = this.uv_to_screen(uv_attribute.getX(index), uv_attribute.getY(index), transform);

      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  draw_domain_border(transform)
  {
    const top_left = this.uv_to_screen(0, 1, transform);
    const bottom_right = this.uv_to_screen(1, 0, transform);

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    this.ctx.lineWidth = 1.25;
    this.ctx.strokeRect(
      top_left.x,
      top_left.y,
      bottom_right.x - top_left.x,
      bottom_right.y - top_left.y
    );
    this.ctx.restore();
  }

  draw_active_layer_overlay(transform)
  {
    const active_layer = this.get_active_layer();

    if (!active_layer)
    {
      return;
    }

    const active_tool = this.get_active_tool();
    const overlay_bounds = active_tool === TOOL_CROP
      ? (
        this.drag_state?.targetId === active_layer.id && this.drag_state?.cropBox
          ? this.drag_state.cropBox
          : this.create_crop_box_from_layer(active_layer)
      )
      : this.get_layer_local_bounds(active_layer);
    const corners = this.get_local_box_corners(active_layer, overlay_bounds);
    const points = ['nw', 'ne', 'se', 'sw'].map(key =>
    {
      return this.uv_to_screen(corners[key].u, corners[key].v, transform);
    });
    const handles = this.get_layer_handle_screen_positions(active_layer, transform, overlay_bounds);

    this.ctx.save();
    this.ctx.strokeStyle = active_tool === TOOL_CROP
      ? 'rgba(96, 210, 156, 0.98)'
      : (
        active_layer.locked
          ? 'rgba(95, 145, 255, 0.95)'
          : (active_layer.visible ? 'rgba(245, 168, 82, 0.95)' : 'rgba(160, 160, 160, 0.85)')
      );
    this.ctx.fillStyle = active_tool === TOOL_CROP
      ? '#60d29c'
      : (active_layer.locked ? '#5f91ff' : '#f5a852');
    this.ctx.lineWidth = 1.5;

    if (!active_layer.visible)
    {
      this.ctx.setLineDash([6, 4]);
    }

    this.ctx.beginPath();
    if (active_tool === TOOL_CROP && this.get_crop_shape() === CROP_SHAPE_CIRCLE)
    {
      const top = this.uv_to_screen(corners.nw.u, corners.nw.v, transform);
      const bottom = this.uv_to_screen(corners.se.u, corners.se.v, transform);
      const center_x = (top.x + bottom.x) * 0.5;
      const center_y = (top.y + bottom.y) * 0.5;
      const radius = Math.min(Math.abs(bottom.x - top.x), Math.abs(bottom.y - top.y)) * 0.5;
      this.ctx.arc(center_x, center_y, radius, 0, Math.PI * 2);
    }
    else
    {
      this.ctx.moveTo(points[0].x, points[0].y);

      for (let index = 1; index < points.length; index++)
      {
        this.ctx.lineTo(points[index].x, points[index].y);
      }

      this.ctx.closePath();
    }
    this.ctx.stroke();

    this.ctx.setLineDash([]);

    for (const definition of HANDLE_DEFINITIONS)
    {
      const point = handles[definition.key];

      this.ctx.beginPath();
      this.ctx.rect(point.x - HANDLE_SIZE * 0.5, point.y - HANDLE_SIZE * 0.5, HANDLE_SIZE, HANDLE_SIZE);
      this.ctx.fill();
    }

    if (active_tool !== TOOL_CROP)
    {
      const center = this.uv_to_screen(active_layer.centerU, active_layer.centerV, transform);
      this.ctx.beginPath();
      this.ctx.arc(center.x, center.y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  draw_axis_labels(transform)
  {
    const top_left = this.uv_to_screen(0, 1, transform);
    const top_right = this.uv_to_screen(1, 1, transform);
    const bottom_left = this.uv_to_screen(0, 0, transform);

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.font = '12px sans-serif';
    this.ctx.fillText('V', top_left.x - 14, top_left.y + 14);
    this.ctx.fillText('U', top_right.x - 12, bottom_left.y + 18);
    this.ctx.restore();
  }

  async get_drawable_texture_source(texture)
  {
    const candidates = [
      texture.image,
      texture.source?.data,
      texture.source
    ];

    for (const candidate of candidates)
    {
      const drawable = await this.normalize_drawable_source(candidate);

      if (drawable)
      {
        return drawable;
      }
    }

    return null;
  }

  async normalize_drawable_source(source)
  {
    if (!source)
    {
      return null;
    }

    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap)
    {
      return source;
    }

    if (source instanceof HTMLImageElement)
    {
      if (!source.complete)
      {
        await source.decode().catch(() => {});
      }

      return source;
    }

    if (source instanceof HTMLCanvasElement)
    {
      return source;
    }

    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement)
    {
      return source;
    }

    if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas)
    {
      return source;
    }

    if (typeof ImageData !== 'undefined' && source instanceof ImageData)
    {
      return await createImageBitmap(source);
    }

    if (source.data)
    {
      return await this.normalize_drawable_source(source.data);
    }

    return null;
  }

  get_composite_size(state)
  {
    const base_layer = this.get_base_layer(state);

    if (base_layer?.naturalWidth && base_layer?.naturalHeight)
    {
      return {
        height: base_layer.naturalHeight,
        width: base_layer.naturalWidth
      };
    }

    const first_image_layer = state.layers.find(layer => layer.image);

    if (first_image_layer)
    {
      return {
        height: first_image_layer.naturalHeight,
        width: first_image_layer.naturalWidth
      };
    }

    return {
      height: 1024,
      width: 1024
    };
  }

  layer_stack_uses_alpha(state)
  {
    if (!state)
    {
      return false;
    }

    return state.layers.some(layer =>
    {
      if (!layer.visible)
      {
        return false;
      }

      if ((layer.opacity ?? 1) < 0.999)
      {
        return true;
      }

      if (layer.kind === 'decal')
      {
        return true;
      }

      if (layer.kind === 'base' && layer.sourceDataUrl)
      {
        return true;
      }

      return this.has_layer_mask(layer);
    });
  }

  schedule_apply_to_current_mesh()
  {
    const state = this.get_current_state();
    const mesh = this.current_mesh;

    if (!state || !mesh || state.applyFrame)
    {
      return;
    }

    state.applyFrame = window.requestAnimationFrame(() =>
    {
      state.applyFrame = 0;
      void this.apply_layers_to_mesh(mesh);
    });
  }

  draw_layer_into_composite(ctx, layer, width, height)
  {
    const drawable = this.get_layer_render_source(layer);

    if (!layer.visible || !drawable)
    {
      return;
    }

    const center_x = layer.centerU * width;
    const center_y = (1 - layer.centerV) * height;
    const draw_width = layer.widthU * width;
    const draw_height = layer.heightV * height;

    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(center_x, center_y);
    ctx.rotate(-layer.rotation);
    ctx.drawImage(drawable, -draw_width * 0.5, -draw_height * 0.5, draw_width, draw_height);
    ctx.restore();
  }

  async apply_layers_to_mesh(mesh)
  {
    if (!mesh)
    {
      return;
    }

    const state = this.ensure_mesh_state(mesh);
    const slot = state.editableSlot || this.get_editable_texture_slot(mesh);
    const material = slot?.material;
    const size = this.get_composite_size(state);
    const canvas = state.compositeCanvas;
    const ctx = state.compositeCtx;

    if (!canvas || !ctx)
    {
      return;
    }

    if (canvas.width !== size.width || canvas.height !== size.height)
    {
      canvas.width = size.width;
      canvas.height = size.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const layer of state.layers)
    {
      this.draw_layer_into_composite(ctx, layer, canvas.width, canvas.height);
    }

    if (!material)
    {
      return;
    }

    let override = this.material_overrides.get(material);

    if (!override)
    {
      override = {
        originalAlphaTest: material.alphaTest ?? 0,
        originalMap: material.map || null,
        originalTransparent: Boolean(material.transparent)
      };
      this.material_overrides.set(material, override);
    }

    if (!state.appliedTexture)
    {
      state.appliedTexture = new CanvasTexture(canvas);
      state.appliedTexture.colorSpace = override.originalMap?.colorSpace || SRGBColorSpace;
      state.appliedTexture.flipY = override.originalMap?.flipY ?? false;
      state.appliedTexture.wrapS = override.originalMap?.wrapS || ClampToEdgeWrapping;
      state.appliedTexture.wrapT = override.originalMap?.wrapT || ClampToEdgeWrapping;
      state.appliedTexture.magFilter = override.originalMap?.magFilter || LinearFilter;
      state.appliedTexture.minFilter = override.originalMap?.minFilter || LinearMipmapLinearFilter;
      override.appliedTexture = state.appliedTexture;
    }
    else
    {
      state.appliedTexture.image = canvas;
    }

    state.appliedTexture.needsUpdate = true;
    material.map = state.appliedTexture;
    material.transparent = override.originalTransparent || this.layer_stack_uses_alpha(state);
    material.alphaTest = override.originalAlphaTest;
    material.needsUpdate = true;
  }

  get_export_base_name()
  {
    const mesh_name = this.current_mesh?.name || 'model';
    return mesh_name.replace(/[^\w.-]+/g, '_');
  }

  async export_png_to_extension()
  {
    const state = this.get_current_state();

    if (!state?.compositeCanvas)
    {
      return;
    }

    await this.apply_layers_to_mesh(this.current_mesh);

    const data_url = state.compositeCanvas.toDataURL('image/png');

    VSCodeContext.ctx?.postMessage?.({
      type: 'exportComposedTexture',
      dataUrl: data_url,
      fileName: `${this.get_export_base_name()}-uv-composite.png`
    });
  }

  async save_model_to_extension()
  {
    if (!this.scene_controller?.model)
    {
      return;
    }

    await this.apply_layers_to_mesh(this.current_mesh);

    const exporter = new GLTFExporter();
    const result = await new Promise((resolve, reject) =>
    {
      exporter.parse(
        this.scene_controller.model,
        exported =>
        {
          resolve(exported);
        },
        error =>
        {
          reject(error);
        },
        {
          animations: this.scene_controller.gltf?.animations || [],
          binary: true,
          onlyVisible: false
        }
      );
    });

    if (!(result instanceof ArrayBuffer))
    {
      throw new Error('The exporter did not return a GLB binary payload.');
    }

    VSCodeContext.ctx?.postMessage?.({
      type: 'saveEditedModel',
      base64: this.array_buffer_to_base64(result)
    });
  }

  array_buffer_to_base64(array_buffer)
  {
    const bytes = new Uint8Array(array_buffer);
    const chunk_size = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunk_size)
    {
      const chunk = bytes.subarray(index, index + chunk_size);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  handle_locale_change()
  {
    this.update_title();

    const state = this.get_current_state();
    const base_layer = this.get_base_layer(state);

    if (base_layer)
    {
      base_layer.name = I18n.t('uv.layers.baseMap');
    }

    if (!this.current_mesh)
    {
      switch (this.ui_state)
      {
      case 'no-uv-model':
        this.show_no_uv_model_state();
        break;
      case 'selection-no-uv':
        this.set_empty_state('uv.empty.noMeshSelection');
        this.$status.textContent = this.last_non_uv_selection_name || I18n.t('uv.status.objectWithoutUvs');
        this.$meta.textContent = I18n.t('uv.meta.noSelection');
        this.$hint.textContent = I18n.t('uv.hint.noSelection');
        break;
      default:
        this.update_summary();
        break;
      }
    }
    else
    {
      this.update_summary();
    }

    this.build_layer_list();
    this.update_control_panel();
    this.update_tool_states();
    this.render();
  }
}

export { UVEditor };
