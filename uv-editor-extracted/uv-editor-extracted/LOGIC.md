# UV Editor Logic

Ниже описана текущая логика UV-редактора без изменений реализации.

## 1. Основная роль класса

Главный класс находится в `src/js/UVEditor.js`.

Он отвечает сразу за несколько слоёв поведения:

- выбор меша с UV;
- отображение UV-раскладки на canvas;
- управление стеком слоёв: базовая карта + декали;
- трансформации UV и слоёв;
- crop, brush, eraser, eyedropper;
- undo/redo;
- in-memory применение результата к модели;
- сохранение/восстановление состояния через мост VS Code;
- экспорт PNG и экспорт/сохранение GLB.

## 2. Окна UI

UV-редактор состоит из двух окон:

- основное окно `.uv-editor` — список слоёв, тулбар, контролы;
- окно предпросмотра `.uv-editor-preview` — сам UV viewport на `canvas`.

Оба окна используют общую базовую механику `ResizableWindow`.

## 3. Базовый жизненный цикл

1. `Panel` создаёт `new UVEditor(this, 'uv')`.
2. `Panel.init(scene_controller)` вызывает `this.contents.uv.init(scene_controller)`.
3. После загрузки модели `Panel.on_model_loaded()` показывает кнопку UV только если `get_uv_mesh_count() > 0`.
4. При клике по объекту `UIController.handle_object_click()` вызывает `this.panel.contents.uv.handle_object_click(object3d, instance_id)`.
5. UV-редактор выбирает подходящий меш, строит состояние, обновляет summary/layers и рендерит viewport.

## 4. Что хранится в состоянии

Ключевые поля экземпляра:

- `uv_meshes` — все меши модели, у которых есть `geometry.attributes.uv`
- `current_mesh` — текущий активный меш
- `current_uv_bounds` — границы текущих UV
- `original_uvs` — исходные UV мешей для reset
- `mesh_states` — состояние редактора на каждый меш
- `material_overrides` — временные material/texture override при live apply
- `drag_state` — активное drag-взаимодействие
- `view_state` — zoom и центр UV viewport
- `pending_document_state` — отложенное восстановление состояния из VS Code

Состояние конкретного меша включает:

- выбранную цель редактирования;
- активный инструмент;
- paint target;
- crop shape;
- snap flag;
- base layer;
- decal layers;
- history и redo stack;
- solo/mask preview и вспомогательные флаги.

## 5. Модель слоёв

Есть два типа целей:

- `__uv-layout__` — сама UV-раскладка выбранного меша;
- слои изображения — base map и decal layers.

Базовый слой:

- создаётся из текстуры материала, если она есть;
- иначе создаётся checker fallback.

Декаль-слои:

- загружаются из PNG/JPG;
- имеют позицию, масштаб, поворот, opacity;
- могут быть скрыты, заблокированы, дублированы, переименованы;
- могут иметь mask canvas;
- могут быть solo;
- участвуют в live compositing.

## 6. История и undo/redo

История работает локально на состояние активного меша.

Основные шаги:

1. перед изменением создаётся snapshot;
2. snapshot кладётся в history;
3. redo очищается при новой ветке изменений;
4. `undo_current_state()` и `redo_current_state()` восстанавливают полное состояние редактора для текущего меша.

Это покрывает:

- трансформации UV;
- drag UV;
- манипуляции слоями;
- paint/erase;
- crop;
- mask операции.

## 7. Трансформации UV

Для редактирования UV-раскладки напрямую используются методы:

- `translate_current_uvs`
- `scale_current_uvs`
- `rotate_current_uvs`
- `reset_current_uvs`

Логика такая:

- работа идёт с `geometry.attributes.uv`;
- значения меняются напрямую в `BufferAttribute`;
- после изменения ставится `uv_attribute.needsUpdate = true`;
- границы UV пересчитываются через `compute_uv_bounds`;
- состояние сериализуется для persistence.

То есть UV меняются прямо в памяти текущей геометрии, без отдельной промежуточной модели.

## 8. Трансформации слоёв

Для image/mask слоёв редактирование идёт не через `geometry.attributes.uv`, а через параметры слоя:

- `centerU`, `centerV`
- `width`, `height`
- `rotation`
- `opacity`

Поддерживаются:

- перемещение;
- масштабирование;
- поворот;
- растягивание за боковые ручки;
- центрирование;
- fit into UV domain;
- lock;
- snap steps.

## 9. Paint / Eraser / Eyedropper

Когда активен paintable layer:

- `Brush` рисует по image canvas или по mask canvas;
- `Eraser` стирает из image или прячет mask;
- `Eyedropper` берёт цвет из выбранного слоя.

Ключевая идея:

- редактирование идёт по canvas-копии слоя;
- исходные и производные canvas-состояния синхронизируются внутри самого `UVEditor`;
- изменения сразу попадают в preview, persistence, export и live apply.

## 10. Crop

Crop работает поверх выбранного слоя.

Поддерживаются:

- прямоугольный crop;
- круговой crop;
- перемещение crop-box;
- resize через углы;
- resize через стороны;
- квадратная логика для circle crop.

После подтверждения drag-операции crop применяется к слою и фиксируется в истории.

## 11. Рендер viewport

Главный рендер идёт через `render()`.

Он последовательно рисует:

- checker background;
- layer stack;
- UV grid;
- UV triangles/lines/points;
- active layer overlay;
- axis labels.

Координатные преобразования строятся через:

- `get_uv_transform`
- `uv_to_screen`
- `screen_to_uv`
- `layer_local_to_uv`
- `uv_to_layer_local`

Отдельно поддерживаются:

- wheel zoom;
- RMB/MMB pan;
- `Alt + drag` pan;
- fit view;
- compact/narrow/micro responsive modes.

## 12. Live apply к модели

Слой за слоем собирается composite texture.

Далее:

- composite рисуется в offscreen canvas;
- по нему создаётся `CanvasTexture`;
- результат применяется к текущему материалу меша;
- alpha учитывается через `layer_stack_uses_alpha`.

Это даёт live preview на модели прямо в viewer без отдельного шага сохранения.

## 13. Persistence через VS Code

UV-редактор сериализует состояние документа через:

- `serialize_document_state()`
- `queue_persist_document_state()`

И отправляет его через:

- `VSCodeContext.ctx.setState(...)`
- `VSCodeContext.ctx.postMessage({ type: 'persistUVEditorState', ... })`

При восстановлении:

- extension передаёт `persistedUVState` в `setDocumentContext`;
- `UVEditor` ловит это через `vscode:document-context`;
- затем `restore_pending_document_state()` пытается восстановить mesh states и selected mesh.

## 14. Экспорт и сохранение

Есть два отдельных канала:

- `export_png_to_extension()` — отправляет data URL итоговой текстуры;
- `save_model_to_extension()` — экспортирует текущую модель через `GLTFExporter` в GLB и отправляет base64 в extension.

Дальше `extension.js`:

- сохраняет PNG через save dialog;
- либо перезаписывает исходный `.glb`;
- либо экспортирует новый `.glb`, если открыт не-GLB формат.

## 15. Что важно не сломать

Если позже кто-то будет переносить или рефакторить этот код, критично сохранить следующие связки:

- выбор меша <-> состояние конкретного меша;
- base layer + decal stack <-> live composite texture;
- history <-> все типы изменений;
- paint/mask/crop <-> persistence;
- viewport transform <-> pointer hit testing;
- export/save <-> текущее in-memory состояние UV и composite.

Именно на этих связях держится текущая рабочая логика UV-редактора.
