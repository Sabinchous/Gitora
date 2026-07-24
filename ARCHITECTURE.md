# Архитектура проекта

> Актуально на 24.07.2026. Структура сверена с исходным кодом и результатами доступных тестов/smoke-проверки.

## 1. Общая схема проекта

### Структура папок

- `src/` — renderer-приложение React/TypeScript.
- `src/components/` — UI-компоненты, сгруппированные по функциям.
- `src/context/` — состояние приложения и orchestration операций.
- `src/lib/` — чистые утилиты и расчёты, покрываемые тестами.
- `src/types/` — общие типы renderer-контракта.
- `src/styles/` — глобальные стили и тема.
- `electron/` — main process, preload и обработка GitHub-ошибок.
- `electron/mcpBridge.cjs` — локальный IPC-мост между отдельным MCP-процессом и Electron main.
- `scripts/` — сборка и smoke-проверки Electron.
- `docs/` — пользовательская документация и визуальные материалы.
- `build/` — иконки и ресурсы упаковки.
- постоянная БД отсутствует; `localStorage` используется для UI-настроек, Electron `safeStorage` — для GitHub-сессии.

### Слои и поток данных

```text
React UI (src/components)
        ↓
AppContext (src/context/AppContext.tsx)
        ↓
window.electronAPI (preload bridge)
        ↓
Electron IPC handlers (electron/main.cjs)
        ↓
GitHub REST API / локальные диалоги и файловая система
```

MCP-контур работает отдельным stdio-процессом, но доступ к GitHub делегирует Electron main:

```text
MCP client → mcp-server.cjs → local socket bridge → Electron main
Electron main → safeStorage/in-memory token → GitHub REST API
```

В metadata-файле bridge хранятся только версия протокола, socket path и random secret. GitHub-токен в этот файл не записывается.

## 2. Описание модулей

Название: Application shell

Назначение: композиция экранов, вкладок, модальных окон и глобальных состояний.

Ответственные файлы: `src/App.tsx`, `src/main.tsx`.

Основные классы: функциональные React-компоненты `App`.

Связи с другими модулями: читает `AppContext`, подключает компоненты Sidebar/Graph/PR/Issue/Modal.

Что нельзя ломать: маршрутизацию UI-состояний и согласованность открытия модальных окон.

Название: Application state and use cases

Назначение: единая точка состояния выбранного проекта, коммитов, веток, PR, issues, авторизации, тем и уведомлений; вызов backend use cases.

Ответственные файлы: `src/context/AppContext.tsx`.

Основные классы: `AppProvider`, контекст `AppContext`.

Связи с другими модулями: вызывает `window.electronAPI`, передаёт данные UI, использует `graphLayout` и `theme`.

Что нельзя ломать: контракт context value и защиту от устаревших запросов при смене проекта.

`AppContext` предоставляет два потока обновления. `refreshRepositoryData()` повторно запрашивает текущий repository snapshot через preload, пересчитывает layout и обновляет commits/branches. `syncAllData()` сначала получает актуальный список репозиториев GitHub, синхронизирует его с `projects`, выбирает запасной репозиторий при удалении текущего и затем загружает его snapshot. При ошибке обновления текущего репозитория старый граф сохраняется, а запросы защищены общим request id.

`SettingsModal` предоставляет глобальную точку запуска `syncAllData()`. Поэтому действие из настроек ведёт себя как повторный запуск приложения: список репозиториев перечитывается, новые элементы появляются, удалённые исчезают, а открытый граф загружается заново.

Настройка `commitLimit` читается context из `localStorage`, передаётся через typed preload API в `github:repository` и валидируется в main process перед запросом `commits?per_page=...`. Допустимый диапазон — 25–100.

`ReadmeModal` использует отдельный request id для загрузки README по ветке: результат применяется только если ветка всё ещё актуальна. Во время запроса редактирование и сохранение заблокированы.

Название: UI feature modules

Назначение: визуализация графа, деталей, репозиториев, PR, issues и модальных форм.

Ответственные файлы: `src/components/**`.

Основные классы: функциональные React-компоненты.

Связи с другими модулями: используют `useApp`, типы из `src/types` и чистые утилиты.

Что нельзя ломать: доступность действий, обработку loading/error и единый стиль темы.

Название: Domain utilities

Назначение: расчёт положения графа, контраст текста и выбор темы.

Ответственные файлы: `src/lib/graphLayout.ts`, `src/lib/colors.ts`, `src/lib/theme.ts`.

Основные классы: чистые функции.

Связи с другими модулями: вызываются из `AppContext` и компонентов; покрываются Vitest-тестами.

Что нельзя ломать: детерминированность layout и обработку неполной GitHub-истории.

Название: Electron backend

Назначение: безопасное хранение/восстановление сессии, GitHub API, файловые диалоги, скачивание и открытие внешних ссылок.

Ответственные файлы: `electron/main.cjs`, `electron/preload.cjs`, `electron/githubErrors.cjs`.

Основные классы: Electron `BrowserWindow`, IPC handlers, `McpBridge` server и функции GitHub API.

Связи с другими модулями: preload экспортирует ограниченный API в renderer; main обращается к GitHub и системным API.

Что нельзя ломать: whitelist внешних URL, валидацию входов, ручную проверку redirect-цепочки release assets, хранение токена, bridge protocol и соответствие типам `ElectronAPI`.

Для `app:download-release` разрешены только HTTPS-адреса `github.com` и `objects.githubusercontent.com`. Redirect-ответы не следуются автоматически: каждый `Location` валидируется перед следующим запросом, максимум допускается три перехода.

IPC-параметры, попадающие в URL GitHub, также валидируются до запроса: номера PR/issue должны быть положительными безопасными целыми числами, archive допускает только полный 40-символьный hexadecimal commit SHA.

Название: MCP integration

Назначение: доступ ИИ-агентов к GitHub-данным через MCP.

Ответственные файлы: `mcp-server.cjs`, `mcp-config.json`.

Основные классы: MCP server/tool handlers.

Связи с другими модулями: stdio MCP server читает только bridge metadata, вызывает локальный socket bridge, а Electron main выполняет GitHub REST API с токеном из памяти.

Что нельзя ломать: отсутствие утечки токена, запрет произвольных endpoint-ов и корректные MCP-контракты.

Текущий риск: локальный процесс с доступом к bridge metadata может выполнять разрешённые GitHub GET-запросы текущего пользователя; секрет ограничивает случайные подключения, но не заменяет OS-level user isolation.

## 3. Связи между классами

```text
App
 ↓
AppProvider / AppContext
 ↓
window.electronAPI
 ↓
preload.cjs → ipcMain handlers in main.cjs
 ↓
GitHub REST API
```

```text
AppContext → computeGraphLayout → Graph → CommitNode
AppContext → ProjectList / DetailPanel / PR / Issue / Modal components
```

Контракт между слоями описан в `src/types/index.ts` и должен совпадать с объектом, который публикует `electron/preload.cjs`.

## 4. Правила архитектуры

- UI не должен напрямую обращаться к Node.js, файловой системе или GitHub API.
- Renderer должен использовать только API, опубликованный preload.
- Бизнес-операции и интеграции с GitHub находятся в Electron main process или отдельном MCP-сервере.
- Чистые расчёты и преобразования держать в `src/lib`, не смешивать их с React side effects.
- Каждый компонент и функция должны иметь одну понятную ответственность.
- Не менять IPC-контракт без синхронного обновления preload, типов и всех потребителей.
- Внешние URL валидировать перед передачей системному `shell.openExternal`.
- URL, передаваемые в download IPC, валидировать тем же whitelist-подходом; нельзя считать renderer-параметр доверенным.
- Для GitHub refs использовать отдельные валидаторы owner/repo, branch/ref и SHA; `REPO_PART` не является универсальным validator. Git refs передавать в URL по сегментам после валидации и кодирования.
- Большие операции с файлами должны иметь hard limits, backpressure и понятное поведение при превышении лимита.
- Изменения с побочными эффектами должны корректно обрабатывать loading, error и отмену/устаревание запроса.
- Repository refresh должен использовать общий snapshot flow, обновлять graph layout после успешного ответа и не очищать старый граф при ошибке сети.
- Новые функции добавлять через существующие слои, без дублирования API-вызовов в компонентах.

## 5. Основные сущности проекта

Название: `Project`

Назначение: локальное представление GitHub-репозитория в списке проектов.

Поля: `id`, `name`, `repo`, `color`, `commits`, `branches`, `updated`, `description`, `isPrivate`, `defaultBranch`.

Связи: выбранный `Project` определяет запросы репозитория и отображение графа.

Название: `GitHubCommit` / `Commit`

Назначение: API-модель коммита и нормализованная модель для графа.

Поля: SHA, сообщение, автор, дата, родители; для графа — координаты, lane/row, ветка и статистика.

Связи: `GitHubCommit` преобразуется в `Commit`, parent SHA формируют рёбра графа.

Название: `Branch`

Назначение: ветка и её tip в визуальном графе.

Поля: `name`, `color`, `tipSha`.

Связи: участвует в `computeGraphLayout` и операциях создания/удаления/переименования веток.

Название: `GitHubPR` / `GitHubIssue`

Назначение: pull request и issue из GitHub.

Поля: идентификаторы, номер, заголовок, тело, состояние, пользователь, ветки/labels, даты, URL.

Связи: списки загружаются через context, детали открываются в UI; GitHub issue с `pull_request` фильтруются из списка issues.

Название: `Release`, `ReleaseAsset`, `CreateReleaseInput`

Назначение: релизы, assets и параметры создания релиза.

Связи: Electron загружает/создаёт релизы; UI выбирает asset и показывает обновления.

Название: `ElectronAPI`

Назначение: типизированный контракт между renderer и preload IPC.

Поля: группы `github`, `app` и `openExternal`; методы авторизации, repository/branch/PR/issue/release/README/file operations и downloads.

Связи: `src/types/index.ts` должен совпадать с объектом из `electron/preload.cjs` и handler names в `electron/main.cjs`.

Что нельзя ломать: имена каналов, shape `{ success, data?, error? }` и валидацию всех входов на стороне main.

## 6. Принятые архитектурные решения

- Electron выбран для desktop-доступа к системным диалогам, скачиваниям и защищённому хранению сессии.
- Preload bridge выбран для ограничения поверхности API renderer-процесса.
- `AppContext` используется как единый координационный слой без введения дополнительной state-management зависимости.
- Graph layout выделен в чистый модуль, чтобы его можно было тестировать без DOM.
- MCP-сервер вынесен в отдельный процесс, чтобы интеграция с ИИ-клиентами не зависела от renderer.
- MCP не получает токен напрямую: выбран локальный socket bridge, потому что Node MCP-процесс не может безопасно расшифровать Electron `safeStorage` самостоятельно.

Альтернативы и ограничения: при росте `AppContext` потребуется декомпозиция по use cases или feature-контекстам. Сейчас `AppContext.tsx` и `electron/main.cjs` являются крупными orchestration-модулями и требуют поэтапного рефакторинга с тестами.

## 7. План развития архитектуры

- Укрепить download IPC: URL allowlist, redirect policy, response-size limit.
- Ввести отдельные validators для GitHub refs, SHA, issue/PR numbers и файловых операций.
- Подключить `commitLimit`, pagination и отмену устаревших запросов.
- Декомпозировать `AppContext` и `electron/main.cjs` по доменам после стабилизации контрактов.
- Добавить интеграционные IPC/preload-тесты и расширить smoke-сценарии branch/README/download.
- Проверить производительность графа на больших историях и dark-theme/accessibility в браузерном окружении.
