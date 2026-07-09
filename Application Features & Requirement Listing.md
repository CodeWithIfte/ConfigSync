# ConfigSync — Application Features & Requirement Listing

## 1. Overview

ConfigSync is a Shopify embedded app built on React Router v7 that enables Magento-to-Shopify migration by providing:

1. **Product Configurator Engine** — Custom product options with unlimited fields, conditional visibility, and price adders, bypassing Shopify's 100-variant limit.
2. **Order Sync to HoodslyHub** — Reliable order data delivery to an external system with retry logic and an admin dashboard.

---

## 2. Functional Requirements

### 2.1 Product Configurator Engine

#### FR-1.1: Admin — Configurator Editor

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-1.1.1 | Admin can navigate to `/app/configurator/:productId` to edit a product's configurator | P0 | Route must authenticate admin session |
| FR-1.1.2 | Admin can search and select a product via a combobox/search field at the top of the page | P0 | Uses Admin GraphQL `products(query:)` |
| FR-1.1.3 | Admin can add fields to the configurator definition | P0 | Fields displayed in order |
| FR-1.1.4 | Admin can remove fields from the configurator definition | P0 | |
| FR-1.1.5 | Each field has a type selector (dropdown, radio, text, info_block) | P0 | |
| FR-1.1.6 | Each field has a label text input | P0 | |
| FR-1.1.7 | Each field has a required toggle (checkbox) | P0 | |
| FR-1.1.8 | Each field has a display order number input | P0 | Determines render order |
| FR-1.1.9 | Each field can have multiple options (for dropdown/radio), each with label, value, and price delta in cents | P0 | |
| FR-1.1.10 | Each field can have multiple visibility conditions (AND logic) with fieldId, operator (equals/not_equals), and value | P0 | |
| FR-1.1.11 | For text fields, admin can set a placeholder | P1 | |
| FR-1.1.12 | For info_block fields, admin can set content (rich text or markdown) | P1 | |
| FR-1.1.13 | Save/Discard via `ui-save-bar` component | P0 | Persists to product metafield |
| FR-1.1.14 | Unsaved changes warning via `shopify.saveBar.show()` | P1 | Prevents accidental navigation away |
| FR-1.1.15 | Success/failure toast notification after save | P1 | Uses `shopify.toast.show()` |

#### FR-2: Admin — Configurator Storage

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-2.1 | Configurator definition stored as product metafield `namespace:"app"`, `key:"configurator"`, type `json` | P0 | |
| FR-2.2 | Metafield access level: `merchant_read_write` | P0 | |
| FR-2.3 | Admin GraphQL `metafieldsSet` mutation for write | P0 | |
| FR-2.4 | Admin GraphQL product query for read | P0 | |
| FR-2.5 | Zod schema validation before save | P1 | Prevents corrupt metafield data |

#### FR-3: Storefront — Configurator Rendering

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-3.1 | Theme App Extension renders configurator on product page | P0 | Installed as app block |
| FR-3.2 | Reads `product.metafields.app.configurator.value` | P0 | |
| FR-3.3 | Renders dropdown fields as `<select>` elements | P0 | |
| FR-3.4 | Renders radio fields as radio button groups | P0 | |
| FR-3.5 | Renders text fields as `<input type="text">` | P0 | |
| FR-3.6 | Renders info_block fields as static HTML content | P0 | |
| FR-3.7 | Each rendered field element includes `data-field-id` attribute | P0 | Used by JS for conditions |
| FR-3.8 | Each rendered option element includes `data-price-delta` attribute (cents) | P0 | Used by JS for price calculation |
| FR-3.9 | Each rendered field element includes `data-conditions` attribute (JSON-encoded conditions array) | P0 | Used by JS for show/hide |

#### FR-4: Storefront — Conditional Visibility

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-4.1 | JavaScript evaluates visibility conditions on field value change | P0 | |
| FR-4.2 | Multiple conditions use AND logic (ALL conditions must match) | P0 | |
| FR-4.3 | Supported operators: `equals`, `not_equals` | P0 | |
| FR-4.4 | Fields not matching their conditions are hidden (`display: none`) | P0 | |
| FR-4.5 | Fields that become visible are shown with smooth behavior | P2 | |

#### FR-5: Storefront — Price Calculation

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-5.1 | JavaScript calculates visible selected options' price deltas | P0 | Sum of all delta values |
| FR-5.2 | Total price adder displayed to customer | P0 | Shown as dynamic price update |
| FR-5.3 | On "Add to Cart", selected values packed into JSON `_configurator` line item property | P0 | Hidden form input |

#### FR-6: Cart Transform Function

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-6.1 | Shopify Function of type `cart_transform` | P0 | |
| FR-6.2 | Input query reads `lineItem.properties` for `_configurator` | P0 | |
| FR-6.3 | Input query reads product metafield `app.configurator` | P0 | |
| FR-6.4 | Function parses `_configurator` JSON, looks up each selection's price delta | P0 | |
| FR-6.5 | Function outputs `cost.subtotalAdjustments` with total adder | P0 | |
| FR-6.6 | Cart total reflects base price + all selected adders | P0 | Verified at checkout |
| FR-6.7 | Line item properties preserved through checkout and appear in admin order | P0 | |

---

### 2.2 Order Sync to HoodslyHub

#### FR-7: Webhook — orders/create

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-7.1 | App registers `orders/create` webhook in `shopify.app.toml` | P0 | App-specific subscription |
| FR-7.2 | Webhook endpoint at `/webhooks/orders/create` | P0 | |
| FR-7.3 | Parses order ID, customer email, line items (with properties), shipping address, order total | P0 | |
| FR-7.4 | Creates `SyncLog` record with status `"pending"` | P0 | |
| FR-7.5 | Calls `syncOrder()` with parsed payload | P0 | |
| FR-7.6 | Returns HTTP 200 to Shopify | P0 | |

#### FR-8: External Sync (HoodslyHub)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-8.1 | `syncOrder()` sends POST request to configurable endpoint URL | P0 | `HOODSLY_HUB_URL` env var |
| FR-8.2 | Payload includes: order ID, customer email, line items, shipping address, total | P0 | JSON body |
| FR-8.3 | On success (2xx), updates `SyncLog` status to `"synced"` | P0 | |
| FR-8.4 | On failure (non-2xx or network error), initiates retry | P0 | |

#### FR-9: Retry Logic

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-9.1 | First retry delay: 2 seconds | P0 | |
| FR-9.2 | Second retry delay: 4 seconds | P0 | |
| FR-9.3 | Third retry delay: 8 seconds | P0 | |
| FR-9.4 | Maximum 3 retries total | P0 | |
| FR-9.5 | After each failure, updates `SyncLog.retryCount` and `lastAttemptAt` | P0 | |
| FR-9.6 | After each failure, sets `SyncLog.nextRetryAt` for visibility | P1 | |
| FR-9.7 | After 3 failures, sets `SyncLog.status` to `"permanently_failed"` | P0 | |
| FR-9.8 | Error message stored in `SyncLog.errorMessage` | P0 | |

#### FR-10: Admin Sync Log

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-10.1 | Admin page at `/app/sync-log` | P0 | |
| FR-10.2 | Table displays all SyncLog records (paginated) | P0 | |
| FR-10.3 | Columns: Order ID, Status, Retry Count, Last Attempt, Error, Actions | P0 | |
| FR-10.4 | Status displayed as colored badge: synced (green), pending (yellow), failed (red), permanently_failed (dark red) | P0 | |
| FR-10.5 | Search bar filters by Order ID | P0 | |
| FR-10.6 | Filter dropdown: All, Synced, Pending, Failed, Permanently Failed | P0 | |
| FR-10.7 | "Retry" button for failed/permanently_failed orders | P0 | POST action re-runs sync |
| FR-10.8 | Retry resets retry count and re-attempts sync | P0 | |

#### FR-11: Mock HoodslyHub Endpoint

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-11.1 | `POST /mock/hoodslyhub` accepts JSON payload | P0 | |
| FR-11.2 | Returns HTTP 200 with `{"status":"received"}` on success | P0 | |
| FR-11.3 | `?fail=true` query param causes HTTP 500 response | P0 | Simulates downstream failure |
| FR-11.4 | `GET /mock/hoodslyhub` returns basic status/stats | P1 | Request count, last received |

---

## 3. Non-Functional Requirements

| ID | Requirement | Category | Notes |
|---|---|---|---|
| NFR-1 | Admin pages authenticate via `authenticate.admin(request)` | Security | All `/app/*` routes |
| NFR-2 | Webhook endpoints authenticate HMAC signature | Security | Handled by `@shopify/shopify-app-react-router` |
| NFR-3 | Metafield data validated with Zod before save | Data Integrity | |
| NFR-4 | SQLite (via Prisma) used for sync persistence | Data Storage | Already configured |
| NFR-5 | Shopify Function JS bundle must be < 1MB | Performance | Function size limit |
| NFR-6 | TypeScript strict mode enabled | Code Quality | Already configured |
| NFR-7 | ESLint must pass with no errors | Code Quality | `npm run lint` |
| NFR-8 | `npm run typecheck` must pass | Code Quality | `react-router typegen && tsc --noEmit` |

---

## 4. User Stories

### Configurator Engine

**US-1**: As an admin, I want to create a configurator for a specific product so that customers can customize options beyond standard variants.

**US-2**: As an admin, I want to configure dropdown and radio options with price adders so that complex pricing is reflected at checkout.

**US-3**: As an admin, I want to set conditional visibility rules so that fields only show when relevant selections are made.

**US-4**: As a customer, I want to see the configurator on the product page so I can customize my purchase.

**US-5**: As a customer, I want to see the total price update as I make selections so I know the final cost before adding to cart.

**US-6**: As a customer, I want my selections to appear on the order so I know exactly what I ordered.

**US-7**: As a merchant, I want the cart price to include all selected adders so revenue is correctly captured.

### Order Sync

**US-8**: As an operations manager, I want every order automatically sent to HoodslyHub so our fulfillment system stays in sync.

**US-9**: As an operations manager, I want to see sync status for all orders so I can identify failed syncs.

**US-10**: As an operations manager, I want to manually retry failed syncs so I can resolve issues without re-placing orders.

**US-11**: As a developer, I want to simulate sync failures so I can verify retry behavior works correctly.

---

## 5. Data Flow Diagrams

### 5.1 Configurator Flow

```
Admin (Polaris UI)
    │
    ├── Create/Edit configurator definition
    │       │
    │       ▼
    │   app.configurator.$id.tsx
    │       │
    │       ▼
    │   configurator.server.ts (validate with Zod)
    │       │
    │       ▼
    │   Admin GraphQL metafieldsSet
    │       │
    │       ▼
    │   Product metafield (namespace: "app", key: "configurator")
    │
    ▼
Storefront (Theme App Extension)
    │
    ├── block renders fields from metafield
    ├── JS handles conditions, price calc
    ├── On "Add to Cart" → _configurator property attached
    │
    ▼
Cart Transform Function
    │
    ├── Reads _configurator property
    ├── Reads product metafield for price deltas
    ├── Outputs subtotalAdjustments
    │
    ▼
Checkout → Order (line item properties preserved)
```

### 5.2 Order Sync Flow

```
Shopify orders/create event
    │
    ▼
webhooks.orders.create.tsx
    │
    ├── Parse payload
    ├── Create SyncLog (status: "pending")
    │
    ▼
hoodsly-sync.server.ts
    │
    ├── POST to /mock/hoodslyhub
    │       │
    │       ├── 200 OK → update SyncLog (status: "synced")
    │       │
    │       └── 500/error → retry (2s, 4s, 8s)
    │               │
    │               ├── success → "synced"
    │               │
    │               └── 3 failures → "permanently_failed"
    │
    ▼
Admin Sync Log (/app/sync-log)
    ├── View all records
    ├── Filter by status
    ├── Search by order ID
    └── Manual retry button
```

---

## 6. API Contracts

### 6.1 Admin GraphQL — Read Configurator

```graphql
query GetConfigurator($productId: ID!) {
  product(id: $productId) {
    id
    title
    metafield(namespace: "app", key: "configurator") {
      value
    }
  }
}
```

### 6.2 Admin GraphQL — Write Configurator

```graphql
mutation SetConfigurator($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

### 6.3 HoodslyHub Mock — POST Payload

```json
{
  "orderId": "gid://shopify/Order/12345",
  "customerEmail": "customer@example.com",
  "lineItems": [
    {
      "productId": "gid://shopify/Product/678",
      "variantId": "gid://shopify/ProductVariant/999",
      "sku": "PROD-SKU",
      "title": "Product Name",
      "quantity": 1,
      "price": 2999,
      "properties": {
        "_configurator": "{\"field1\": {\"label\": \"Color\", \"value\": \"Red\", \"priceDelta\": 500}}"
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
  "totalPrice": 3499
}
```

### 6.4 Cart Transform Function — I/O

**Input GraphQL:**
```graphql
query Input {
  cart {
    lines {
      id
      quantity
      merchandise {
        __typename
        ... on ProductVariant {
          id
          product {
            metafield(namespace: "app", key: "configurator") {
              value
            }
          }
        }
      }
      attribute {
        key
        value
      }
    }
  }
}
```

**Output:**
```graphql
mutation Output {
  cost {
    subtotalAdjustments {
      adjustmentReason: "app"
      adjustmentType: "percentage_off"
      value: 0
    }
  }
}
```

---

## 7. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | Yes | Shopify app API key |
| `SHOPIFY_API_SECRET` | Yes | Shopify app API secret |
| `SCOPES` | Yes | OAuth scopes (comma-separated) |
| `SHOPIFY_APP_URL` | Yes | Public app URL (tunnel or production) |
| `HOODSLY_HUB_URL` | Yes | External endpoint for order sync |

---

## 8. Acceptance Criteria

### Configurator Engine

1. Create a configurator for a product with: color dropdown (Red = +$5, Blue = +$0), size radio (Large = +$10, Small = +$0), and a text field that only shows when color is Red.
2. Save and reload the page — configurator state is preserved.
3. On the storefront product page, the configurator renders correctly.
4. Selecting "Red" updates the price display by +$5 and shows the hidden text field.
5. Adding to cart and completing checkout shows the correct total (base + $15 for Red + Large).
6. The admin order view shows all selections as line item properties.

### Order Sync

1. Place a test order — the sync log shows a `"synced"` status.
2. Trigger sync with `?fail=true` on the mock endpoint — the log shows retries (retryCount increments).
3. After 3 retries, status changes to `"permanently_failed"`.
4. Click "Retry" on a permanently failed order — it re-attempts sync and can succeed.

---

## 9. Extension Points (Future)

| Feature | Trigger | Notes |
|---|---|---|
| HubSpot CRM Sync | On `orders/create` | Send customer + order data to HubSpot contacts API |
| BirdEye Review Request | On `orders/fulfilled` | Send review request via BirdEye API with retry |
| Order Report | Admin page | Filter by customer tag + date range, CSV export |
| Rush Order Management | Admin toggle | Priority queue view in admin |
