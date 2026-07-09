# ConfigSync — Database Schema Planning

## 1. Schema Overview

| Schema Version | Description | Status |
|---|---|---|
| v1 (existing) | `Session` table — Shopify OAuth session storage | Live |
| v2 (new) | `Option`, `OptionSet`, `OptionSetAssignment`, `SyncLog` — configurator engine + order sync | Planned |

### Database Technology

| Property | Value |
|---|---|
| DBMS | SQLite (dev) / PostgreSQL (production) |
| ORM | Prisma 6.x |
| Migration | `prisma migrate dev` (local) / `prisma migrate deploy` (prod) |
| Naming | PascalCase models, camelCase fields (Prisma convention) |

---

## 2. Table Specifications

### 2.1 Option — Reusable field templates

Stores individual field definitions that can be reused across multiple Option Sets as presets.

```prisma
model Option {
  id          String   @id @default(uuid())
  title       String
  type        String   // "dropdown" | "radio" | "text" | "info_block"
  label       String
  required    Boolean  @default(false)
  options     String?  // JSON
  placeholder String?  // for text
  content     String?  // for info_block
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Column Details**:

| Column | Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `id` | `String` (UUID) | No | `uuid()` | Primary Key | Unique identifier |
| `title` | `String` | No | — | — | Internal admin name for this template |
| `type` | `String` | No | — | Enum: dropdown, radio, text, info_block | Field type determines render behavior |
| `label` | `String` | No | — | — | Display label shown to customers |
| `required` | `Boolean` | No | `false` | — | Whether customer must fill this field |
| `options` | `String` (JSON) | Yes | — | Validated by Zod | Array of ConfiguratorOption (only for dropdown/radio) |
| `placeholder` | `String` | Yes | — | Only for type "text" | Placeholder text for text input |
| `content` | `String` | Yes | — | Only for type "info_block" | Static content for info block |
| `createdAt` | `DateTime` | No | `now()` | — | Row creation timestamp |
| `updatedAt` | `DateTime` | No | `updatedAt` | — | Row update timestamp |

**Sample Rows**:

| id | title | type | label | required | options | placeholder | content |
|---|---|---|---|---|---|---|---|
| u1 | Color | dropdown | Color | true | [{"label":"Red","value":"red","isDefault":true,"addOnType":"price","priceDelta":500}] | null | null |
| u2 | Engraving | text | Engraving Text | false | null | "Enter text to engrave" | null |
| u3 | Info Note | info_block | Info | false | null | null | "<p>Allow 2 weeks</p>" |

---

### 2.2 OptionSet — Configurator definitions

The core entity. Each Option Set is a complete configurator definition with fields, visibility rules, and product assignment configuration.

```prisma
model OptionSet {
  id              String    @id @default(uuid())
  title           String
  status          Boolean   @default(true)
  rank            Int       @default(0)
  assignmentType  String    // "manual" | "automatic"
  autoCollections String?   // JSON
  autoTags        String?   // CSV
  autoVendor      String?   // plain text
  fields          String    // JSON
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  assignments     OptionSetAssignment[]

  @@index([status])
  @@index([assignmentType])
}
```

**Column Details**:

| Column | Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `id` | `String` (UUID) | No | `uuid()` | Primary Key | Unique identifier |
| `title` | `String` | No | — | — | Admin-facing name for this configurator |
| `status` | `Boolean` | No | `true` | — | `true` = Active, `false` = Draft |
| `rank` | `Int` | No | `0` | `>= 0` | Display ordering in admin list |
| `assignmentType` | `String` | No | — | Enum: manual, automatic | How products are selected for this configurator |
| `autoCollections` | `String` (JSON) | Yes | — | Only when assignmentType = "automatic" | Array of collection IDs |
| `autoTags` | `String` | Yes | — | Only when assignmentType = "automatic" | Comma-separated product tags |
| `autoVendor` | `String` | Yes | — | Only when assignmentType = "automatic" | Product vendor name |
| `fields` | `String` (JSON) | No | — | Validated by Zod | Array of ConfiguratorField (the actual configurator) |
| `createdAt` | `DateTime` | No | `now()` | — | Row creation timestamp |
| `updatedAt` | `DateTime` | No | `updatedAt` | — | Row update timestamp |

**Indexes**:

| Index Name | Columns | Type | Purpose |
|---|---|---|---|
| `OptionSet_status_idx` | `status` | B-tree | Dashboard filter: Active/Draft |
| `OptionSet_assignmentType_idx` | `assignmentType` | B-tree | Dashboard filter: Manual/Automatic |

**Estimated Row Size**:

| Component | Size |
|---|---|
| id (UUID) | 36 bytes |
| title | ~50 bytes |
| status | 1 byte |
| rank | 4 bytes |
| assignmentType | ~10 bytes |
| autoCollections | ~100 bytes |
| autoTags | ~50 bytes |
| autoVendor | ~30 bytes |
| fields (JSON, 10-30 fields) | ~5-15 KB |
| timestamps | 16 bytes |
| **Total per row** | **~5-15 KB** |

---

### 2.3 OptionSetAssignment — Product mapping

Normalizes the many-to-many relationship between Option Sets and products. Enables O(log n) lookup for "which configurators apply to product X?"

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

**Column Details**:

| Column | Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `id` | `String` (UUID) | No | `uuid()` | Primary Key | Unique identifier |
| `optionSetId` | `String` (UUID) | No | — | FK → OptionSet.id | Parent Option Set |
| `productId` | `String` | No | — | — | Shopify product GID (e.g., "gid://shopify/Product/12345") |

**Indexes**:

| Index Name | Columns | Type | Unique | Purpose |
|---|---|---|---|---|
| `OptionSetAssignment_optionSetId_productId_key` | `[optionSetId, productId]` | B-tree | Yes | Prevent duplicate |
| `OptionSetAssignment_productId_idx` | `[productId]` | B-tree | No | **Critical**: storefront lookup |
| `OptionSetAssignment_optionSetId_idx` | `[optionSetId]` | B-tree | No | Admin: list products for OptionSet |

**Query Performance**:

```
Query: "Find all OptionSets for product gid://shopify/Product/12345"

EXPLAIN QUERY PLAN
SELECT * FROM OptionSetAssignment WHERE productId = 'gid://shopify/Product/12345'

Result: SEARCH table using index OptionSetAssignment_productId_idx
→ O(log n) — constant time regardless of total OptionSet count
```

**Estimated growth**: 1 row per (OptionSet × product) pairing. For a store with 50 OptionSets and 500 products each assigned to 1 set on average → 500 rows. Scale: 50,000 rows for 500 OptionSets × 100 products each.

---

### 2.4 SyncLog — Order sync audit trail

Records every order sync attempt with retry status, timing, and error information.

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

**Column Details**:

| Column | Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `id` | `String` (UUID) | No | `uuid()` | Primary Key | Unique identifier |
| `shop` | `String` | No | — | — | Shop domain (e.g., "store.myshopify.com") |
| `orderId` | `String` | No | — | Unique | Shopify order ID |
| `status` | `String` | No | — | Enum: synced, pending, failed, permanently_failed | Current sync state |
| `retryCount` | `Int` | No | `0` | — | Number of retry attempts made |
| `lastAttemptAt` | `DateTime` | Yes | — | — | Timestamp of most recent attempt |
| `nextRetryAt` | `DateTime` | Yes | — | — | Scheduled next retry (for visibility) |
| `errorMessage` | `String` | Yes | — | — | Last error message from HoodslyHub |
| `payload` | `String` (JSON) | No | — | — | Full order payload sent to HoodslyHub |
| `createdAt` | `DateTime` | No | `now()` | — | Row creation timestamp |
| `updatedAt` | `DateTime` | No | `updatedAt` | — | Row update timestamp |

**Status Lifecycle**:

```
                  ┌─────────┐
                  │ pending │ ← initial state on webhook receipt
                  └────┬────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
         ┌────────┐      ┌──────────┐
         │ synced │      │  failed  │ ← retryCount < 3
         └────────┘      └────┬─────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              ┌──────────┐      ┌───────────────────┐
              │  failed  │      │ permanently_failed │ ← retryCount >= 3
              └──────────┘      └───────────────────┘
                    │                     │
                    │        "Retry"      │
                    └─────────────────────┘
                              │
                              ▼
                         ┌─────────┐
                         │ pending │
                         └─────────┘
```

**Indexes**:

| Index Name | Columns | Type | Purpose |
|---|---|---|---|
| `SyncLog_status_idx` | `[status]` | B-tree | Filter synced/failed/pending |
| `SyncLog_orderId_idx` | `[orderId]` | B-tree | Search by order ID |

**Cleanup Strategy** (future): Rows with `status = "synced"` older than 90 days can be archived or deleted to control table growth.

---

### 2.5 Session (Existing — No Changes)

```prisma
model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String
  userId        BigInt?
  firstName     String?
  lastName      String?
  email         String?
  accountOwner  Boolean   @default(false)
  locale        String?
  collaborator  Boolean?  @default(false)
  emailVerified Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
}
```

Left untouched. Managed by `@shopify/shopify-app-session-storage-prisma`.

---

## 3. Relationship Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        Configurator Domain                      │
│                                                                 │
│  ┌──────────┐       ┌──────────────┐       ┌──────────────────┐ │
│  │  Option  │──────>│  OptionSet   │──1───<│ OptionSetAssgnmnt│ │
│  └──────────┘ snap- │              │   N   └────────┬─────────┘ │
│                     │ fields: JSON │                │            │
│                     └──────────────┘                │ N          │
│                         │                           ▼            │
│                         │ 1                   ┌──────────┐      │
│                         │                     │  Shopify  │      │
│                         │                     │ Product   │      │
│                         │                     │ (logical) │      │
│                         │                     └──────────┘      │
│                         │                                       │
│                         │ writes metafield                      │
│                         ▼                                       │
│                    ┌──────────────┐                             │
│                    │  Shopify     │                             │
│                    │  Metafield   │(external storage)           │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Order Sync Domain                        │
│                                                                 │
│  Shopify ──→ Webhook ──→ SyncLog ──→ HoodslyHub                 │
│  Order                (audit)        (external)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Auth Domain (Existing)                   │
│                                                                 │
│  Session (manages Shopify OAuth tokens)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. JSON Schema Reference (Stored in Columns)

### 4.1 Option.options — ConfiguratorOption Array

```json
[
  {
    "label": "Red",
    "value": "red",
    "isDefault": false,
    "addOnType": "price",
    "priceDelta": 500
  },
  {
    "label": "Extended Warranty",
    "value": "warranty",
    "isDefault": false,
    "addOnType": "product",
    "addOnProductId": "gid://shopify/Product/98765"
  },
  {
    "label": "None",
    "value": "none",
    "isDefault": true,
    "addOnType": "none"
  }
]
```

```
Constraints:
  - addOnType "price" → priceDelta MUST be a positive integer (cents)
  - addOnType "product" → addOnProductId MUST be a valid Shopify GID
  - addOnType "none" → no additional fields required
  - At most one option per field can have isDefault = true
```

### 4.2 OptionSet.fields — ConfiguratorField Array

```json
[
  {
    "id": "fld_1",
    "type": "dropdown",
    "label": "Color",
    "required": true,
    "displayOrder": 0,
    "options": [
      { "label": "Red", "value": "red", "isDefault": true, "addOnType": "price", "priceDelta": 500 },
      { "label": "Blue", "value": "blue", "isDefault": false, "addOnType": "price", "priceDelta": 0 }
    ],
    "conditions": []
  },
  {
    "id": "fld_2",
    "type": "radio",
    "label": "Size",
    "required": true,
    "displayOrder": 1,
    "options": [
      { "label": "Small", "value": "sm", "isDefault": false, "addOnType": "price", "priceDelta": 0 },
      { "label": "Large", "value": "lg", "isDefault": false, "addOnType": "price", "priceDelta": 1000 }
    ],
    "conditions": [
      { "fieldId": "fld_1", "operator": "equals", "value": "red" }
    ]
  },
  {
    "id": "fld_3",
    "type": "text",
    "label": "Engraving",
    "required": false,
    "displayOrder": 2,
    "placeholder": "Enter text",
    "conditions": [
      { "fieldId": "fld_1", "operator": "equals", "value": "red" },
      { "fieldId": "fld_2", "operator": "not_equals", "value": "sm" }
    ]
  }
]
```

```
Constraints:
  - field.id MUST be unique within the array (used for condition references)
  - condition.fieldId MUST reference an existing field.id in the same array
  - Fields with displayOrder = 0 render first
  - At most one option per field can have isDefault = true
```

### 4.3 SyncLog.payload — Order Payload

```json
{
  "orderId": "gid://shopify/Order/12345",
  "customerEmail": "john@example.com",
  "lineItems": [
    {
      "productId": "gid://shopify/Product/678",
      "variantId": "gid://shopify/ProductVariant/999",
      "sku": "HOOD-RED-LG",
      "title": "Premium Hoodie",
      "quantity": 1,
      "price": 11500,
      "properties": {
        "_configurator": "{\"fld_1\":{\"label\":\"Red\",\"value\":\"red\",\"priceDelta\":500}}"
      }
    }
  ],
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "address1": "123 Main St",
    "city": "Anytown",
    "province": "CA",
    "zip": "12345",
    "country": "US"
  },
  "totalPrice": 11500
}
```

---

## 5. Migration Plan

### 5.1 Migration Commands

```bash
# Development
npx prisma migrate dev --name add_configurator_and_sync_models

# Production
npx prisma migrate deploy

# Generate client after migration
npx prisma generate
```

### 5.2 Migration Sequence

| Step | Action | Affected Tables | Notes |
|---|---|---|---|
| 1 | Create `Option` | Option | Reusable field templates |
| 2 | Create `OptionSet` | OptionSet | Core configurator entity |
| 3 | Create `OptionSetAssignment` | OptionSetAssignment | Product mapping with indexes |
| 4 | Create `SyncLog` | SyncLog | Order sync audit trail |
| 5 | Verify | All | `npx prisma studio` to inspect |
| 6 | Seed (optional) | Option | Add initial field types |

### 5.3 Rollback

```bash
# Revert the last migration
npx prisma migrate dev --create-only  # Create empty migration
# Edit the generated SQL to drop tables
npx prisma migrate dev
```

---

## 6. TypeScript ↔ Prisma Type Mapping

| Prisma Type | TypeScript Type | Notes |
|---|---|---|
| `String` | `string` | Mapped directly |
| `Int` | `number` | Integer values |
| `Boolean` | `boolean` | True/false |
| `DateTime` | `Date` | ISO 8601 |
| `BigInt` | `bigint` | Only in Session.userId |
| `String` (storing JSON) | Parsed via JSON.parse/stringify | `options`, `fields`, `payload` are JSON-encoded strings in the DB, typed as TypeScript interfaces in the app |

### TypeScript Interfaces for JSON Columns

```typescript
// app/types/configurator.ts

type FieldType = "dropdown" | "radio" | "text" | "info_block";
type AddOnType = "none" | "price" | "product";

interface ConfiguratorOption {
  label: string;
  value: string;
  isDefault: boolean;
  addOnType: AddOnType;
  priceDelta?: number;
  addOnProductId?: string;
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
  conditions?: VisibilityCondition[];
  defaultValue?: string;
  placeholder?: string;
  content?: string;
}

// For SyncLog.payload
interface OrderSyncPayload {
  orderId: string;
  customerEmail: string;
  lineItems: Array<{
    productId: string;
    variantId: string;
    sku: string;
    title: string;
    quantity: number;
    price: number;
    properties: Record<string, string>;
  }>;
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    city: string;
    province: string;
    zip: string;
    country: string;
  };
  totalPrice: number;
}
```

---

## 7. Query Patterns

### 7.1 Dashboard — List Option Sets

```typescript
const optionSets = await prisma.optionSet.findMany({
  orderBy: { rank: 'asc' },
  include: {
    _count: { select: { assignments: true } }
  }
});
// Returns: [{ id, title, status, rank, assignmentType, created, _count: { assignments: 5 } }]
```

### 7.2 Storefront — Find OptionSets for Product (Manual)

```typescript
// O(log n) — indexed lookup
const assignments = await prisma.optionSetAssignment.findMany({
  where: { productId: productGid },
  include: {
    optionSet: true
  }
});

// Resolve the configurator from the first matching OptionSet
const configurator = assignments[0]?.optionSet?.fields;
```

### 7.3 Storefront — Find OptionSets for Product (Automatic)

This is NOT a DB query. The Theme App Extension evaluates rules client-side:
```javascript
// In configurator.js (storefront snippet)
const productCollections = [/* Shopify-provided collection IDs */];
const productTags = "premium,limited";       // product.tags
const productVendor = "Acme Inc";            // product.vendor

// Match against OptionSet auto-rules (embedded in Liquid)
if (matchesRules(productCollections, optionSet.autoCollections,
                 productTags, optionSet.autoTags,
                 productVendor, optionSet.autoVendor)) {
  renderConfigurator(optionSet.fields);
}
```

### 7.4 Sync Log — Filtered/Filtered

```typescript
// Filter by status
const failedLogs = await prisma.syncLog.findMany({
  where: { status: { in: ["failed", "permanently_failed"] } },
  orderBy: { updatedAt: 'desc' }
});

// Search by order ID
const searchResults = await prisma.syncLog.findMany({
  where: { orderId: { contains: searchQuery } }
});
```

### 7.5 Retry — Reset and Re-sync

```typescript
const log = await prisma.syncLog.findUnique({ where: { orderId } });

// Reset for retry
await prisma.syncLog.update({
  where: { id: log.id },
  data: {
    status: "pending",
    retryCount: 0,
    errorMessage: null,
  }
});

// Re-run sync
await syncOrder(JSON.parse(log.payload));
```

---

## 8. Performance Budget

| Query | Frequency | Target Latency | Index Used |
|---|---|---|---|
| List OptionSets (admin) | Per admin page load | < 100ms | PK scan + count |
| Find assignments by product | Per storefront page load | < 10ms | `productId` index |
| Find products by OptionSet | Per admin save | < 50ms | `optionSetId` index |
| Insert assignments | Per OptionSet save | < 100ms | PK insert |
| Filter SyncLog by status | Per admin filter | < 50ms | `status` index |
| Search SyncLog by orderId | Per admin search | < 50ms | `orderId` index |

---

## 9. Future Schema Considerations

| Feature | Schema Change Needed | Priority |
|---|---|---|
| Rush Order Management | New `RushOrder` table with `orderId`, `notes`, `createdAt` | Low |
| BirdEye Review Queue | New `ReviewRequest` table with `orderId`, `status`, `retryCount` | Low |
| HubSpot Sync Status | Could extend SyncLog with `hubspotStatus` column, or new table | Low |
| Multiple OptionSets per product | Already supported by current `OptionSetAssignment` design | Ready |
| OptionSet grouping/tags | Add `group` string column to OptionSet | Low |
| Soft delete | Add `deletedAt` DateTime? to Option & OptionSet | Low |
| Product type autmation | Add `autoProductType` column to OptionSet (parallel to autoVendor) | Low |
| Deferred product writing | Queue system for writing metafields to many products at once | Medium |
