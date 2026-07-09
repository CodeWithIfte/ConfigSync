# ConfigSync — Shopify App Build Plan

## Overview

Build a Shopify app (React Router v7 + TypeScript + Prisma/SQLite) for a Magento-to-Shopify migration. The app handles:
1. **Product Configurator Engine** — unlimited product options with conditional visibility and price adders
2. **Order Sync to HoodslyHub** — webhook-driven order sync with retry logic

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend/Framework | React Router v7 (existing) |
| Language | TypeScript (existing) |
| Database | Prisma + SQLite (existing) |
| Admin UI | Polaris Web Components (`s-*` custom elements, existing convention) |
| Cart Price Adders | Shopify Cart Transform Function (JS) |
| Storefront UI | Theme App Extension (Liquid + JS) |
| Webhooks | App-specific webhooks in `shopify.app.toml` |
| Validation | Zod |

---

## Project Structure

```
config-sync/
├── prisma/
│   └── schema.prisma               # Add SyncLog model
├── app/
│   ├── types/
│   │   └── configurator.ts         # Configurator type definitions
│   ├── services/
│   │   ├── configurator.server.ts  # Metafield CRUD via Admin GraphQL
│   │   └── hoodsly-sync.server.ts  # Sync + retry with exponential backoff
│   ├── routes/
│   │   ├── app.tsx                 # Update nav links
│   │   ├── app._index.tsx          # Dashboard
│   │   ├── app.configurator.$id.tsx # Admin configurator editor
│   │   ├── app.sync-log.tsx        # Admin sync status log
│   │   ├── webhooks.orders.create.tsx # orders/create webhook
│   │   └── mock.hoodsly-hub.tsx    # Mock endpoint
│   └── shopify.server.ts           # Existing — add webhook registrar
├── extensions/
│   ├── product-configurator/       # Theme App Extension (storefront)
│   └── cart-transform/             # Shopify Function (price calculation)
├── shopify.app.toml                # Add metafield defs, webhooks, scopes
├── .env.example
└── README.md
```

---

## Data Models

### Configurator Definition (stored as product metafield `namespace:"app", key:"configurator"`, type `json`)

```typescript
type FieldType = "dropdown" | "radio" | "text" | "info_block";

interface ConfiguratorOption {
  label: string;
  value: string;
  priceDelta: number;   // cents
}

interface VisibilityCondition {
  fieldId: string;
  operator: "equals" | "not_equals";
  value: string;
}

interface ConfiguratorField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  displayOrder: number;
  options?: ConfiguratorOption[];
  conditions?: VisibilityCondition[];  // AND logic
  defaultValue?: string;
  placeholder?: string;   // for text
  content?: string;       // for info_block
}

interface ConfiguratorDefinition {
  fields: ConfiguratorField[];
}
```

### Prisma — SyncLog

```prisma
model SyncLog {
  id            String   @id @default(uuid())
  shop          String
  orderId       String   @unique
  status        String   // "synced" | "pending" | "failed" | "permanently_failed"
  retryCount    Int      @default(0)
  lastAttemptAt DateTime?
  nextRetryAt   DateTime?
  errorMessage  String?
  payload       String   // JSON
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

---

## Phase 1 — Foundation

1. Update `prisma/schema.prisma` — add `SyncLog` model
2. Run `prisma migrate dev` to create the table
3. Create `app/types/configurator.ts` — TypeScript types + Zod schemas
4. Create `app/services/configurator.server.ts`:
   - `getConfigurator(productId, admin)` — fetch metafield via GraphQL
   - `saveConfigurator(productId, definition, admin)` — upsert metafield via `metafieldsSet`
5. Create `app/services/hoodsly-sync.server.ts`:
   - `syncOrder(orderPayload)` — POST to `/mock/hoodslyhub`
   - Exponential backoff: 2s → 4s → 8s
   - Update `SyncLog` status. After 3 failures → `"permanently_failed"`
6. Create `app/routes/mock.hoodsly-hub.tsx`:
   - `POST /mock/hoodslyhub` — log and return 200
   - `?fail=true` — return 500 to simulate failure
   - `GET /mock/hoodslyhub` — return status info
7. Update `shopify.app.toml`:
   - Add metafield definition: `product.metafields.app.configurator` (type `json`, `merchant_read_write`)
   - Add `orders/create` webhook subscription
   - Update scopes: `write_orders, read_orders`

---

## Phase 2 — Task 1: Product Configurator

1. Create `app/routes/app.configurator.$id.tsx`:
   - Route: `/app/configurator/:productId`
   - Load configurator definition from product metafield
   - Form using Polaris Web Components:
     - Product selector (search/combobox at top)
     - Field list: each field has type, label, required, order, options, conditions
     - "Add Field" / "Remove Field" buttons
     - `ui-save-bar` for save/discard
   - Save writes to product metafield via Admin GraphQL `metafieldsSet`
2. Create `extensions/cart-transform/` (Shopify Function):
   - `shopify.function.extension.toml` (type `cart_transform`)
   - `input.graphql` — query line item properties + product metafield
   - `src/run.js` — parse `_configurator` property, look up price deltas, output `cost.subtotalAdjustments`
3. Create `extensions/product-configurator/` (Theme App Extension):
   - `shopify.extension.toml` (type `theme`)
   - `blocks/configurator.liquid`:
     - Access `product.metafields.app.configurator.value`
     - Render each field: dropdown/radio/text/info_block
     - Each field element has `data-field-id`, `data-conditions`, `data-price-delta` attributes
   - `snippets/configurator.js`:
     - Conditional show/hide based on conditions (AND logic)
     - Calculate total price adder
     - On "Add to Cart": gather selections into hidden form data as JSON property `_configurator`
4. Update `app/routes/app.tsx` nav — add "Configurator" link

---

## Phase 3 — Task 2: Order Sync

1. Create `app/routes/webhooks.orders.create.tsx`:
   - Receive `orders/create` webhook
   - Parse: order ID, customer email, line items (incl. properties), shipping address, total
   - Create `SyncLog` record with status `"pending"`
   - Call `syncOrder()`
   - Return 200
2. Create `app/routes/app.sync-log.tsx`:
   - Route: `/app/sync-log`
   - Table: Order ID, Status (badge), Retry Count, Last Attempt, Error, Actions
   - Search by order ID, filter by status
   - "Retry" button (POST action) for failed/permanently_failed orders
3. Update `app/routes/app.tsx` nav — add "Sync Log" link

---

## Files to Create/Modify (Complete List)

| Action | File |
|---|---|
| Modify | `prisma/schema.prisma` — add SyncLog |
| Modify | `shopify.app.toml` — metafield, webhook, scopes |
| **New** | `app/types/configurator.ts` |
| **New** | `app/services/configurator.server.ts` |
| **New** | `app/services/hoodsly-sync.server.ts` |
| Modify | `app/routes/app.tsx` — update nav |
| Modify | `app/routes/app._index.tsx` — dashboard |
| **New** | `app/routes/app.configurator.$id.tsx` |
| **New** | `app/routes/app.sync-log.tsx` |
| **New** | `app/routes/webhooks.orders.create.tsx` |
| **New** | `app/routes/mock.hoodsly-hub.tsx` |
| **New** | `extensions/product-configurator/shopify.extension.toml` |
| **New** | `extensions/product-configurator/blocks/configurator.liquid` |
| **New** | `extensions/product-configurator/snippets/configurator.js` |
| **New** | `extensions/cart-transform/shopify.function.extension.toml` |
| **New** | `extensions/cart-transform/input.graphql` |
| **New** | `extensions/cart-transform/src/run.js` |
| **New** | `.env.example` |
| Modify | `README.md` — setup instructions + incomplete tasks note |

---

## Key Design Decisions

- **Configurator stored as product metafield (JSON)** — no separate DB table, travels with product data natively
- **Price adders via Cart Transform Function** — bypasses Shopify's 100-variant limit; unlimited options with individual deltas
- **Theme App Extension for storefront** — merchant installs as app block; no theme code modification needed
- **In-process retry** — `setTimeout`-based exponential backoff (2s/4s/8s), status persisted to SQLite; no external queue needed
- **Mock endpoint with `?fail=true`** — test failure + retry behavior easily
- **Polaris Web Components (`s-*`)** — already the project convention over React Polaris

---

## Not Implemented (Deferred)

Bonus tasks deferred per discussion:
- Order Report (filtered by customer tag + date range, CSV export)
- HubSpot integration
- BirdEye review request after fulfillment
- Rush Order Management priority queue

---

## .env.example

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=write_products,write_metaobjects,write_metaobject_definitions,write_orders,read_orders
SHOPIFY_APP_URL=
HOODSLY_HUB_URL=http://localhost:3000/mock/hoodslyhub
```

---

## Verification

1. `npm run typecheck` — TypeScript passes
2. `npm run lint` — ESLint passes
3. `shopify app dev` — app starts and tunnel is accessible
4. Admin UI: navigate to `/app/configurator/:id` → create configurator → save
5. Storefront: add configured product to cart → verify price (base + adders)
6. Checkout → order appears in admin with line item properties
7. Order sync log shows `"synced"` status
8. `?fail=true` on mock → log shows retries → `"permanently_failed"` → manual retry works
