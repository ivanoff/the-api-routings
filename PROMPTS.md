==== user ====
нужно написать библиотеку для **автоматической генерации CRUD-эндпоинтов** над таблицами PostgreSQL в экосистеме `the-api`. Одной строкой `router.crud({ table: 'users' })` создаётся полный набор REST-маршрутов.
- bun, typescript
- Hono

==== assistant ====


## Архитектура (3 модуля)

### 1. `Routings` — маршрутизатор
- Обёртка над Hono: методы `get`, `post`, `put`, `patch`, `delete`, `use`, `all`
- Метод **`crud()`** — автогенерация 6 маршрутов:
  ```
  GET    /{table}       — список
  POST   /{table}       — создание
  GET    /{table}/:id   — по ID
  PUT    /{table}/:id   — замена
  PATCH  /{table}/:id   — обновление
  DELETE /{table}/:id   — удаление
  ```
- Регистрация **ошибок** и **email-шаблонов**
- Поддержка **миграций** через `migrationDirs`

### 2. `CrudBuilder` — ядро бизнес-логики
Основной и самый крупный файл (~550 строк). Функциональность:

| Возможность | Реализация |
|---|---|
| **Фильтрация** | `where`, `whereNot` (`!`), `ilike` (`~`), `_null_`, `_not_null_`, `_in_`, `_not_in_`, `_from_`/`_to_` |
| **Пагинация** | `_page`, `_limit`, `_skip`, `_unlimited`, курсорная (`_after`) |
| **Сортировка** | `_sort=-created,name,random()` |
| **Выбор полей** | `_fields=id,name` |
| **JOIN-ы** | `join`, `leftJoin`, `joinOnDemand` (по запросу через `_join`) |
| **Мультиязычность** | `_lang=de`, COALESCE-подстановка из таблицы `langs` |
| **Полнотекстовый поиск** | `_search` через триграммы PostgreSQL (`%`, `<->`) |
| **Soft delete** | `isDeleted` + `deletedReplacements` |
| **Права доступа** | `tokenRequired`, `ownerRequired`, `rootRequired`, `accessByStatuses`, permission-based скрытие полей |
| **Скрытые/readonly поля** | `hiddenFields`, `readOnlyFields` (с учётом owner/roles) |
| **Связи** | `relations` — вложенные CRUD-конфигурации |

### 3. `types.ts` — типизация
~120 строк типов: `CrudBuilderOptionsType`, `CrudBuilderPermissionsType`, `metaType`, `getResultType` и др.

## Зависимости

```
hono       — HTTP-фреймворк
flattening — развёртка вложенных объектов (для whereBindings)
knex       — SQL-конструктор (peer/dev)
```

## Ключевые особенности

- **PostgreSQL-ориентирован**: `json_build_object`, `jsonb_agg`, `COALESCE`-подзапросы, триграммный поиск, `RANDOM()`
- **Мета-данные пагинации**: `total`, `pages`, `nextPage`, `isFirstPage`, `isLastPage`, `nextAfter` (курсор)
- **Self-documenting**: метод `optionsGet()` возвращает описание всех доступных query-параметров для OpenAPI/клиентов
- **Тестов нет** — директория `test` пуста

## Схема работы

```
Запрос → Hono → Routings.crud() → CrudBuilder
  → fields() + where() + sort() + pagination()
  → Knex → PostgreSQL
  → deleteHiddenFields → response { result, meta }
```

---

==== user ====
Покажи структуру проекта и ключевые файлы.

==== assistant ====

## Project Structure

src
├── CrudBuilder.ts
├── index.ts
├── Routings.ts
└── types.ts
test
├── CrudBuilder.test.ts
├── helpers.ts
└── Routings.test.ts

0 directories, 7 files

## Key Files

### README.md
```markdown
# the-api-routings

Auto-generate REST CRUD endpoints over PostgreSQL tables with one line of code.
Built on [Hono](https://hono.dev) + [Knex](https://knexjs.org) for the [the-api](https://github.com/ivanoff/the-api) ecosystem.

```typescript
router.crud({ table: 'posts' });
// GET    /posts
// POST   /posts
// GET    /posts/:id
// PUT    /posts/:id
// PATCH  /posts/:id
// DELETE /posts/:id
```

## Install

```bash
npm i -S the-api-routings
```

## Environment

`_unlimited` query parameter is disabled by default.  
Set `CAN_GET_UNLIMITED=true` to allow `?_unlimited=true`.

`_limit` behavior can also be controlled with:
- `LIMIT_DEFAULT` — default `_limit` value when request has no `_limit`
- `LIMIT_MAX` — upper bound for `_limit` (caps both request `_limit` and `LIMIT_DEFAULT`)

```dotenv
CAN_GET_UNLIMITED=true
LIMIT_DEFAULT=
LIMIT_MAX=
```

## Quick Start

```typescript
import { Routings } from 'the-api-routings';

const router = new Routings();

router.crud({ table: 'users' });
router.crud({ table: 'posts', prefix: 'api/posts' });

// pass router to the-api
const app = new TheAPI({ routings: [router] });
export default app.up();
```

```bash
curl http://localhost:7788/users?_limit=10&_sort=-timeCreated
curl http://localhost:7788/api/posts?_fields=id,title&_lang=de
```

## Query Parameters

Every `GET` endpoint supports a rich set of filters out of the box.

### Pagination

| Param | Example | Description |
|---|---|---|
| `_limit` | `?_limit=20` | Records per page |
| `_page` | `?_page=3` | Page number (1-based) |
| `_skip` | `?_skip=100` | Skip N records |
| `_unlimited` | `?_unlimited=true` | Return all records (requires `CAN_GET_UNLIMITED`) |
| `_after` | `?_after=2024-01-15&_sort=-timeCreated&_limit=20` | Cursor pagination |

### Sorting

| Param | Example | Description |
|---|---|---|
| `_sort` | `?_sort=name` | Ascending |
| | `?_sort=-timeCreated` | Descending (prefix `-`) |
| | `?_sort=-timeCreated,name` | Multiple fields |
| | `?_sort=random()` | Random order |

All sorting applies `NULLS LAST` automatically.

### Field Selection

| Param | Example | Description |
|---|---|---|
| `_fields` | `?_fields=id,name,email` | Return only listed columns |
| `_join` | `?_join=comments,tags` | Include on-demand joins |

### Filtering

```
GET /users?status=active                  — exact match
GET /users?status=active&status=verified  — IN (multiple values)
GET /users?name~=%john%                   — iLIKE (case-insensitive)
GET /users?status!=deleted                — NOT equal
GET /users?status!=deleted&status!=banned — NOT IN
GET /users?_null_deletedAt=1              — IS NULL
GET /users?_not_null_email=1              — IS NOT NULL
GET /users?_in_id=[1,2,3]                — IN (JSON array)
GET /users?_not_in_id=[4,5]              — NOT IN (JSON array)
GET /users?_from_age=18&_to_age=65       — range (>= and <=)
```

### Search & Localization

| Param | Example | Description |
|---|---|---|
| `_search` | `?_search=john` | Trigram search (requires `pg_trgm`) |
| `_lang` | `?_lang=de` | Translate fields via `langs` table |

## Routings API

### HTTP Methods

```typescript
const router = new Routings();

router.get('/health', async (c) => { c.set('result', { ok: true }); });
router.post('/upload', authMiddleware, async (c) => { /* ... */ });
router.put('/items/:id', async (c) => { /* ... */ });
router.patch('/items/:id', async (c) => { /* ... */ });
router.delete('/items/:id', async (c) => { /* ... */ });

// Middleware for all routes
router.use('/api/*', corsMiddleware);
router.all(loggerMiddleware);
```

### crud(options)

Generates all 6 endpoints at once:

```typescript
router.crud({
  table: 'posts',
  prefix: 'api/posts',           // URL prefix (default: table name)
  schema: 'public',              // DB schema (default: 'public')

  // fields
  hiddenFields: ['password'],    // stripped from responses
  readOnlyFields: ['id', 'timeCreated', 'timeUpdated', 'isDeleted'],
  requiredFields: { title: 'TITLE_REQUIRED' },
  aliases: { userName: 'author' },

  // filtering
  defaultWhere: { tenantId: '1' },
  defaultWhereRaw: '"publishedAt" IS NOT NULL',
  defaultSort: '-timeCreated',
  searchFields: ['title', 'body'],

  // joins
  join: [
    {
      table: 'categories',
      alias: 'category',
      field: `"categories"."name"`,
      where: `"categories"."id" = "posts"."categoryId"`,
    },
  ],
  joinOnDemand: [
    {
      table: 'comments',
      where: `"comments"."postId" = "posts"."id"`,
    },
  ],
  leftJoin: [['tags', 'tags.id', 'posts.tagId']],

  // soft delete
  deletedReplacements: { title: '[deleted]', body: '' },
  includeDeleted: false,

  // translations
  translate: ['title', 'description'],

  // access control
  tokenRequired: ['add', 'update', 'delete'],
  ownerRequired: ['update', 'delete'],

  // permissions
  permissions: {
    protectedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    owner: ['posts.view_private'],
    fields: {
      viewable: {
        'admin.view_emails': ['email', 'phone'],
      },
    },
  },

  // relations
  relations: {
    comments: { table: 'comments' },
  },

  // caching
  cache: { ttl: 60 },
});
```

### errors()

```typescript
router.errors({
  TITLE_REQUIRED: { code: 1001, status: 400, description: 'Post title is required' },
  POST_NOT_FOUND: { code: 1002, status: 404 },
});

// or array
router.errors([errors1, errors2]);
```

### emailTemplates()

```typescript
router.emailTemplates({
  welcome: {
    subject: 'Welcome, {{name}}!',
    html: '<h1>Hello {{name}}</h1>',
  },
});
```

### Migrations

```typescript
const router = new Routings({
  migrationDirs: [path.join(__dirname, 'migrations')],
});
```

## Join Types

### Static Join (always included)

```typescript
join: [{
  table: 'users',
  alias: 'author',
  fields: ['id', 'name', 'avatar'],            // json_build_object
  where: `"users"."id" = "posts"."userId"`,
  orderBy: '"users"."name" ASC',
  limit: 1,
  byIndex: 0,                                   // extract first element
  defaultValue: null,
}]
```

### Computed Field Join

```typescript
join: [{
  table: 'likes',
  alias: 'likesCount',
  field: 'COUNT(*)::int',
  where: `"likes"."postId" = "posts"."id"`,
}]
```

### Boolean Field Join

```typescript
join: [{
  table: 'likes',
  alias: 'isLiked',
  field: `EXISTS(SELECT 1 FROM "likes" WHERE "likes"."postId" = "posts"."id" AND "likes"."userId" = :userId)::bool`,
  where: '1=1',
  whereBindings: { userId: 'env.user.id' },
}]
```

### On-Demand Join (via `?_join=comments`)

```typescript
joinOnDemand: [{
  table: 'comments',
  where: `"comments"."postId" = "posts"."id"`,
  orderBy: `"comments"."timeCreated" DESC`,
}]
```

## Response Format

### GET /posts?_limit=2&_page=1

```json
{
  "result": [
    { "id": 1, "title": "First post" },
    { "id": 2, "title": "Second post" }
  ],
  "meta": {
    "total": 42,
    "limit": 2,
    "page": 1,
    "pages": 21,
    "skip": 0,
    "nextPage": 2,
    "isFirstPage": true,
    "isLastPage": false,
    "nextAfter": "2024-01-15T12%3A00%3A00.000999Z"
  }
}
```

### Cursor Pagination

```
GET /posts?_sort=-timeCreated&_limit=20
→ meta.nextAfter = "2024-01-15T12%3A00%3A00.000000Z"

GET /posts?_sort=-timeCreated&_limit=20&_after=2024-01-15T12%3A00%3A00.000000Z
→ next page
```

### GET /posts/1

```json
{
  "result": { "id": 1, "title": "First post", "category": "tech" }
}
```

### POST /posts

```json
// request
{ "title": "New post", "body": "Content" }

// response
{ "result": { "id": 3, "title": "New post", "body": "Content", "timeCreated": "..." } }
```

### DELETE /posts/1

```json
{
  "result": { "ok": true },
  "meta": { "countDeleted": 1 }
}
```

## Soft Delete

If the table has an `isDeleted` boolean column, `DELETE` sets it to `true` instead of removing the row.
All `GET` queries automatically filter `isDeleted = false`.

Show deleted records with replaced values:

```typescript
router.crud({
  table: 'posts',
  includeDeleted: true,
  deletedReplacements: {
    title: '[deleted]',
    body: '',
    author: null,
  },
});
```

## Search

Requires PostgreSQL `pg_trgm` extension:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

```typescript
router.crud({
  table: 'posts',
  searchFields: ['title', 'body'],
});
```

```
GET /posts?_search=typescript
```

Results are sorted by similarity distance (closest first) unless `_sort` is specified.

## Programmatic Usage

Use `CrudBuilder` directly for custom logic:

```typescript
import { CrudBuilder } from 'the-api-routings';

router.get('/my-posts', async (c) => {
  const crud = new CrudBuilder({ table: 'posts' });
  const { result, meta } = await crud.getRequestResult(c, {
    _limit: ['5'],
    _sort: ['-timeCreated'],
    userId: [c.var.user.id],
  });
  c.set('result', result);
  c.set('meta', meta);
});
```

## Requirements

- **PostgreSQL** 12+ (for `json_build_object`, `jsonb_agg`)
- **pg_trgm** extension (for `_search`)
- **Bun** runtime (build & test)

## License

MIT © [Dimitry Ivanov](https://github.com/ivanoff)
```

### package.json
```json
{
  "name": "the-api-routings",
  "version": "0.3.1",
  "license": "MIT",
  "author": "Dimitry Ivanov <2@ivanoff.org.ua> # curl -A cv ivanoff.org.ua",
  "description": "Routings for the-api",
  "repository": {
    "type": "git",
    "url": "https://github.com/the-api/the-api-routings"
  },
  "keywords": ["the-api", "routings"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target node --external hono --external flattening --external knex && bunx tsc"
  },
  "dependencies": {
    "flattening": "^2.4.3",
    "hono": "^4.12.2"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^20.19.33",
    "knex": "^3.1.0"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

### .env.example
```env.example
# Enables support for ?_unlimited=true when value is exactly "true".
CAN_GET_UNLIMITED=true

# Default limit for GET queries when request has no _limit.
LIMIT_DEFAULT=

# Max allowed _limit for GET queries (caps request _limit and LIMIT_DEFAULT).
LIMIT_MAX=
```

### .gitignore
```gitignore
# Based on https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore

# Logs

logs
_.log
npm-debug.log_
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*

# Caches

.cache

# Diagnostic reports (https://nodejs.org/api/report.html)

report.[0-9]_.[0-9]_.[0-9]_.[0-9]_.json

# Runtime data

pids
_.pid
_.seed
*.pid.lock

# Directory for instrumented libs generated by jscoverage/JSCover

lib-cov

# Coverage directory used by tools like istanbul

coverage
*.lcov

# nyc test coverage

.nyc_output

# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)

.grunt

# Bower dependency directory (https://bower.io/)

bower_components

# node-waf configuration

.lock-wscript

# Compiled binary addons (https://nodejs.org/api/addons.html)

build/Release

# Dependency directories

node_modules/
jspm_packages/

# Snowpack dependency directory (https://snowpack.dev/)

web_modules/

# TypeScript cache

*.tsbuildinfo

# Optional npm cache directory

.npm

# Optional eslint cache

.eslintcache

# Optional stylelint cache

.stylelintcache

# Microbundle cache

.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history

.node_repl_history

# Output of 'npm pack'

*.tgz

# Yarn Integrity file

.yarn-integrity

# dotenv environment variable files

.env
.env.development.local
.env.test.local
.env.production.local
.env.local

# parcel-bundler cache (https://parceljs.org/)

.parcel-cache

# Next.js build output

.next
out

# Gatsby files

# Comment in the public line in if your project uses Gatsby and not Next.js

# https://nextjs.org/blog/next-9-1#public-directory-support

# public

# vuepress build output

.vuepress/dist

# vuepress v2.x temp and cache directory

.temp

# Docusaurus cache and generated files

.docusaurus

# Serverless directories

.serverless/

# FuseBox cache

.fusebox/

# DynamoDB Local files

.dynamodb/

# TernJS port file

.tern-port

# Stores VSCode versions used for testing VSCode extensions

.vscode-test

# yarn v2

.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz
.pnp.*

# IntelliJ based IDEs
.idea

# Finder (MacOS) folder config
.DS_Store
```

==== user ====
Теперь приложи исходники из src и test.

==== assistant ====

## Source Code

### src/CrudBuilder.ts
```ts
import flattening from 'flattening';
import type { CrudBuilderOptionsType, CrudBuilderPermissionsType, DbTablesType, MethodsType, getResultType, metaType, stringRecordType, whereParamsType } from "./types";
import type { Context } from 'hono';
import type { Knex } from 'knex';

const getPositiveIntFromEnv = (name: 'LIMIT_DEFAULT' | 'LIMIT_MAX') => {
  const value = process.env[name];
  if (!value) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return;
  return parsed;
};

const getQueryLimit = ({
  _limit,
  _unlimited,
}: {
  _limit?: any;
  _unlimited?: any;
}) => {
  const canGetUnlimited = process.env.CAN_GET_UNLIMITED === 'true';
  const isUnlimited = canGetUnlimited && (_unlimited === 'true' || _unlimited === true);
  if (isUnlimited) return;

  const defaultLimit = getPositiveIntFromEnv('LIMIT_DEFAULT');
  const maxLimit = getPositiveIntFromEnv('LIMIT_MAX');

  let limit: any = _limit;
  if ((typeof limit === 'undefined' || limit === null || limit === '') && typeof defaultLimit !== 'undefined') {
    limit = defaultLimit;
  }

  if (!limit) return;

  const limitNumber = +limit;
  if (typeof maxLimit !== 'undefined' && !Number.isNaN(limitNumber) && limitNumber > maxLimit) {
    return maxLimit;
  }

  return limit;
};

export default class CrudBuilder {
  c?: Context;
  table: any;
  schema: any;
  aliases: stringRecordType;
  join: any;
  joinOnDemand: any;
  leftJoin: any;
  leftJoinDistinct: any;
  lang: any;
  translate: any;
  searchFields: any;

  requiredFields: any;
  defaultWhere: any;
  defaultWhereRaw: any;
  defaultSort: any;
  sortRaw: any;
  fieldsRaw: any;
  tokenRequired: any;
  ownerRequired: any;
  rootRequired: any;
  access: any;
  accessByStatuses: any;
  deletedReplacements: any;
  includeDeleted: boolean;

  hiddenFields?: string[];
  readOnlyFields?: string[];
  permissionViewableFields?: Record<string, string[]>;
  permissionEditableFields?: Record<string, string[]>;
  showFieldsByPermission?: Record<string, string[]>;
  permissionCheckedMethods?: (MethodsType | '*')[];
  replacedOwnerPermissions?: string[];

  cache: any;
  userIdFieldName: any;
  additionalFields: any;
  apiClientMethodNames: any;

  dbTables: DbTablesType;
  coaliseWhere: any;
  langJoin: any = {};
  coaliseWhereReplacements: any;
  user?: any;
  res: any;
  isOwner?: boolean;
  rows: any;
  relations?: Record<string, CrudBuilderOptionsType>;
  roles: any;
  permissions?: CrudBuilderPermissionsType;
  ownerPermissions: Record<string, boolean>;

  constructor({
    c,
    table,
    schema,
    aliases,
    join,
    joinOnDemand,
    leftJoin,
    leftJoinDistinct,
    lang,
    translate,
    searchFields,
    hiddenFields,
    readOnlyFields,
    permissions,
    requiredFields,
    defaultWhere,
    defaultWhereRaw,
    defaultSort,
    sortRaw,
    fieldsRaw,
    tokenRequired,
    ownerRequired,
    rootRequired,
    access,
    accessByStatuses,
    dbTables,
    deletedReplacements,
    includeDeleted,
    cache,
    userIdFieldName,
    additionalFields,
    apiClientMethodNames,
    relations,
  }: CrudBuilderOptionsType) {
    this.c = c;
    this.table = table;
    this.schema = schema || 'public';
    this.aliases = aliases || {};
    this.join = join || [];
    this.joinOnDemand = joinOnDemand || [];
    this.leftJoin = leftJoin || [];
    this.leftJoinDistinct = !!leftJoinDistinct;
    this.lang = lang || 'en';
    this.translate = translate || [];
    this.showFieldsByPermission = permissions?.fields?.viewable || {};
    this.ownerPermissions = permissions?.owner?.reduce((acc, cur) => ({ ...acc, [cur]: true }) ,{}) || {};
    this.readOnlyFields = readOnlyFields || ['id', 'timeCreated', 'timeUpdated', 'timeDeleted', 'isDeleted'];
    this.requiredFields = requiredFields || {};
    this.defaultWhere = defaultWhere || {};
    this.defaultWhereRaw = defaultWhereRaw;
    this.defaultSort = defaultSort;
    this.sortRaw = sortRaw;
    this.fieldsRaw = fieldsRaw;
    this.tokenRequired = tokenRequired?.reduce((acc: any, cur: any) => ({ ...acc, [cur]: true }), {}) || {};
    this.ownerRequired = ownerRequired?.reduce((acc: any, cur: any) => ({ ...acc, [cur]: true }), {}) || {};
    this.rootRequired = rootRequired?.reduce((acc: any, cur: any) => ({ ...acc, [cur]: true }), {}) || {};
    this.access = access || {};
    this.accessByStatuses = accessByStatuses || {};
    this.searchFields = searchFields || [];
    this.dbTables = dbTables || {};
    this.deletedReplacements = deletedReplacements;
    this.includeDeleted = typeof includeDeleted === 'boolean' ? includeDeleted : !!this.deletedReplacements;
    this.hiddenFields = hiddenFields || [];
    this.coaliseWhere = {};
    this.coaliseWhereReplacements = {};
    this.cache = cache;
    this.userIdFieldName = userIdFieldName || 'userId';
    this.additionalFields = additionalFields || {};
    this.apiClientMethodNames = apiClientMethodNames || {};
    this.relations = relations;
  }

  getDbWithSchema(db: Knex<any, unknown[]>) {
    const result = db(this.table);
    if (this.schema) result.withSchema(this.schema);
    return result;
  }

  getTableRows(c: Context) {
    return c.env.dbTables[`${this.schema}.${this.table}`] || {};
  }

  sort(sort: any, db: any) {
    if (this.sortRaw) this.res.orderByRaw(this.sortRaw);

    const _sort = sort || this.defaultSort;
    if (!_sort) return;

    _sort.split(',').forEach((item: any) => {
      if (item.match(/^random\(\)$/i)) return this.res.orderBy(db.raw('RANDOM()'));

      const match = item.match(/^(-)?(.*)$/);
      this.res.orderBy(match[2], match[1] && 'desc', 'last');
    });
  }

  pagination({
    _page, _skip = 0, _limit, _unlimited,
  }: any) {

    const limit = getQueryLimit({ _limit, _unlimited });
    if (!limit) return;

    this.res.limit(limit);
    const offset = _page ? (_page - 1) * limit : 0;
    this.res.offset(offset + (+_skip));
  }

  whereNotIn(whereNotInObj: any) {
    if (!whereNotInObj) return;

    for (const [key, value] of Object.entries(whereNotInObj)) {
      this.res.whereNotIn(key, value);
    }
  }

  where(whereObj: any, db: any) {
    if (!whereObj) return;

    for (const [key, value] of Object.entries(whereObj)) {
      if (this.langJoin[`${key}`]) {
        this.res.whereRaw(`${this.langJoin[`${key}`]} = :_value`, { _value: value, lang: this.lang });
      } else if (this.coaliseWhere[`${key}`] || this.coaliseWhere[`${key.replace(/!$/, '')}`]) {
        const key2 = key.replace(/!$/, '');
        const isNnot = key.match(/!$/) ? 'NOT' : '';
        const coaliseWhere = this.coaliseWhere[`${key2}`];
        const replacements = this.coaliseWhereReplacements;
        if (Array.isArray(value)) {
          for (const _value of value) {
            this.res.orWhere(function (this: Knex.QueryBuilder) {
              this.whereRaw(`${isNnot} ${coaliseWhere} = :_value`, { ...replacements, _value });
            });
          }
        } else {
          this.res.whereRaw(`${isNnot} ${coaliseWhere} = :_value`, { ...replacements, _value: value });
        }
      } else if (key.match(/~$/)) {
        // iLike
        this.res.where(key.replace(/~$/, ''), 'ilike', value);
      } else if (key.match(/!$/)) {
        if (Array.isArray(value)) {
          this.res.whereNotIn(key.replace(/!$/, ''), value);
        } else {
          this.res.whereNot(key.replace(/!$/, ''), value);
        }
      } else if (key.match(/^_null_/)) {
        const m = key.match(/^_null_(.+)$/);
        this.res.whereNull(m?.[1]);
      } else if (key.match(/^_in_/)) {
        try {
          const m = key.match(/^_in_(.+)$/);
          this.res.whereIn(m?.[1], JSON.parse(value as any));
        } catch {
          throw new Error('ERROR_QUERY_VALUE')
        }
      } else if (key.match(/^_not_in_/)) {
        try {
          const m = key.match(/^_not_in_(.+)$/);
          this.res.whereNotIn(m?.[1], JSON.parse(value as any));
        } catch {
          throw new Error('ERROR_QUERY_VALUE')
        }
      } else if (key.match(/^_not_null_/)) {
        const m = key.match(/^_not_null_(.+)$/);
        this.res.whereNotNull(m?.[1]);
      } else if (key.match(/_(from|to)_/)) {
        if (value !== '') {
          const m = key.match(/_(from|to)_(.+)$/);
          const sign = m?.[1] === 'from' ? '>=' : '<=';

          const coaliseWhere = this.coaliseWhere[`${m?.[2]}`];
          if (coaliseWhere) {
            this.res.whereRaw(`${coaliseWhere} ${sign} ?`, [value]);
          } else {
            this.res.where(`${m?.[2]}`, sign, value);
          }
        }
      } else if (Array.isArray(value)) {
        this.res.whereIn(key, value);
      } else if (value === null) {
        this.res.whereNull(key);
      } else if (this.leftJoin && !key.includes('.')) {
        this.res.where({ [`${this.table}.${key}`]: value });
      } else {
        this.res.where(key, value);
      }
    }
  }

  getHiddenFields() {
    if (!this.roles) return { regular: this.hiddenFields, owner: this.hiddenFields };

    const permissions = this.roles.getPermissions(this.user?.roles);

    let toShow: string[] = [];
    let ownerToShow: string[] = [];
    for (const [key, value] of Object.entries(this.showFieldsByPermission)) {
      const hasPermission = this.roles.checkWildcardPermissions({ key, permissions });
      if (hasPermission) toShow = toShow.concat(value);
      
      const ownerHasPermission = this.roles.checkWildcardPermissions({ key, permissions: this.ownerPermissions });
      if (ownerHasPermission) ownerToShow = ownerToShow.concat(value);
    }

    const regular = this.hiddenFields?.filter((item) => !toShow.includes(item)) || [];
    const owner = this.hiddenFields?.filter((item) => !ownerToShow.includes(item)) || [];

    return { regular, owner };
  }

  fields({
    c, _fields, _join, db, _sort,
  }: any) {
    // this.updatehiddenFields(this.hiddenFields);
    let f = _fields && _fields.split(',').filter((item) => item !== '-relations');

    if (this.leftJoin.length) {
      this.leftJoin.map((item: any) => this.res.leftJoin(...item));

      if (this.leftJoinDistinct) {
        const sortArr = (_sort || this.defaultSort || '').replace(/(^|,)-/g, ',').split(',').filter(Boolean);
        this.res.distinct(!f ? [] : sortArr.map((item: any) => !f.includes(item) && `${this.table}.${item}`).filter(Boolean));
      }
    }

    let join = [...this.join];

    if (_join) {
      const joinNames = Array.isArray(_join) ? _join : _join.split(',');
      for (const joinName of joinNames) {
        const toJoin = this.joinOnDemand.filter(({ table, alias }: any) => joinName === alias || joinName === table );
        if (toJoin.length) join = join.concat(toJoin.filter((j: any) => !join.find(({ table, alias }) => table === j.table && alias === j.alias)));
      }
    }

    if (f) {
      join = join.filter(({ table, alias }: any) => f.includes(table) || f.includes(alias));
      f = f.filter((name: string) => !join.find(({ table, alias}: any) => name === table || name === alias));
    }

    let joinCoaleise = (f || Object.keys(this.rows))
      // .filter((name: any) => !this.hiddenFields.includes(name))
      .map((l: any) => `${this.table}.${l}`);

    if (this.includeDeleted && this.deletedReplacements && this.rows.isDeleted) {
      joinCoaleise = joinCoaleise.map((item: any) => {
        const [tableName, fieldName] = item.split('.');
        const replaceWith = this.deletedReplacements[`${fieldName}`];
        if (typeof replaceWith === 'undefined') return item;
        return db.raw(`CASE WHEN "${this.table}"."isDeleted" THEN :replaceWith ELSE "${tableName}"."${fieldName}" END AS ${fieldName}`, { replaceWith });
      });
    }

    for (const field of Object.keys(this.aliases)) {
      joinCoaleise.push(`${this.table}.${field} AS ${this.aliases[`${field}`]}`);
    }

    if (this.lang && this.lang !== 'en') {
      for (const field of this.translate) {
        this.langJoin[`${field}`] = `COALESCE( (
          select text from langs where lang=:lang and "textKey" = any(
            select "textKey" from langs where lang='en' and text = "${this.table}"."${field}" 
          ) limit 1), name )`;
        joinCoaleise.push(db.raw(this.langJoin[`${field}`] + `AS "${field}"`, { lang: this.lang }));
      }
    }

    for (const {
      table, schema, as, where, whereBindings, alias, defaultValue, fields,
      field, limit, orderBy, byIndex, leftJoin,
    } of join) {
      if (!table && field) {
        joinCoaleise.push(db.raw(`${field} AS ${alias || field}`));
        continue;
      }

      const orderByStr = orderBy ? `ORDER BY ${orderBy}` : '';
      const limitStr = limit ? `LIMIT ${limit}` : '';
      const lang = table === 'lang' && this.lang && this.lang.match(/^\w{2}$/) ? `AND lang='${this.lang}'` : '';
      const ff = fields?.map((item: any) => (typeof item === 'string'
        ? `'${item}', "${as || table}"."${item}"`
        : `'${Object.keys(item)[0]}', ${Object.values(item)[0]}`));
      const f2 = ff ? `json_build_object(${ff.join(', ')})` : `"${as || table}".*`;
      const f3 = field || `jsonb_agg(${f2})`;
      const wb: any = {};
      if (whereBindings) {
        if (!c) continue;
        const envAll = c.env;
        const query = c.req.query();
        const params = c.req.param();
    
        const env = { ...envAll };
        [
          'db',
          'dbWrite',
          'dbTables',
          'error',
          'getErrorByMessage',
          'log',
        ].map((key) => delete env[`${key}`]);

        const dd: any = flattening({ env, params, query });
        for (const [k, v] of Object.entries(whereBindings)) wb[`${k}`] = dd[`${v}`] || null;
      }

      const leftJoinStr = !leftJoin ? ''
        : typeof leftJoin === 'string' ? `LEFT JOIN ${leftJoin}`
          : `LEFT JOIN "${leftJoin[0]}" ON ${leftJoin[1]} = ${leftJoin[2]}`;

      const index = typeof byIndex === 'number' ? `[${byIndex}]` : '';
      const schemaStr = !schema ? '' : `"${schema}".`;
      const dValue = defaultValue ? `'${defaultValue}'` : 'NULL';

      const coaliseWhere = `COALESCE( ( SELECT ${f3} FROM (
        SELECT * FROM ${schemaStr}"${table}" AS "${as || table}"
        ${leftJoinStr}
        WHERE ${where} ${lang}
        ${orderByStr}
        ${limitStr}
      ) "${as || table}")${index}, ${dValue})`;

      this.coaliseWhere = { ...this.coaliseWhere, [`${alias || table}`]: coaliseWhere };
      this.coaliseWhereReplacements = { ...this.coaliseWhereReplacements, ...wb };

      let sqlToJoin = `${coaliseWhere} AS "${alias || table}"`;
      if (this.includeDeleted && this.deletedReplacements && this.rows.isDeleted) {
        const replaceWith = this.deletedReplacements[`${table}`] || this.deletedReplacements[`${as}`] || this.deletedReplacements[`${alias}`];
        if (typeof replaceWith !== 'undefined') {
          sqlToJoin = `CASE WHEN "${this.table}"."isDeleted" THEN ${replaceWith} ELSE ${coaliseWhere} END AS "${alias || table}"`;
        }
      }

      joinCoaleise.push(db.raw(sqlToJoin, wb));
    }

    if (c.req.query()._search && this.searchFields.length) {
      const searchColumnsStr = this.searchFields.map((name: any) => {
        const searchName = this.langJoin[`${name}`] || `"${name}"`;
        return `COALESCE(${searchName} <-> :_search, 1)`;
        // return `COALESCE(${searchName} <-> :_search, 1) + COALESCE("${name}" <-> :_search, 1)`;
      }).join(' + ');
      joinCoaleise.push(db.raw(`(${searchColumnsStr})/${this.searchFields.length} as _search_distance`, {...c.req.query(), lang: this.lang }));
      if (!_sort) this.res.orderBy('_search_distance', 'ASC');
    }

    this.res.column(joinCoaleise.concat(this.fieldsRaw || []));
  }

  checkDeleted() {
    if (this.includeDeleted || !this.rows.isDeleted) return;
    this.res.where({ [`${this.table}.isDeleted`]: false });
  }

  getJoinFields() {
    return this.join.reduce((acc: any, { alias, table, field }: any) => {
      let type = !field && 'ARRAY';
      if (!type) type = field.match(/::bool$/) && 'boolean';
      if (!type) type = field.match(/::int$/) && 'integer';
      if (!type) type = 'string';

      acc[alias || table] = type;
      return acc;
    }, {});
  }

  deleteHiddenFieldsFromResult(result: any, hiddenFields: any) {
    if (!hiddenFields) return;

    const isOwner = this.user?.id && result[`${this.userIdFieldName}`] === this.user?.id;
    hiddenFields[isOwner ? 'owner' : 'regular'].map((key: string) => delete result[`${key}`]);
  }

/** return data from table. Use '_fields', '_sort', '_start', '_limit' options
 * examples:
 * - second page, 1 record per page, sort by title desc, only id and title fields:
 *   /ships?_fields=id,title&_sort=-title&_page=2&_limit=1
 * - skip 100 records, get next 10 records: /ships?_skip=100&_limit=10
 * - search by id and title: /ships?_fields=title&id=2&title=second data
 * - search by multiply ids: /ships?_fields=id&id=1&id=3
 * - search where not: /ships?_fields=title&title!=_e%25 d_ta
 * - search by 'like' mask: /ships?_fields=title&title~=_e%25 d_ta
 * - search from-to: /ships?_from_year=2010&_to_year=2020
 */

  optionsGet() {
    const fields: any = {};
    const fieldsSearchLike: any = {};
    const fieldsFromTo: any = {};
    const fieldsNull: any = {};
    for (const [key, data] of Object.entries(this.dbTables || {})) {
      if (!data) continue;
      fields[`${key}`] = data.data_type;
      if (data.data_type === 'string') fieldsSearchLike[`${key}~`] = data.data_type;
      if (data.is_nullable === 'YES') {
        fieldsNull[`_null_${key}`] = 'string';
        fieldsNull[`_not_null_${key}`] = 'string';
      }
      if (data.data_type !== 'boolean' && data.data_type !== 'file') {
        fieldsFromTo[`_from_${key}`] = data.data_type;
        fieldsFromTo[`_to_${key}`] = data.data_type;
        fieldsFromTo[`_in_${key}`] = data.data_type;
        fieldsFromTo[`_not_in_${key}`] = data.data_type;
      }
    }

    const queryParameters = {
      ...fields,
      ...fieldsSearchLike,
      ...fieldsNull,
      ...fieldsFromTo,
      ...this.additionalFields?.get,
      _fields: {
        type: 'string',
        example: 'id,name',
      },
      _sort: {
        type: 'string',
        example: '-timeCreated,name,random()',
      },
      _join: {
        type: 'string',
        example: 'table1,alias1',
      },
      _limit: 'integer',
      _page: 'integer',
      _skip: 'integer',
      _lang: 'string',
      ...(this.searchFields.length && { _search: 'string' }),
    };
    return {
      tokenRequired: this.tokenRequired.get || this.access.read || this.accessByStatuses.read,
      ownerRequired: this.ownerRequired.get,
      rootRequired: this.rootRequired.get,
      joinFields: this.getJoinFields(),
      cache: this.cache,
      joinOnDemand: this.joinOnDemand,
      accessByStatuses: this.accessByStatuses.read,
      additionalFields: this.additionalFields.get,
      queryParameters,
      apiClientMethodNames: this.apiClientMethodNames,
    };
  }

  async get(c: Context) {
    const { result, meta } = await this.getRequestResult(c);

    c.set('meta', meta);
    c.set('result', result);
    c.set('relationsData', this.relations);
  }

  async getRequestResult(c: Context, q?: Record<string, string[]>): Promise<getResultType> {
    const { db, roles } = c.env;
    const { user } = c.var;

    this.roles = roles;
    this.user = user;

    const queries = q || c.req.queries();
    let queriesWithoutArrays: any = {};
    for (const [queryName, queryValue] of Object.entries(queries)) {
      queriesWithoutArrays[`${queryName}`] = queryValue?.length === 1 ? queryValue[0] : queryValue;
    }

    const {
      _fields, _sort, _page, _skip, _limit, _unlimited, _after,
      _lang, _search, _join, ...where
    } = queriesWithoutArrays;

    if (_lang) this.lang = _lang;
    this.rows = this.getTableRows(c);
    this.res = this.getDbWithSchema(c.env.db);

    this.fields({ c, _fields, _join, db, _sort });

    // Object.entries({ ...this.defaultWhere, ...where }).map(([cur, val]) => {
    //   const isInt = this.dbTables?.[`${cur}`]?.data_type === 'integer';
    //   const hasNaN = [].concat(val as never).find((item: any) => Number.isNaN(+item));
    //   if (isInt && hasNaN) throw new Error('INTEGER_REQUIRED');
    // });

    this.where({ ...this.defaultWhere, ...where }, db);

    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.res.andWhere(function (this: Knex.QueryBuilder) {
        this.whereRaw(whereStr);
      });
    }

    if (_search && this.searchFields.length) {
      const whereStr = this.searchFields.map((name: string) => {
        const searchName = this.langJoin[`${name}`] || `"${name}"`;
        return `${searchName} % :_search`;
        // return `${searchName} % :_search OR "${name}" % :_search`;
      }).join(' OR ');
      const lang = this.lang;
      this.res.andWhere(function (this: Knex.QueryBuilder) {
        this.whereRaw(whereStr, { _search, lang });
      });
    }

    this.checkDeleted();

    const total = +(await db.from({ w: this.res }).count('*'))[0].count;

    this.sort(_sort, db);

    const s = _sort || this.defaultSort;
    const sName = s?.replace(/^-/, '')
    const limit = getQueryLimit({ _limit, _unlimited });

    if (_after && limit && s && this.getTableRows(c)[`${sName}`]) {
      this.res.where(sName, s[0] === '-' ? '<' : '>', _after);
      this.res.limit(limit);
    }

    else this.pagination({
      _page, _skip, _limit: limit, _unlimited,
    });

    // if (_or) console.log(this.res.toSQL())

    const result = await this.res;

    const nextAfterData = result?.at(-1)?.[`${sName}`];
    const addAfterMs = s?.[0] === '-' ? '000' : '999';
    const nextAfter = nextAfterData instanceof Date ? new Date(nextAfterData).toISOString().replace('Z', `${addAfterMs}Z`) : nextAfterData;

    // const { sql, bindings } = this.res.toSQL();
    // const { rows : r } = await db.raw(`EXPLAIN ${sql}`, bindings);
    // const rrr = r.map(rr => Object.values(rr)).join('\n');
    // const r4 = rrr.match(/(Seq Scan.*?\n.*)/);
    // if (
    //   r4
    //   && !r4[1].match(/Seq Scan on users[\s\S]*Filter: \(id = \d\)$/)
    // ) console.log('CHECK SEQ SCAN\n', r4[1]);

    let meta: metaType = { total };
    if (_after) {
      meta = {
        ...meta,
        after: _after,
        nextAfter : nextAfter ? encodeURIComponent(nextAfter) : undefined,
      };
      meta = {
        ...meta,
        isFirstPage: false,
        isLastPage: !result.length || (limit ? result.length < +limit : false),
      };
    } else {
      const limit2 = +limit;
      const skip = +_skip || 0;
      const page = +_page || 1;
      const pages = !limit2 ? 1 : Math.ceil((total-skip) / limit2);
      meta = {
        ...meta,
        limit: limit2,
        skip,
        page,
        pages,
        nextAfter : page === 1 && nextAfter ? encodeURIComponent(nextAfter) : undefined,
        nextPage: page >= pages ? undefined : page + 1,
        isFirstPage: page <= 1,
        isLastPage: page >= pages,
      };
    }

    const hiddenFields = this.getHiddenFields();
    if (hiddenFields) {
      for(let i = 0; i < result.length; i++) {
        this.deleteHiddenFieldsFromResult(result[i], hiddenFields);
      }
    }

    return { result, meta };
  }

  optionsGetById() {
    return {
      tokenRequired: this.tokenRequired.get || this.access.read || this.accessByStatuses.read,
      ownerRequired: this.ownerRequired.get,
      rootRequired: this.rootRequired.get,
      joinFields: this.getJoinFields(),
      joinOnDemand: this.joinOnDemand,
      accessByStatuses: this.accessByStatuses.read,
      additionalFields: this.additionalFields.get,
      cache: this.cache,
      apiClientMethodNames: this.apiClientMethodNames,
    };
  }

  async getById(c: Context) {
    const { db, roles } = c.env;
    this.roles = roles;
    this.user = c.var.user;

    const { id } = c.req.param();

    const {
      _fields, _lang, _join, ...whereWithParams
    } = c.req.query();
    const where = Object.keys(whereWithParams).reduce(
      (acc: any, key: any) => {
        if (key[0] !== '_') {
          const isInt = this.dbTables?.[`${key}`]?.data_type === 'integer';
          const hasNaN = [].concat(whereWithParams[`${key}`] as never).find((item: any) => Number.isNaN(+item));
          if (isInt && hasNaN) throw new Error('INTEGER_REQUIRED');
          acc[`${key}`] = whereWithParams[`${key}`];
        }
        return acc;
      },
      {},
    );

    this.lang = _lang;

    this.rows = this.getTableRows(c);
    this.res = this.getDbWithSchema(c.env.db);

    if (this.dbTables?.id?.data_type === 'integer' && Number.isNaN(+id)) throw new Error('INTEGER_REQUIRED');

    this.where({ ...where, [`${this.table}.id`]: id }, db);

    if (this.defaultWhereRaw) {
      const whereStr = this.defaultWhereRaw;
      this.res.andWhere(function (this: Knex.QueryBuilder) {
        this.whereRaw(whereStr);
      });
    }

    this.checkDeleted();

    this.fields({
      c, _fields, _join, db,
    });

    const result = await this.res.first();

    this.deleteHiddenFieldsFromResult(result, this.getHiddenFields());

    c.set('result', result);
    c.set('relationsData', this.relations);
  }

  updateIncomingData(c: Context, data: any) {
    return Array.isArray(data) ? data.map((item: any) => this.updateData(c, item))
      : this.updateData(c, data);
  }

  updateData(c: Context, data: any) {
    const { user } = c.var;
    let result = { ...data };
    const rows = this.getTableRows(c);

    for (const [key, error_code] of Object.entries(this.requiredFields)) {
      if (!result[`${key}`]) throw new Error(error_code as string);
    }

    for (const key of this.readOnlyFields) {
      delete result[`${key}`];
    }

    result = { ...c.req.param(), ...result };

    for (const r of Object.keys(result)) {
      if (rows[`${r}`] && typeof result[`${r}`] !== 'undefined') continue;
      delete result[`${r}`];
    }

    if (rows.userId && user) result.userId = user.id;

    return result;
  }

  optionsAdd() {
    const schema = Object.entries(this.dbTables || {}).reduce((acc, [key, data]) => {
      const keyForbiddeen = this.readOnlyFields.includes(key);
      return keyForbiddeen ? acc : { ...acc, [key]: data };
    }, this.additionalFields?.add || {});

    return {
      tokenRequired: this.tokenRequired.add
        || this.access.create
        || this.accessByStatuses.create,
      ownerRequired: this.ownerRequired.add,
      rootRequired: this.rootRequired.add,
      readOnlyFields: this.readOnlyFields,
      requiredFields: Object.keys(this.requiredFields),
      accessByStatuses: this.accessByStatuses.add,
      apiClientMethodNames: this.apiClientMethodNames,
      schema,
    };
  }

  async add(c: Context) {
    const requestBody = await c.req.json();
    const bodyKeys = Object.keys(requestBody);
    const looksLikeArray = bodyKeys.length && bodyKeys.every((j, i) => i === +j);
    const body = looksLikeArray ? Object.values(requestBody) : requestBody;

    const data: any = this.updateIncomingData(c, body);

    for (const key of Object.keys(data)) {
      const isInt = this.dbTables?.[`${key}`]?.data_type === 'integer';
      const hasNaN = [].concat(data[`${key}`]).find((item: any) => item && Number.isNaN(+item));
      if (isInt && hasNaN) throw new Error('INTEGER_REQUIRED');

      data[`${key}`] = data[`${key}`] ?? null;
    }

    const result = await this.getDbWithSchema(c.env.dbWrite).insert(data).returning('*');

    c.set('result', result[0]);
    c.set('relationsData', this.relations);
  }

  optionsUpdate() {
    const schema = Object.entries(this.dbTables || {}).reduce((acc, [key, data]) => {
      const keyForbiddeen = this.readOnlyFields.includes(key);
      return keyForbiddeen ? acc : { ...acc, [key]: data };
    }, this.additionalFields?.update || {});

    return {
      tokenRequired: this.tokenRequired.update
        || this.access.update
        || this.accessByStatuses.update,
      ownerRequired: this.ownerRequired.update,
      rootRequired: this.rootRequired.update,
      readOnlyFields: this.readOnlyFields,
      accessByStatuses: this.accessByStatuses.update,
      additionalFields: this.additionalFields.update,
      apiClientMethodNames: this.apiClientMethodNames,
      schema,
    };
  }

  async update(c: Context) {
    const { db } = c.env;
    const where: whereParamsType = { ...c.req.param() };
    if (this.dbTables?.id?.data_type === 'integer' && Number.isNaN(+where.id)) throw new Error('INTEGER_REQUIRED');

    const rows = this.getTableRows(c);

    if (rows.isDeleted) where.isDeleted = false;

    const data = await c.req.json();

    for (const key of this.readOnlyFields) {
      delete data[`${key}`];
    }

    if (Object.keys(data).length) {
      if (rows.timeUpdated) data.timeUpdated = db.fn.now();

      await this.getDbWithSchema(c.env.dbWrite).update(data).where(where);
    }

    await this.getById(c);
  }

  optionsDelete() {
    return {
      tokenRequired: this.tokenRequired.delete
        || this.access.delete
        || this.accessByStatuses.delete,
      ownerRequired: this.ownerRequired.delete,
      rootRequired: this.rootRequired.delete,
      accessByStatuses: this.accessByStatuses.delete,
      apiClientMethodNames: this.apiClientMethodNames,
    };
  }

  async delete(c: Context) {
    const { user } = c.var;

    const where: whereParamsType = { ...c.req.param() };
    if (this.dbTables?.id?.data_type === 'integer' && Number.isNaN(+where.id)) throw new Error('INTEGER_REQUIRED');

    const rows = this.getTableRows(c);

    if (rows.isDeleted) where.isDeleted = false;

    const t = this.getDbWithSchema(c.env.dbWrite).where(where);
    const result = rows.isDeleted ? await t.update({ isDeleted: true }) : await t.delete();

    c.set('result', { ok: true });
    c.set('meta', { countDeleted: result });
  }
}
```

### src/index.ts
```ts
import CrudBuilder from './CrudBuilder';

export * from './types';
export { Routings } from './Routings';
export { CrudBuilder };
```

### src/Routings.ts
```ts
import { createFactory } from 'hono/factory';
import CrudBuilder from './CrudBuilder';
import type {
    CrudBuilderOptionsType,
    MiddlewareHandler,
    PushToRoutesParamsType,
    RoutesErrorsType,
    RoutesEmailTemplatesType,
    RoutesType,
    RoutingsOptionsType,
} from './types';

const factory = createFactory();

export class Routings {
    routes: RoutesType[] = [];
    routesPermissions: any = {};
    routesErrors: RoutesErrorsType = {};
    routesEmailTemplates: RoutesEmailTemplatesType = {};
    migrationDirs: string[] | unknown;

    constructor (options?: RoutingsOptionsType) {
        const { migrationDirs } = options || {};
        if (migrationDirs) this.migrationDirs = migrationDirs;
    }

    private pushToRoutes({ method, path, fnArr }: PushToRoutesParamsType) {
        for (const fn of fnArr) {
            const handlers = factory.createHandlers(fn);
            this.routes.push({ path, method, handlers });
        }
    }

    get(path: string, ...fnArr: MiddlewareHandler[]) {
        this.pushToRoutes({ method: 'GET', path, fnArr });
    }

    post(path: string, ...fnArr: MiddlewareHandler[]) {
        this.pushToRoutes({ method: 'POST', path, fnArr });
    }

    patch(path: string, ...fnArr: MiddlewareHandler[]) {
        this.pushToRoutes({ method: 'PATCH', path, fnArr });
    }

    put(path: string, ...fnArr: MiddlewareHandler[]) {
        this.pushToRoutes({ method: 'PUT', path, fnArr });
    }

    delete(path: string, ...fnArr: MiddlewareHandler[]) {
        this.pushToRoutes({ method: 'DELETE', path, fnArr });
    }

    use(path: string, ...fnArr: MiddlewareHandler[]) {
        this.pushToRoutes({ path, fnArr });
    }

    all(...fnArr: MiddlewareHandler[]) {
        this.pushToRoutes({ path: '*', fnArr });
    }

    crud(params: CrudBuilderOptionsType) {
        const { table, prefix, permissions } = params;
        // const { table, prefix, tag, relations, responseSchema, forbiddenActions = [] } = params;

        const p = `/${prefix || table}`.replace(/^\/+/, '/');

        this.get(`${p}`, async (c) => {
            const crudBuilder = new CrudBuilder(params);
            await crudBuilder.get(c);
        });
        this.post(`${p}`, async (c) => {
            const crudBuilder = new CrudBuilder(params);
            await crudBuilder.add(c);
        });
        this.get(`${p}/:id`, async (c) => {
            const crudBuilder = new CrudBuilder(params);
            await crudBuilder.getById(c);
        });
        this.put(`${p}/:id`, async (c) => {
            const crudBuilder = new CrudBuilder(params);
            await crudBuilder.update(c);
        });
        this.patch(`${p}/:id`, async (c) => {
            const crudBuilder = new CrudBuilder(params);
            await crudBuilder.update(c);
        });
        this.delete(`${p}/:id`, async (c) => {
            const crudBuilder = new CrudBuilder(params);
            await crudBuilder.delete(c);
        });

        if (permissions?.protectedMethods) {
            const updteRoutesPermissions = (path: string, method: string) => {
                const key = `${method} ${path}`;
                if (!this.routesPermissions[`${key}`]) this.routesPermissions[`${key}`] = [];
                this.routesPermissions[`${key}`].push(`${p.replace(/^\//, '')}.${method.toLowerCase()}`);
            };

            const methods = permissions?.protectedMethods?.[0] === '*' ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] : permissions?.protectedMethods;
            for (const method of methods) {
                if (method === 'POST' || method === 'GET') updteRoutesPermissions(`${p}`, method);
                if (method !== 'POST') updteRoutesPermissions(`${p}/:id`, method);
            }
        }
    }

    errors(err: RoutesErrorsType | RoutesErrorsType[]) {
        const errArr = Array.isArray(err) ? err : [err];
        errArr.map((e) => this.routesErrors = {...this.routesErrors, ...e});
    }

    emailTemplates(template: RoutesEmailTemplatesType) {
        this.routesEmailTemplates = { ...this.routesEmailTemplates, ...template };
    }
}
```

### src/types.ts
```ts
import type { Context, MiddlewareHandler, Handler } from 'hono';
import type { H } from 'hono/types';

export type { MiddlewareHandler, Handler };

export type MethodsType = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'][number];

export type MethodPathType = {
    method?: MethodsType;
    path: string;
};

export type RoutesType = MethodPathType & {
    handlers: (Handler | MiddlewareHandler)[];
};

export type PushToRoutesParamsType = MethodPathType & {
    fnArr: H<any, any, {}, any>[];
};

export type RoutesErrorsType = {
    [key: string]: {
        code: number,
        status: number,
        description?: string,
    }    
};

export type EmailTemplatesType = {
    subject?: string;
    text?: string;
    html?: string;
};

export type RoutesEmailTemplatesType = Record<string, EmailTemplatesType>;

export type DbOptionsType = {
    migrationDirs?: string[];
};

export type RoutingsOptionsType = {
    migrationDirs?: string[];
};

export type DbTablesType = {
    data_type: string;
    is_nullable: string;
    [key: string]: any;
};

export type stringRecordType = Record<string, string>;

export type fieldRecordType = Record<string, fieldType>;

export type whereParamsType = stringRecordType & { isDeleted?: boolean };

export type fieldType = string | number | boolean;

export type CrudBuilderJoinType = {
    table: string;
    schema?: string;
    alias?: string;
    as?: string;
    where?: string;
    whereBindings?: stringRecordType;
    defaultValue?: fieldType;
    fields?: string[];
    field?: string;
    orderBy?: string;
    limit?: number;
    leftJoin?: string | string[];
    byIndex?: number;
    permission?: string;
};

export type CrudBuilderPermissionsType = {
    protectedMethods?: (MethodsType | '*')[];
    owner?:  string[];
    fields?: {
        viewable?: Record<string, string[]>;
        editable?: Record<string, string[]>;
    };
};

export type CrudBuilderOptionsType = {
    c?: Context;
    table: string;
    prefix?: string;
    schema?: string;
    aliases?: stringRecordType;
    join?: CrudBuilderJoinType[];
    joinOnDemand?: CrudBuilderJoinType[];
    leftJoin?: string[];
    leftJoinDistinct?: string[];
    lang?: string;
    translate?: string[];
    searchFields?: string[];
    requiredFields?: string[];
    hiddenFields?: string[];
    readOnlyFields?: string[];
    showFieldsByPermission?: Record<string, string[]>;
    permissions?: CrudBuilderPermissionsType;

    defaultWhere?: fieldRecordType;
    defaultWhereRaw?: string;
    defaultSort?: string;
    sortRaw?: string;
    fieldsRaw?: any;
    includeDeleted?: boolean;
    deletedReplacements?: fieldRecordType;
    relations?: Record<string, CrudBuilderOptionsType>;
    relationIdName?: string;

    tokenRequired?: any;
    ownerRequired?: any;
    rootRequired?: any;
    access?: any;
    accessByStatuses?: any;
    dbTables?: any;
    cache?: any;
    userIdFieldName?: any;
    additionalFields?: any;
    apiClientMethodNames?: any;
};

export type metaType = {
    total: number;
    limit?: number;
    skip?: number;
    page?: number;
    nextPage?: number;
    pages?: number;
    after?: string;
    nextAfter?: string;
    isFirstPage?: boolean;
    isLastPage?: boolean;
};

export type getResultType = {
    result: any[];
    meta: metaType;
    relations?: Record<string, any[]>;
    error?: boolean;
}
```

