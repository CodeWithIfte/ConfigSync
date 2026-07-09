# ConfigSync — Data Flow Diagrams

## Legend

```
[External Entity]    — External system (Shopify, Customer, HoodslyHub)
(Process)            — Application logic (route handler, service)
{Data Store}         — Persistent storage (Prisma, Shopify metafield)
════ Data flow ═══╗ — Direction of data movement
```

---

## DFD Level 0 — Context Diagram

```mermaid
graph TB
    Admin["👤 Admin"]
    Customer["👤 Customer"]
    ShopifyAdmin["🏢 Shopify Admin"]
    Storefront["🏪 Storefront"]
    
    subgraph "ConfigSync App"
        AppUI["Admin UI (Polaris Web Components)"]
        WebhookHandler["orders/create Webhook Handler"]
        MockEndpoint["Mock HoodslyHub Endpoint"]
        CartFunction["Cart Transform Function"]
        ThemeExtension["Theme App Extension"]
    end
    
    subgraph "Data Stores"
        PrismaDB[("Prisma SQLite\nOption\nOptionSet\nOptionSetAssignment\nSyncLog")]
        Metafields[("Shopify Product Metafields\napp.configurator")]
        OrderData[("Shopify Order Data")]
    end
    
    Admin -->|"Manages configurator"| AppUI
    Customer -->|"Configures product"| Storefront
    Storefront -->|"Reads metafield"| Metafields
    Customer -->|"Completes checkout"| ShopifyAdmin
    ShopifyAdmin -->|"Fires orders/create"| WebhookHandler
    WebhookHandler -->|"POST order data"| MockEndpoint
    MockEndpoint -->|"Stub: 200/500"| WebhookHandler
    AppUI -->|"CRUD"| PrismaDB
    AppUI -->|"metafieldsSet"| Metafields
    
    CartFunction -->|"Reads metafield + line item properties"| Metafields
    CartFunction -->|"Outputs subtotalAdjustments"| OrderData
    ThemeExtension -->|"Renders from metafield"| Metafields
```

---

## DFD Level 1 — Option Creator Flow

```mermaid
sequenceDiagram
    actor Admin
    participant Trigger as Trigger button
    participant TypeSelector as Type selector overlay
    participant OptionsUI as /app/options/:id
    participant ConfigService as configurator.server.ts
    participant Prisma as Prisma (Option)
    
    Admin->>Trigger: Click "Create new option"
    Trigger->>TypeSelector: Show 4 type cards
    
    Admin->>TypeSelector: Select type (e.g., dropdown)
    TypeSelector->>OptionsUI: Navigate to /app/options/new?type=dropdown
    
    OptionsUI->>OptionsUI: Render form, pre-select type
    
    Admin->>OptionsUI: Enter title, label, toggle required
    Admin->>OptionsUI: Add option rows
    
    loop Each option row
        Admin->>OptionsUI: Enter label, value
        Admin->>OptionsUI: Toggle isDefault
        Admin->>OptionsUI: Select add-on type
        alt addOnType = "price"
            Admin->>OptionsUI: Enter $ price (cents)
        else addOnType = "product"
            Admin->>OptionsUI: Search & select Shopify product
        end
    end
    
    Admin->>OptionsUI: Click Save
    OptionsUI->>ConfigService: saveOption(formData)
    ConfigService->>ConfigService: Validate with Zod
    ConfigService->>Prisma: Create/Update Option record
    Prisma-->>ConfigService: Return saved Option
    ConfigService-->>OptionsUI: Success response
    OptionsUI->>OptionsUI: Show toast, redirect (?returnTo or /app)
```

### Data Flow — Option Save

```
Admin input → Form (Polaris Web Components)
  → POST /app/options/:id
    → configurator.server.ts (Zod validation)
      → Option table (Prisma)
        → id, title, type, label, required, options[{label, value, isDefault, addOnType, priceDelta?, addOnProductId?}], placeholder, content
```

---

## DFD Level 1 — Option Set Editor Flow

```mermaid
sequenceDiagram
    actor Admin
    participant Dashboard as /app
    participant Editor as /app/option-sets/:id
    participant ConfigService as configurator.server.ts
    participant Prisma as Prisma
    participant ShopifyAPI as Admin GraphQL
    
    Admin->>Dashboard: View Option Sets list
    Dashboard->>ConfigService: getOptionSets()
    ConfigService->>Prisma: SELECT * FROM OptionSet
    Prisma-->>ConfigService: Return list with assignment counts
    ConfigService-->>Dashboard: Render table
    
    Admin->>Dashboard: Click "Create Option Set"
    Dashboard->>Editor: Navigate to /app/option-sets/new
    
    Admin->>Editor: Set title, rank, status
    
    Note over Editor: Adding fields
    
    alt Add inline field
        Admin->>Editor: Click "Add inline field"
        Editor->>Editor: Show field form (type, label, options, conditions)
        Admin->>Editor: Configure field (type, label, options, conditions)
        loop Each option row for dropdown/radio
            Admin->>Editor: Enter label, value
            Admin->>Editor: Toggle isDefault checkbox
            Admin->>Editor: Select add-on type (none/price/product)
            alt addOnType = "price"
                Admin->>Editor: Enter $ price delta (cents)
            else addOnType = "product"
                Admin->>Editor: Search & select Shopify product
            end
        end
        Admin->>Editor: Click done
        Editor->>Editor: Append field to local fields array
    else Add existing Option
        Admin->>Editor: Click "Add existing option"
        Editor->>ConfigService: getOptions()
        ConfigService->>Prisma: SELECT * FROM Option
        Prisma-->>ConfigService: Return Option list
        ConfigService-->>Editor: Show picker modal
        Admin->>Editor: Select Option(s)
        Editor->>Editor: Snapshot Option definition into fields array
    else Create new Option
        Admin->>Editor: Click "Create new option"
        Editor->>Editor: Navigate to /app/options/new?returnTo=/app/option-sets/:id
    end
    
    Note over Editor: Setting conditions
    
    Admin->>Editor: Expand field → add conditions
    Editor->>Editor: fieldId, operator, value
    
    Note over Editor: Product assignment
    
    alt Manual
        Admin->>Editor: Set assignmentType = "manual"
        Admin->>Editor: Search & select products (combobox)
        Editor->>Editor: Store selected product GIDs
    else Automatic
        Admin->>Editor: Set assignmentType = "automatic"
        Admin->>Editor: Select collections, enter tags, select vendor
        Editor->>Editor: Store rule values
    end
    
    Admin->>Editor: Click Save
    Editor->>ConfigService: saveOptionSet(data)
    ConfigService->>ConfigService: Validate fields with Zod
    ConfigService->>Prisma: Upsert OptionSet record
    Prisma-->>ConfigService: Return saved OptionSet
    
    alt Manual assignment
        ConfigService->>Prisma: Delete old OptionSetAssignment rows
        ConfigService->>Prisma: Insert new OptionSetAssignment rows
        ConfigService->>ShopifyAPI: metafieldsSet (write configurator JSON to each product)
        ShopifyAPI-->>ConfigService: Confirm metafield write
    end
    
    ConfigService-->>Editor: Success
    Editor->>Editor: Show toast, redirect to /app
```

### Data Flow — Option Set Save

```
Admin input → Form (Polaris Web Components)
  → POST /app/option-sets/:id
    → configurator.server.ts (Zod validation)
      → OptionSet table (Prisma)
        → title, status, rank, assignmentType, fields[], autoCollections, autoTags, autoVendor
      → OptionSetAssignment table (Prisma)
        → [optionSetId, productId] rows (delete old, insert new)
      → Admin GraphQL metafieldsSet
        → product.metafields.app.configurator = JSON.stringify(Definition)
```

---

## DFD Level 1 — Product Assignment Resolution

```mermaid
graph LR
    subgraph "Storefront Render"
        A[Product Page Load]
        A --> B{assignmentType?}
    end
    
    subgraph "Manual Path"
        B -->|"manual"| C[Read product metafield]
        C --> D[Parse app.configurator JSON]
        D --> E[Render configurator fields]
    end
    
    subgraph "Automatic Path"
        B -->|"automatic"| F[Get product collections/tags/vendor]
        F --> G[Match against OptionSet auto-rules]
        G -->|"Match found"| H[Load configurator from matched OptionSet]
        G -->|"No match"| I[No configurator shown]
        H --> E
    end
    
    subgraph "Data Stores"
        J[("Shopify\nProduct\nMetafield")]
        K[("Prisma\nOptionSet")]
    end
    
    C --> J
    F --> K
```

---

## DFD Level 2 — Storefront Configurator Flow

```mermaid
sequenceDiagram
    actor Customer
    participant ThemeExt as Theme App Extension
    participant ConfigJS as configurator.js
    participant CartFn as Cart Transform Function
    participant Shopify as Shopify Checkout
    
    Customer->>ThemeExt: View product page
    ThemeExt->>ThemeExt: Read product.metafields.app.configurator.value
    
    alt Metafield exists
        ThemeExt->>ThemeExt: Parse JSON, sort fields by displayOrder
        
        loop Each field
            ThemeExt->>ThemeExt: Render field element with data-* attributes
        end
        
        Customer->>ConfigJS: Select option value
        ConfigJS->>ConfigJS: Evaluate data-conditions
        ConfigJS->>ConfigJS: Show/hide dependent fields
        
        ConfigJS->>ConfigJS: Sum all data-price-delta values
        ConfigJS->>ThemeExt: Update displayed total
        
        Customer->>ConfigJS: Click "Add to Cart"
        ConfigJS->>ConfigJS: Gather selected values
        ConfigJS->>ConfigJS: Pack into _configurator JSON
        ConfigJS->>Shopify: Submit cart with _configurator property
    else No metafield
        ThemeExt->>ThemeExt: Render nothing (no configurator)
    end
```

### Data Flow — Add to Cart

```
Customer selections
  → configurator.js gathers {fieldId: {label, value, priceDelta}}
  → Packs into line item property "_configurator" (JSON string)
  → Submits to Shopify cart
  → Cart Transform Function reads:
      1. lineItem.attribute._configurator
      2. product.metafields.app.configurator
    → Matches selections to price deltas
    → Outputs cost.subtotalAdjustments
  → Shopify applies price adjusters to total
```

---

## DFD Level 2 — Cart Transform Function

```mermaid
graph TB
    Input["Cart Transform Input\ncart.lines[]\n  .attribute\n  .merchandise.product.metafield"]
    
    subgraph "run.js"
        Parse["Parse _configurator\nfrom line item attributes"]
        Lookup["Look up each selection\nin product metafield"]
        Calc["Sum price deltas\nfor all selections"]
        Output["Build FunctionRunResult\nwith subtotalAdjustments"]
    end
    
    Input --> Parse
    Parse --> Lookup
    Lookup --> Calc
    Calc --> Output
    Output --> Result["Cart updated\nwith adjusted total"]
```

---

## DFD Level 3 — Order Sync Flow

```mermaid
sequenceDiagram
    participant Shopify as Shopify
    participant Webhook as /webhooks/orders/create
    participant SyncService as hoodsly-sync.server.ts
    participant Prisma as Prisma (SyncLog)
    participant Mock as /mock/hoodslyhub
    
    Shopify->>Webhook: POST orders/create payload
    Webhook->>Webhook: HMAC verification
    Webhook->>Webhook: Parse order data
    
    Webhook->>Prisma: Create SyncLog (status: "pending")
    
    Webhook->>SyncService: syncOrder(payload)
    
    loop Retry up to 3 times
        SyncService->>Mock: POST /mock/hoodslyhub
        
        alt Success (200)
            Mock-->>SyncService: {"status": "received"}
            SyncService->>Prisma: Update SyncLog (status: "synced")
            SyncService-->>Webhook: Done
        else Failure (500 or network error)
            Mock-->>SyncService: Error/500
            SyncService->>Prisma: Update SyncLog (status: "failed", retryCount++)
            
            alt Retries remaining
                SyncService->>SyncService: Wait 2s/4s/8s (exponential backoff)
                Note over SyncService: Next attempt
            else No retries left
                SyncService->>Prisma: Update SyncLog (status: "permanently_failed")
                SyncService-->>Webhook: Max retries exceeded
            end
        end
    end
    
    Webhook-->>Shopify: Return 200 (acknowledge receipt)
```

### Retry Backoff Schedule

```
Attempt 1 → Delay 0s (immediate) → POST → Failure
Attempt 2 → Delay 2s              → POST → Failure
Attempt 3 → Delay 4s              → POST → Failure
Attempt 4 → Delay 8s              → POST → "permanently_failed"
```

---

## DFD Level 3 — Admin Sync Log Flow

```mermaid
sequenceDiagram
    actor Admin
    participant SyncLogUI as /app/sync-log
    participant SyncService as hoodsly-sync.server.ts
    participant Prisma as Prisma (SyncLog)
    participant Mock as /mock/hoodslyhub
    
    Admin->>SyncLogUI: Navigate to /app/sync-log
    SyncLogUI->>Prisma: SELECT * FROM SyncLog (with filters)
    Prisma-->>SyncLogUI: Return paginated rows
    SyncLogUI->>SyncLogUI: Render table with status badges
    
    Admin->>SyncLogUI: Filter by status (e.g., "failed")
    SyncLogUI->>Prisma: SELECT * FROM SyncLog WHERE status = "failed"
    Prisma-->>SyncLogUI: Filtered rows
    
    Admin->>SyncLogUI: Search by Order ID
    SyncLogUI->>Prisma: SELECT * FROM SyncLog WHERE orderId LIKE "%query%"
    Prisma-->>SyncLogUI: Matching rows
    
    Admin->>SyncLogUI: Click "Retry" on failed order
    SyncLogUI->>SyncService: retrySync(orderId)
    SyncService->>Prisma: Load SyncLog (reset retryCount, status -> "pending")
    SyncService->>Mock: POST /mock/hoodslyhub
    
    alt Success
        Mock-->>SyncService: 200 OK
        SyncService->>Prisma: Update SyncLog (status: "synced")
    else Failure
        Mock-->>SyncService: Error
        SyncService->>Prisma: Update SyncLog (status: "failed")
    end
    
    SyncService-->>SyncLogUI: Result
    SyncLogUI->>SyncLogUI: Refresh table
```

---

## DFD Level 3 — Mock HoodslyHub

```mermaid
sequenceDiagram
    participant Service as hoodsly-sync
    participant Mock as /mock/hoodslyhub
    participant Memory as In-Memory Store
    
    alt Normal mode
        Service->>Mock: POST /mock/hoodslyhub {orderId, customerEmail, ...}
        Mock->>Memory: Log request count + payload
        Mock-->>Service: 200 {"status": "received"}
    else Failure simulation
        Service->>Mock: POST /mock/hoodslyhub?fail=true {orderId, ...}
        Mock-->>Service: 500 {"error": "Simulated failure"}
    end
    
    Note over Service,Mock: GET /mock/hoodslyhub returns stats:
    Note over Service,Mock: { requestCount, lastPayload, failureMode }
```

---

## Entity-Relationship Flow

```mermaid
erDiagram
    Option ||--o{ OptionSet : "snapshot in"
    OptionSet ||--o{ OptionSetAssignment : "assigned to"
    OptionSet ||--o{ SyncLog : "not related"
    
    Option {
        string id PK
        string title
        string type
        string label
        boolean required
        string options "JSON"
        string placeholder
        string content
        datetime createdAt
        datetime updatedAt
    }
    
    OptionSet {
        string id PK
        string title
        boolean status
        int rank
        string assignmentType "manual|automatic"
        string autoCollections "JSON"
        string autoTags
        string autoVendor
        string fields "JSON array of ConfiguratorField"
        datetime createdAt
        datetime updatedAt
    }
    
    OptionSetAssignment {
        string id PK
        string optionSetId FK
        string productId "Shopify GID"
    }
    
    SyncLog {
        string id PK
        string shop
        string orderId UK
        string status "synced|pending|failed|permanently_failed"
        int retryCount
        datetime lastAttemptAt
        datetime nextRetryAt
        string errorMessage
        string payload "JSON"
        datetime createdAt
        datetime updatedAt
    }
```

---

## End-to-End Flows

### Happy Path — Manual Configurator

```
Admin creates Option "Color" (Red +$5, Blue +$0)       → Option table
Admin creates OptionSet "Hood Configurator"             → OptionSet table
  → Adds existing Option "Color"
  → Adds inline field "Size" (Large +$10)
  → Sets condition: Size visible when Color = Red
  → Sets assignment: Manual → [Product "Test Hoodie"]
  → Saves                                             → OptionSetAssignment table
                                                       → Admin GraphQL metafieldsSet
                                                         → product.metafields.app.configurator

Customer visits "Test Hoodie" product page
  → Theme App Extension reads metafield
  → Renders Color dropdown (Red, Blue)
  → Customer selects "Red"
  → JS evaluates conditions: conditions met → show Size
  → Price display: Base + $5
  → Customer selects "Large"
  → Price display: Base + $5 + $10
  → Customer clicks "Add to Cart"
  → JS packs _configurator = {color: "Red", size: "Large"}
  → Cart Transform Function reads _configurator + metafield
  → Outputs subtotalAdjustments = $15
  → Cart total = Base + $15

Customer completes checkout
  → Order created with line item property _configurator
  → orders/create webhook fires
  → SyncLog created (pending → synced)
  → Admin sees order with configurator selections in Shopify admin
```

### Failure Path — Order Sync

```
Shopify fires orders/create

Webhook handler:
  1. Parse order payload → {}
  2. Create SyncLog (status: "pending", retryCount: 0)
  3. Call syncOrder(payload)

syncOrder:
  Attempt 1:
    POST /mock/hoodslyhub?fail=true → 500
    Update SyncLog (status: "failed", retryCount: 1)
    Wait 2s
  
  Attempt 2:
    POST /mock/hoodslyhub?fail=true → 500
    Update SyncLog (status: "failed", retryCount: 2)
    Wait 4s
  
  Attempt 3:
    POST /mock/hoodslyhub?fail=true → 500
    Update SyncLog (status: "failed", retryCount: 3)
    Wait 8s
  
  Attempt 4:
    POST /mock/hoodslyhub?fail=true → 500
    Update SyncLog (status: "permanently_failed", retryCount: 4)

Admin views /app/sync-log:
  → Sees order with "permanently_failed" badge
  → Clicks "Retry"
  → syncOrder() runs again (attempts reset)
  → If mock returns 200 → status back to "synced"
```

---

## Data Flow Summary Table

| Flow | Source | Process | Storage | Destination | Protocol |
|---|---|---|---|---|---|
| Create Option | Admin browser | `app.options.$id.tsx` → `configurator.server.ts` | Prisma `Option` | — | HTTP POST |
| Create Option Set | Admin browser | `app.option-sets.$id.tsx` → `configurator.server.ts` | Prisma `OptionSet` + `OptionSetAssignment` | Shopify Admin GraphQL (metafieldsSet) | HTTP POST |
| Read configurator | Storefront browser | Theme App Extension `configurator.liquid` | Shopify product metafield | Storefront DOM | Liquid render |
| Calculate price | Storefront browser | `configurator.js` | — | Cart form | DOM JS |
| Cart transform | Shopify cart | `cart-transform/src/run.js` | Product metafield + line item props | Shopify checkout | GraphQL Function |
| Order sync | Shopify webhook | `webhooks.orders.create.tsx` → `hoodsly-sync.server.ts` | Prisma `SyncLog` | `/mock/hoodslyhub` | HTTP POST |
| View sync log | Admin browser | `app.sync-log.tsx` | Prisma `SyncLog` | Admin browser | HTTP GET |
| Retry sync | Admin browser | `app.sync-log.tsx` → `hoodsly-sync.server.ts` | Prisma `SyncLog` | `/mock/hoodslyhub` | HTTP POST |
