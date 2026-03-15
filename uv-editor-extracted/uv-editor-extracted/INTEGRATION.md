# UV Editor Integration Map

Ниже перечислены места в оригинальном проекте, где UV-редактор подключён к остальной системе.

## 1. Создание и показ панели

Файл: `src/js/Panel.js`

Что происходит:

- импортируется `UVEditor`;
- создаётся экземпляр `uv: new UVEditor(this, 'uv')`;
- вызывается `this.contents.uv.init(scene_controller)`;
- при обновлении контента вызывается `this.contents.uv.update_contents(object3d)`;
- после загрузки модели кнопка UV показывается, только если в модели есть UV-меши.

Ключевые места:

- `src/js/Panel.js:8`
- `src/js/Panel.js:22`
- `src/js/Panel.js:51`
- `src/js/Panel.js:79`
- `src/js/Panel.js:96`

## 2. Выбор объекта из viewer

Файл: `src/js/UIController.js`

Что происходит:

- при выборе объекта UV-редактор получает `handle_object_click(object3d, instance_id)`;
- это связывает 3D selection и 2D UV workflow.

Ключевое место:

- `src/js/UIController.js:34`

## 3. Кнопка и шаблон панели

Файл: `src/views/panel.pug`

Что происходит:

- определяется кнопка UV в левой панели;
- шаблон `uv_editor.pug` подключается через `include`.

Ключевые места:

- `src/views/panel.pug:14`
- `src/views/panel.pug:22`
- `src/views/panel.pug:86`

## 4. Подключение стилей

Файл: `src/styles/style.scss`

Что происходит:

- `_uv_editor.scss` подключается в общий сборочный SCSS.

Ключевое место:

- `src/styles/style.scss:12`

## 5. Строки интерфейса

Файл: `src/js/I18n.js`

Что происходит:

- там находятся все `panel.uv` и `uv.*` ключи для EN/RU;
- UVEditor опирается на них для заголовка, тултипов, подсказок, слоёв, кнопок и состояний empty/error.

Стартовые точки:

- `src/js/I18n.js:146`
- `src/js/I18n.js:147`
- `src/js/I18n.js:187`
- `src/js/I18n.js:459`
- `src/js/I18n.js:460`
- `src/js/I18n.js:500`

## 6. Мост состояния и сообщений

Файлы:

- `src/js/VSCodeContext.js`
- `src/js/UVEditor.js`
- `extension.js`

Что происходит:

- `VSCodeContext` хранит webview bridge;
- `UVEditor` слушает `vscode:document-context`;
- `UVEditor` сериализует состояние и отправляет `persistUVEditorState`;
- `UVEditor` отправляет `exportComposedTexture`;
- `UVEditor` отправляет `saveEditedModel`;
- `extension.js` принимает эти сообщения и пишет данные на диск / в workspace state.

Ключевые места:

- `src/js/VSCodeContext.js:1`
- `src/js/UVEditor.js:147`
- `src/js/UVEditor.js:360`
- `src/js/UVEditor.js:504`
- `src/js/UVEditor.js:4925`
- `src/js/UVEditor.js:4967`
- `extension.js:485`
- `extension.js:675`
- `extension.js:693`
- `extension.js:777`
- `extension.js:782`
- `extension.js:811`

## 7. Базовый контейнер draggable/resizable окон

Файл: `src/js/ResizeableWindow.js`

Что происходит:

- `UVEditor` наследуется от `ResizableWindow`;
- preview окно внутри UV-редактора тоже создаётся через `new ResizableWindow(...)`.

Ключевые места:

- `src/js/ResizeableWindow.js:1`
- `src/js/UVEditor.js:42`
- `src/js/UVEditor.js:86`

## 8. Что скопировано в эту папку, а что нет

Скопировано точно:

- `src/js/UVEditor.js`
- `src/views/uv_editor.pug`
- `src/styles/_uv_editor.scss`

Не копировалось специально:

- общая инфраструктура проекта;
- shared-классы, не являющиеся UV-редактором сами по себе;
- остальной viewer/motion/materials code.

То есть эта папка задумана как чистый выделенный срез UV-редактора, а не как новый исполняемый модуль проекта.
