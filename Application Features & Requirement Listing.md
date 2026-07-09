# ConfigSync — Application Features & Requirement Listing

## 1. Overview

ConfigSync is a Shopify embedded app built on React Router v7 that enables Magento-to-Shopify migration by providing:

1. **Product Configurator Engine** — unlimited product options with conditional visibility, price adders, and rule-based product assignment
2. **Order Sync to HoodslyHub** — Reliable order data delivery to an external system with retry logic and an admin dashboard.

---

## 2. Data Model

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

## 3. Functional Requirements

### 3.1 Product Configurator — Admin UI

#### FR-1: Option Creator (reusable field definitions)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-1.1 | Clicking "Create new option" first shows a type selector overlay with 4 cards: dropdown, radio, text, info_block | P0 | Precedes navigation |
| FR-1.2 | After selecting type, navigate to `/app/options/new?type=dropdown` | P0 | Type pre-selected from query param |
| FR-1.3 | Route `/app/options/:id` (`id` = "new" for creation) reads `?type=` param to pre-select type | P0 | |
| FR-1.4 | **Title** text field (internal name for this Option template) | P0 | |
| FR-1.5 | **Label** text input (displayed to customer) | P0 | |
| FR-1.6 | **Required** toggle | P0 | |
| FR-1.7 | For **dropdown** and **radio**: options list with add/remove rows | P0 | |
| FR-1.8 | Each option row has: **Label** (text), **Value** (text), **isDefault** (checkbox) | P0 | |
| FR-1.9 | Each option row has **Add-on type** selector: "None" \| "Price" \| "Product" | P0 | |
| FR-1.10 | If add-on type is "Price": show **$ price** number input (positive integer, cents) | P0 | |
| FR-1.11 | If add-on type is "Product": show **product selector** search/combobox to pick a Shopify product | P1 | Product search via Admin GraphQL |
| FR-1.12 | For **text**: placeholder text input | P1 | |
| FR-1.13 | For **info_block**: content textarea (HTML/markdown) | P1 | |
| FR-1.14 | Save/Discard via `ui-save-bar` | P0 | |
| FR-1.15 | On save: creates/updates `Option` record in Prisma | P0 | |
| FR-1.16 | On save, redirects via `?returnTo=` query param (e.g., back to an Option Set editor) | P1 | |

#### FR-2: Option Set Dashboard

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-2.1 | Route `/app` lists all Option Sets | P0 | |
| FR-2.2 | Table columns: Title, Status (badge), Assignment Type, Product Count, Created Date | P0 | Product count via `OptionSetAssignment` relation |
| FR-2.3 | "Create Option Set" button → `/app/option-sets/new` | P0 | |
| FR-2.4 | Per-row actions: Edit, Duplicate, Delete | P0 | |

#### FR-3: Option Set Editor (Configurator Builder)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-3.1 | Route `/app/option-sets/:id` (`id` = "new" for creation) | P0 | |
| FR-3.2 | **Title** text field | P0 | Existing |
| FR-3.3 | **Rank** number field | P0 | Existing |
| FR-3.4 | **Status** toggle (Active/Draft) | P0 | |
| FR-3.5 | Fields section — list of fields in the configurator | P0 | |
| FR-3.6 | "Add inline field" button — creates a new ConfiguratorField directly in the fields array | P0 | Full type/label/options/conditions form |
| FR-3.7 | For inline dropdown/radio: each option row has label, value, isDefault, add-on type (none/price/product), price or product selector | P0 | Same fields as FR-1.8–FR-1.11 |
| FR-3.8 | "Add existing option" button — opens picker/modal listing saved Options from Prisma | P0 | Selecting one snapshots its definition into fields array |
| FR-3.9 | "Create new option" button — navigates to `/app/options/new?returnTo=/app/option-sets/:id` | P0 | |
| FR-3.10 | "Remove Field" button per field | P0 | |
| FR-3.11 | Each field shows: type badge, label, required indicator | P1 | |

#### FR-4: Field Configuration (per field in Option Set)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-4.1 | Type selector (dropdown/radio/text/info_block) | P0 | |
| FR-4.2 | Label text input | P0 | |
| FR-4.3 | Required toggle | P0 | |
| FR-4.4 | Display order number input | P0 | |
| FR-4.5 | For dropdown/radio: options list with label, value, isDefault, add-on type | P0 | Add/remove options |
| FR-4.6 | Add-on type "Price": number input for price delta (cents) | P0 | |
| FR-4.7 | Add-on type "Product": product search/combobox for product GID | P1 | |
| FR-4.8 | For text: placeholder input | P1 | |
| FR-4.9 | For info_block: content textarea | P1 | |

#### FR-5: Conditional Visibility Rules

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-5.1 | Each field has a conditions list | P0 | |
| FR-5.2 | Each condition: fieldId selector, operator selector (equals/not_equals), value input | P0 | |
| FR-5.3 | Multiple conditions per field use AND logic | P0 | |
| FR-5.4 | "Add Condition" / "Remove Condition" per field | P0 | |

#### FR-6: Product Assignment

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-6.1 | Assignment type: `<s-choice-list>` with Manual / Automatic | P0 | |
| FR-6.2 | **Manual**: product search/combobox (multi-select) for specific products | P0 | |
| FR-6.3 | **Automatic**: collection selector(s), tags input, vendor selector/dropdown | P0 | |

#### FR-7: Save/Discard

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-7.1 | `ui-save-bar` with Save and Discard buttons | P0 | |
| FR-7.2 | Save creates/updates `OptionSet` record in Prisma | P0 | |
| FR-7.3 | Save replaces all `OptionSetAssignment` rows for this OptionSet (delete old, insert new) | P0 | |
| FR-7.4 | On save with **manual** assignment: writes configurator metafield to each selected product via Admin GraphQL `metafieldsSet` | P0 | |
| FR-7.5 | On save with **automatic** assignment: stores rules only (no metafield writes) | P0 | |
| FR-7.6 | Unsaved changes tracked via `shopify.saveBar` | P1 | |
| FR-7.7 | Success/failure toast via `shopify.toast.show()` | P1 | |

---

### 3.2 Product Configurator — Storefront

#### FR-8: Theme App Extension

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-8.1 | Renders fields from `product.metafields.app.configurator.value` | P0 | Written during manual assignment |
| FR-8.2 | Fields sorted by `displayOrder` | P0 | |
| FR-8.3 | Dropdown → `<select>`, Radio → radio group, Text → `<input>`, Info → `<div>` | P0 | |
| FR-8.4 | Each field element has `data-field-id`, `data-conditions`, `data-price-delta` | P0 | |

#### FR-9: Conditional Show/Hide

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-9.1 | JS evaluates `data-conditions` on field value change | P0 | |
| FR-9.2 | AND logic: ALL conditions must match | P0 | |
| FR-9.3 | Hidden fields use `display: none` | P0 | |

#### FR-10: Price Calculation

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-10.1 | JS sums `data-price-delta` of visible selected options | P0 | |
| FR-10.2 | Dynamic price display updates on selection changes | P0 | |
| FR-10.3 | On "Add to Cart": selections packed as JSON `_configurator` hidden input | P0 | |

#### FR-11: Cart Transform Function

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-11.1 | Reads `_configurator` from line item properties | P0 | |
| FR-11.2 | Reads product metafield for price deltas | P0 | |
| FR-11.3 | Outputs `subtotalAdjustments` = total deltas | P0 | |

---

### 3.3 Order Sync

#### FR-12: Webhook — orders/create

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-12.1 | Registers `orders/create` webhook in `shopify.app.toml` | P0 | |
| FR-12.2 | Endpoint at `/webhooks/orders/create` | P0 | |
| FR-12.3 | Parses: order ID, customer email, line items + properties, shipping address, total | P0 | |
| FR-12.4 | Creates SyncLog with status `"pending"` | P0 | |
| FR-12.5 | Calls `syncOrder()` | P0 | |

#### FR-13: External Sync + Retry

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-13.1 | POST to configurable URL (`HOODSLY_HUB_URL`) | P0 | |
| FR-13.2 | Retry delays: 2s → 4s → 8s | P0 | |
| FR-13.3 | Max 3 retries, then `"permanently_failed"` | P0 | |

#### FR-14: Mock Endpoint

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-14.1 | `POST /mock/hoodslyhub` returns 200 | P0 | |
| FR-14.2 | `?fail=true` returns 500 | P0 | |
| FR-14.3 | `GET /mock/hoodslyhub` returns stats | P1 | |

#### FR-15: Admin Sync Log

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-15.1 | Route `/app/sync-log` | P0 | |
| FR-15.2 | Table: Order ID, Status (badge), Retry Count, Last Attempt, Error, Actions | P0 | |
| FR-15.3 | Search by Order ID, filter by status | P0 | |
| FR-15.4 | "Retry" button for failed/permanently_failed | P0 | |

---

## 4. Routes Summary

| Route | File | Description |
|---|---|---|
| `/app` | `app._index.tsx` | Dashboard — list Option Sets |
| `/app/option-sets/:id` | `app.option-sets.$id.tsx` | Create/edit Option Set (configurator builder) |
| `/app/options/:id` | `app.options.$id.tsx` | Create/edit individual reusable Options |
| `/app/sync-log` | `app.sync-log.tsx` | Order sync status log |
| `/mock/hoodslyhub` | `mock.hoodsly-hub.tsx` | Mock external endpoint |
| `/webhooks/orders/create` | `webhooks.orders.create.tsx` | orders/create webhook |

---

## 5. Non-Functional Requirements

| ID | Requirement | Category |
|---|---|---|
| NFR-1 | All `/app/*` routes authenticate via `authenticate.admin(request)` | Security |
| NFR-2 | Webhook endpoints authenticate HMAC signature | Security |
| NFR-3 | Metafield data validated with Zod before save | Data Integrity |
| NFR-4 | TypeScript strict mode enabled | Code Quality |
| NFR-5 | `npm run lint` and `npm run typecheck` must pass | Code Quality |

---

## 6. Option → Option Set → Product Flow

```
┌─────────────────────────────────────┐
│  Option Creator (/app/options/:id)  │
│  Creates reusable field templates   │
│  Stored in Prisma `Option` table    │
└────────────┬────────────────────────┘
             │ "Add existing option"
             ▼
┌──────────────────────────────────────────┐
│  Option Set Editor (/app/option-sets/:id)│
│  ┌─────────────────────────────────────┐ │
│  │  Fields array (JSON)               │ │
│  │  ├── Inline field (typed directly) │ │
│  │  ├── Snapshot of Option A          │ │
│  │  └── Snapshot of Option B          │ │
│  └─────────────────────────────────────┘ │
│  Assignment: Manual / Automatic          │
└────────────┬─────────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                  ▼
Manual             Automatic
    │                  │
    ▼                  ▼
OptionSetAssignment  Store rules on
table: productId     OptionSet
→ optionSetId         (autoCollections/
(indexed)             autoTags/autoVendor)
    │                  │
    ▼                  ▼
Write metafield     Theme App Extension
to each product     evaluates product's
(Admin GraphQL)     collections/tags/
metafieldsSet       vendor at render time
```

---

## 7. Acceptance Criteria

### Configurator

1. Create reusable Option "Color" (dropdown: Red +$5, Blue +$0), save
2. Create Option Set "Hood Configurator" → add existing Option "Color" → add inline field "Size" (radio: Large +$10, Small +$0) → set condition "show size when Color = Red" → assign manually to "Test Hoodie" → save
3. Storefront: product page shows Color dropdown, selecting Red shows Size radio and +$5, selecting Large adds +$10
4. Add to cart, checkout: total = base + $15, admin order shows all selections as line item properties
5. Verify `OptionSetAssignment` table has the correct product-to-OptionSet mapping

### Order Sync

1. Place test order → sync log shows "synced"
2. `?fail=true` on mock endpoint → log shows retries (retryCount increments)
3. After 3 retries → "permanently_failed"
4. Click "Retry" → re-attempts sync

---

## 8. Deferred

- Order Report
- HubSpot integration
- BirdEye review request
- Rush Order Management
