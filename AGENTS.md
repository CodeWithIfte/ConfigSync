# ConfigSync — Shopify App Build Plan

## Environment Constraints

- **Node version:** v20.20.2 (local) — `@shopify/polaris-types` requires >=22.18.0 but this is a devDep, so app code works
- **Package manager:** pnpm 9.0.0 — `@shopify/polaris-types` requires pnpm >=10.2.0 but this is a devDep
- **Workaround for installs:** Use `pnpm add -w <pkg> --ignore-engines` to bypass engine checks for devDeps
- **Prisma commands:** Run `npx prisma migrate dev` directly (works with node v20)
- **Do NOT run pnpm or prisma commands autonomously** — ask the user to execute them

## Overview

Build a Shopify app (React Router v7 + TypeScript + Prisma/SQLite) for a Magento-to-Shopify migration. The app handles:
1. **Product Configurator Engine** — unlimited product options with conditional visibility, price adders, and rule-based product assignment
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
│   └── schema.prisma               # Add Option, OptionSet, OptionSetAssignment, SyncLog models
├── app/
│   ├── types/
│   │   └── configurator.ts         # Configurator type definitions
│   ├── services/
│   │   ├── configurator.server.ts  # Option & OptionSet CRUD via Admin GraphQL + metafields
│   │   └── hoodsly-sync.server.ts  # Sync + retry with exponential backoff
│   ├── routes/
│   │   ├── app.tsx                 # Update nav links
│   │   ├── app._index.tsx          # Dashboard — list Option Sets
│   │   ├── app.option-sets.$id.tsx # Admin: create/edit Option Set (configurator)
│   │   ├── app.options.$id.tsx     # Admin: create/edit individual reusable Options
│   │   ├── app.sync-log.tsx        # Admin: sync status log
│   │   ├── webhooks.orders.create.tsx # orders/create webhook
│   │   └── mock.hoodsly-hub.tsx    # Mock endpoint
│   └── shopify.server.ts           # Existing
├── extensions/
│   ├── product-configurator/       # Theme App Extension (storefront)
│   └── cart-transform/             # Shopify Function (price calculation)
├── shopify.app.toml                # Add metafield defs, webhooks, scopes
├── .env.example
└── README.md
```

---

## Data Models

### Design Rationale

The configurator has two distinct scalability concerns:

1. **Product assignment resolution** — "Which OptionSets apply to product X?" This is a high-frequency query (every storefront page load). We normalize assignments into a separate indexed table (`OptionSetAssignment`) so this is an indexed O(log n) lookup instead of O(n) JSON scan.

2. **Configurator field definitions** — Read/written as a complete document per Option Set. Each Option Set has a small number of fields (typically 10–30). Storing `fields` as JSON avoids 3 extra tables (`OptionSetField`, `FieldOption`, `FieldCondition`) with complex joins for minimal query benefit. The JSON is validated with Zod before save.

### Option (stored in Prisma — reusable field templates)

```prisma
model Option {
  id          String   @id @default(uuid())
  title       String
  type        String   // "dropdown" | "radio" | "text" | "info_block"
  label       String
  required    Boolean  @default(false)
  options     String?  // JSON array of ConfiguratorOption (for dropdown/radio)
  placeholder String?  // for text
  content     String?  // for info_block
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### OptionSet (stored in Prisma)

```prisma
model OptionSet {
  id              String    @id @default(uuid())
  title           String
  status          Boolean   @default(true)
  rank            Int       @default(0)
  assignmentType  String    // "manual" | "automatic"
  autoCollections String?   // JSON array of collection IDs (for automatic assignment)
  autoTags        String?   // Comma-separated product tags (for automatic)
  autoVendor      String?   // Vendor name (for automatic)
  fields          String    // JSON array of ConfiguratorField (the configurator definition)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  assignments     OptionSetAssignment[]

  @@index([status])
  @@index([assignmentType])
}
```

### OptionSetAssignment (normalized product-to-OptionSet mapping)

```prisma
model OptionSetAssignment {
  id          String    @id @default(uuid())
  optionSetId String
  optionSet   OptionSet @relation(fields: [optionSetId], references: [id], onDelete: Cascade)
  productId   String    // Shopify product GID

  @@unique([optionSetId, productId])
  @@index([productId])
  @@index([optionSetId])
}
```

This enables O(log n) lookups:

```sql
-- "Which OptionSets apply to product X?"
SELECT * FROM OptionSetAssignment 
WHERE productId = 'gid://shopify/Product/123'
-- Indexed on [productId] — fast
```

vs. the old design which required loading every OptionSet and parsing JSON arrays.

### ConfiguratorField (stored as JSON in OptionSet.fields)

```typescript
type FieldType = "dropdown" | "radio" | "text" | "info_block";

type AddOnType = "none" | "price" | "product";

interface ConfiguratorOption {
  label: string;
  value: string;
  isDefault: boolean;
  addOnType: AddOnType;       // "none" | "price" | "product"
  priceDelta?: number;        // cents, when addOnType = "price"
  addOnProductId?: string;    // Shopify product GID, when addOnType = "product"
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
  defaultValue?: string;        // references ConfiguratorOption.value
  placeholder?: string;         // for text
  content?: string;             // for info_block
}
```

### SyncLog (stored in Prisma)

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

  @@index([status])
  @@index([orderId])
}
```

---

## Phase 1 — Foundation

1. Update `prisma/schema.prisma` — add `Option`, `OptionSet`, `OptionSetAssignment`, and `SyncLog` models
2. Run `prisma migrate dev` to create the tables
3. Create `app/types/configurator.ts` — TypeScript types + Zod schemas
4. Create `app/services/configurator.server.ts`:
   - `getOptionSets(admin)` — list all Option Sets
   - `getOptionSet(id, admin)` — fetch a single Option Set
   - `saveOptionSet(data, admin)` — create/update Option Set
   - `deleteOptionSet(id, admin)` — remove Option Set
   - `getOptions(admin)` — list all reusable Options
   - `getOption(id, admin)` — fetch a single Option
   - `saveOption(data, admin)` — create/update Option
   - `deleteOption(id, admin)` — remove Option
   - `assignConfiguratorToProduct(productId, optionSet, admin)` — write configurator metafield to a product via `metafieldsSet`
   - `syncManualAssignments(optionSet, admin)` — write configurator metafield to all manually-assigned products
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

### 2a. Option Creator (reusable field definitions)

1. Type selector step:
   - When clicking "Create new option", first show a type selector overlay/page
   - Four type cards/buttons: dropdown, radio, text, info_block
   - After selecting, navigate to `/app/options/new?type=dropdown`

2. Create `app/routes/app.options.$id.tsx`:
   - Route: `/app/options/:id` (where `id` = "new" for creation)
   - Reads `?type=` query param to pre-select the field type
   - Form fields:
     - **Title** — text field (internal name for the Option)
     - **Label** — text input (displayed to customers)
     - **Required** — toggle
   - For **dropdown / radio**: options list with add/remove rows
     - Each option row has:
       - **Label** — text input (what customer sees)
       - **Value** — text input (internal value)
       - **isDefault** — checkbox (pre-selected in storefront)
       - **Add-on type** — select: "None" | "Price" | "Product"
       - If "Price": **$ price** — number input (positive integer, cents)
       - If "Product": **product selector** — search/combobox to pick a Shopify product
   - For **text**: placeholder input
   - For **info_block**: content textarea
   - Save/Discard via `ui-save-bar`
   - On save: creates/updates `Option` record in Prisma
   - Redirects back to options list or returns to option-set editor via query param (`?returnTo=/app/option-sets/:id`)

### 2b. Option Set Editor (configurator builder)

Flesh out `app/routes/app.option-sets.$id.tsx` (existing route):
- **Title & Rank** — text field and number field (existing)
- **Status** — active/draft toggle
- **Fields section** — replaces the placeholder "Options" section:
  - List of fields with display order (number inputs for reordering)
  - Each field shows: type badge, label, required indicator, expand for details
  - **"Add inline field"** — creates a new ConfiguratorField directly in the fields array (type, label, options, etc.)
    - For dropdown/radio: each option row has label, value, isDefault, add-on type (none/price/product), price or product selector
  - **"Add existing option"** — opens a picker/modal listing saved Options from Prisma; selecting one snapshots its definition into the fields array
  - **"Create new option"** — navigates to `/app/options/new?returnTo=/app/option-sets/:id`
  - "Remove Field" button per field
- **Rules section** — conditional visibility per field (existing placeholder → working):
  - Expand each field to edit conditions
  - Each condition: fieldId selector, operator (equals/not_equals), value
  - "Add Condition" / "Remove Condition" per field
- **Add to products sidebar** (existing placeholder → working):
  - `<s-choice-list>` with Manual / Automatic
  - Manual: product search/combobox (multi-select) to pick specific products
  - Automatic: collection selector(s), tags input, vendor selector/dropdown
- **Save/Discard** via existing `ui-save-bar`
- On save:
  - Creates/updates `OptionSet` record in Prisma
  - Replaces `OptionSetAssignment` rows for this OptionSet (delete old, insert new)
  - For manual assignment: writes configurator metafield to each selected product via Admin GraphQL `metafieldsSet`
  - For automatic: stores the rules, no metafield write (resolved at storefront render time)

### 2c. Dashboard

Update `app/routes/app._index.tsx`:
- Replace template boilerplate
- List all Option Sets with title, status (badge), assignment type, product count, created date
- "Create Option Set" button → navigates to `/app/option-sets/new`
- Edit, delete, duplicate actions per row

### 2d. Nav

Update `app/routes/app.tsx` nav:
- "Option Sets" → `/app`
- "Options" → `/app/options` (if a list view exists) or skip for now
- "Sync Log" → `/app/sync-log`

### 2e. Storefront

1. Create `extensions/cart-transform/` (Shopify Function):
   - `shopify.function.extension.toml` (type `cart_transform`)
   - `input.graphql` — query line item properties + product metafield
   - `src/run.js` — parse `_configurator` property, look up price deltas, output `cost.subtotalAdjustments`

2. Create `extensions/product-configurator/` (Theme App Extension):
   - `shopify.extension.toml` (type `theme`)
   - `blocks/configurator.liquid`:
     - Access `product.metafields.app.configurator.value`
     - Render each field: dropdown/radio/text/info_block
     - Each field element has `data-field-id`, `data-conditions`, `data-price-delta` attributes
   - `snippets/configurator.js`:
     - Conditional show/hide based on conditions (AND logic)
     - Calculate total price adder
     - On "Add to Cart": gather selections into hidden form data as JSON property `_configurator`

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
| Modify | `prisma/schema.prisma` — add Option, OptionSet, OptionSetAssignment, SyncLog |
| Modify | `shopify.app.toml` — metafield, webhook, scopes |
| **New** | `app/types/configurator.ts` |
| **New** | `app/services/configurator.server.ts` |
| **New** | `app/services/hoodsly-sync.server.ts` |
| Modify | `app/routes/app.tsx` — update nav |
| Modify | `app/routes/app._index.tsx` — list Option Sets |
| Modify | `app/routes/app.option-sets.$id.tsx` — full configurator editor |
| **New** | `app/routes/app.options.$id.tsx` — Option creator |
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

- **Option as reusable template** — standalone Options are created once in `/app/options/:id` and can be snapshotted into any Option Set. No live references — Option Set stores the full field definition at time of addition
- **Option Set as primary entity** — configurator is defined as a reusable Option Set, not per-product. Matches existing app UI pattern
- **Manual assignment normalized into `OptionSetAssignment`** — indexed by `productId` for O(log n) lookup. Replaces the previous JSON-in-column approach which required O(n) full table scans
- **`fields` kept as JSON** — each Option Set has a small number of fields (10–30). Normalizing into separate tables (OptionSetField, FieldOption, FieldCondition) adds join complexity without meaningful query benefit at this scale
- **Manual assignment writes product metafield** — for manually-assigned products, the configurator JSON is written to the product metafield so the storefront can read it directly
- **Automatic assignment resolved at render time** — Theme App Extension evaluates automatic rules (collections, tags, vendor) against the current product at render time. This avoids needing to update dozens of product metafields when rules change
- **Price adders via Cart Transform Function** — bypasses Shopify's 100-variant limit; unlimited options with individual deltas
- **In-process retry** — `setTimeout`-based exponential backoff (2s/4s/8s), status persisted to SQLite; no external queue needed
- **Mock endpoint with `?fail=true`** — test failure + retry behavior easily
- **Polaris Web Components (`s-*`)** — already the project convention over React Polaris

---

## Known Deployment Constraints

- **`orders/create` webhook** — Removed from `shopify.app.toml` because it requires Shopify protected customer data approval before deployment. The route handler (`app/routes/webhooks.orders.create.tsx`) and `HOODSLY_HUB_URL` env var remain in place. Re-add the webhook subscription after the app passes protected customer data review. See https://shopify.dev/docs/apps/launch/protected-customer-data
- **`write_orders,read_orders` scopes** — Also removed from `shopify.app.toml` and `.env.example` for the same reason. Re-add after protected customer data approval.

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
SCOPES=write_products,write_metaobjects,write_metaobject_definitions
SHOPIFY_APP_URL=
HOODSLY_HUB_URL=http://localhost:3000/mock/hoodslyhub
```

---

## Verification

1. `npm run typecheck` — TypeScript passes
2. `npm run lint` — ESLint passes
3. `shopify app dev` — app starts and tunnel is accessible
4. Create a reusable Option (color dropdown with Red +$5), save
5. Create Option Set → add existing Option (color) → add inline field (size radio with Large +$10) → set conditions → assign manually to a product → save
6. Storefront: product page shows configurator → configure → add to cart
7. Verify cart price = base + selected adders
8. Complete checkout → order shows line item properties in admin
9. Order sync log shows `"synced"` status
10. `?fail=true` on mock → log shows retries → `"permanently_failed"` → manual retry works
