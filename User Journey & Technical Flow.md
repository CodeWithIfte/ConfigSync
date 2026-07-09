# ConfigSync — User Journey & Technical Flow

## 1. User Personas

| Persona | Role | Goals |
|---|---|---|
| **Admin** | Store administrator | Create configurator definitions, assign to products, monitor order sync |
| **Customer** | Storefront shopper | Configure product, see price updates, complete checkout |
| **Developer** | App maintainer | Debug sync issues, understand system behavior |

---

## 2. Admin Journeys

### Journey A: Create a Reusable Option (Field Template)

**Entry**: Admin clicks "Create new option" from anywhere in the app

```mermaid
flowchart LR
    A["Click\n'Create new option'"] --> B["Type selector overlay\nshows 4 type cards"]
    B --> C["Admin selects:\ndropdown/radio/text/info_block"]
    C --> D["Navigate to\n/app/options/new?type=dropdown"]
    D --> E["Enter title & label"]
    E --> F["Toggle required"]
    F --> G{"Type?"}
    G -->|dropdown/radio| H["Add option rows\nwith isDefault, add-on"]
    G -->|text| I["Set placeholder"]
    G -->|info_block| J["Write content"]
    H --> K["For each option row:"]
    K --> L["Label + Value"]
    L --> M["isDefault checkbox"]
    M --> N["Add-on type selector\nNone | Price | Product"]
    N --> O{"Add-on type?"}
    O -->|Price| P["Enter $ price\n(positive int, cents)"]
    O -->|Product| Q["Product search\npick Shopify product"]
    O -->|None| R[ ]
    P --> S["Click Save"]
    Q --> S
    R --> S
    I --> S
    J --> S
    S --> T["Redirect\nback to Option Set\nor /app"]
```

**Technical flow**:

```
Step | User Action               | Frontend                           | Backend                      | Data Store
------+---------------------------+------------------------------------+------------------------------+---------------------------
1     | Click "Create new option"  | app.option-sets.$id.tsx or dashboard | —                          | —
2     | See type selector overlay  | TypeSelector component              | —                          | —
3     | Select type (e.g., dropdown) | navigate("/app/options/new?type=dropdown") | —                    | —
4     | Navigate to create page    | app.options.$id.tsx reads ?type=    | loader → authenticate.admin  | —
5     | Fill title, label, toggle required | Polaris form components       | —                            | —
6     | Add option rows            | add/remove rows in state           | —                            | —
7     | Per row: set label, value, isDefault | checkbox + text inputs       | —                            | —
8     | Per row: set add-on type   | select: None/Price/Product        | —                            | —
9     | Per row: if Price, enter amount     | number input               | —                            | —
10    | Per row: if Product, search product | Product combobox            | Admin GraphQL products(query:) | Shopify products
11    | Click Save                | ui-save-bar → fetcher.submit      | action → configurator.server.ts | —
12    | —                         | —                                  | saveOption(data)             | Zod validate data
13    | —                         | —                                  | prisma.option.create(data)   | Option table
14    | —                         | —                                  | Return Option.id             | —
15    | —                         | toast.show("Saved")                | —                            | —
16    | Redirected                | navigate(?returnTo or /app)        | —                            | —
```

**Validation rules applied by Zod**:
- `title`: required, string, max 255 chars
- `type`: required, enum ["dropdown", "radio", "text", "info_block"]
- `label`: required, string
- `options`: required if type is dropdown/radio, array of:
  - `{label, value}`: required strings
  - `isDefault`: boolean
  - `addOnType`: enum ["none", "price", "product"]
  - `priceDelta`: required positive int (cents) if addOnType = "price"
  - `addOnProductId`: required string (Shopify GID) if addOnType = "product"
- `placeholder`: string, only for type "text"
- `content`: string, only for type "info_block"

---

### Journey B: Create an Option Set (Configurator) + Assign to Products

**Entry**: Admin navigates to `/app/option-sets/new`

```mermaid
flowchart LR
    A["Navigate to\n/app/option-sets/new"] --> B["Enter title & rank"]
    B --> C["Set status\nActive/Draft"]
    C --> D["Add fields to configurator"]
    D --> E{"How to add?"}
    E -->|Inline| F["Type field details\ntype/label/options/conditions"]
    E -->|Existing Option| G["Open picker\n→ select from list"]
    E -->|New Option| H["Navigate to\n/app/options/new"]
    F --> I["Configure visibility conditions"]
    G --> I
    H --> I
    I --> J["Set product assignment"]
    J --> K{"Assignment type?"}
    K -->|Manual| L["Search & select\nspecific products"]
    K -->|Automatic| M["Select collections\nenter tags, choose vendor"]
    L --> N["Click Save"]
    M --> N
    N --> O["OptionSet saved\nto Prisma"]
    O --> P["Manual only:\nmetafieldsSet to products\n+ OptionSetAssignment rows"]
```

**Technical flow — Full Save**:

```
Step | User Action                  | Frontend                          | Backend                                    | Data Store
------+------------------------------+-----------------------------------+--------------------------------------------+---------------------------
1     | Navigate to /app/option-sets/new | app.option-sets.$id.tsx          | loader → authenticate.admin                | —
2     | Fill title, rank, fields    | React state (fields[])            | —                                          | —
3     | Add inline field            | push to fields[], update UI       | —                                          | —
4     | Add existing Option         | fetch /app/options (API or loader)| getOptions() → prisma.option.findMany()    | Option table
5     |                               | snapshot Option definition into fields[] | —                                    | —
6     | Configure conditions        | update fields[i].conditions[]    | —                                          | —
7     | Manual: search products     | Admin GraphQL products(query:)    | —                                          | Shopify products
8     | Automatic: set rules         | store autoCollections, autoTags, autoVendor | —                                   | —
9     | Click Save                  | ui-save-bar → fetcher.submit     | action → saveOptionSet(data)               | —
10    | —                           | —                                | Zod validation on fields JSON               | —
11    | —                           | —                                | prisma.optionSet.upsert()                  | OptionSet table
12    | —                           | —                                | prisma.optionSetAssignment.deleteMany()    | Assignment table
13    | —                           | —                                | prisma.optionSetAssignment.createMany()    | Assignment table
14    | —                           | —                                | For each manual product:                    |
15    | —                           | —                                |   admin.graphql(metafieldsSet)             | Product metafield
16    | —                           | —                                | Return success                             | —
17    | —                           | shopify.toast.show("Saved")      | —                                          | —
18    | Redirected to /app           | navigate("/app")                 | —                                          | —

```

**Products affected per assignment type**:

```
Manual:
  → OptionSetAssignment[optionSetId, productId1]
  → OptionSetAssignment[optionSetId, productId2]
  → productId1.metafields.app.configurator = JSON.stringify(fields)
  → productId2.metafields.app.configurator = JSON.stringify(fields)

Automatic:
  → OptionSet.autoCollections = "[collectionId1, collectionId2]"
  → OptionSet.autoTags = "premium,limited"
  → OptionSet.autoVendor = "Acme Inc"
  → NO metafield writes (resolved at render time)
```

---

### Journey C: View & Retry Order Sync

**Entry**: Admin navigates to `/app/sync-log`

```mermaid
flowchart LR
    A["Navigate to\n/app/sync-log"] --> B["View all SyncLogs\npaginated table"]
    B --> C["Filter by status\nor search by Order ID"]
    C --> D["Find failed order"]
    D --> E{"Click Retry?"}
    E -->|Yes| F["POST retry\n→ syncOrder runs"]
    F --> G{"Result?"}
    G -->|Success| H["Status → synced\nrefresh table"]
    G -->|Failure| I["Status → failed\nretryCount++"]
    E -->|No| J["Exit"]
```

**Technical flow — Retry**:

```
Step | User Action            | Frontend              | Backend                          | Data Store
------+------------------------+-----------------------+----------------------------------+---------------------------
1     | Navigate to /app/sync-log | app.sync-log.tsx    | loader → prisma.syncLog.findMany() | SyncLog table
2     | Filter by "failed"     | client-side filter    | —                                | —
3     | Click "Retry"          | fetcher.submit({orderId}) | action → hoodsly-sync.server.ts | —
4     | —                      | —                     | Load SyncLog by orderId           | SyncLog table
5     | —                      | —                     | Reset retryCount = 0              | SyncLog table
6     | —                      | —                     | POST /mock/hoodslyhub             | Mock endpoint
7     | —                      | —                     | On 200: status = "synced"         | SyncLog table
8     | —                      | —                     | On 500: status = "failed"         | SyncLog table
9     | Table refreshes        | revalidate loader     | Return updated SyncLog            | —
```

---

## 3. Customer Journey

### Journey D: Configure Product on Storefront

**Entry**: Customer visits a product page that has a configurator

```mermaid
sequenceDiagram
    actor Customer
    participant Storefront as Product Page
    participant ThemeExt as Theme App Extension
    participant ConfigJS as configurator.js
    participant Shopify as Shopify Cart/Checkout

    Customer->>Storefront: Visit product page
    Storefront->>ThemeExt: Load app block
    
    Note over ThemeExt: Check for metafield
    
    alt Has metafield
        ThemeExt->>ThemeExt: Render configurator fields
        ThemeExt->>ThemeExt: Set data-* attributes on each field
        
        Customer->>ConfigJS: Select "Red" from Color dropdown
        ConfigJS->>ConfigJS: Evaluate conditions on all fields
        ConfigJS->>ConfigJS: Show "Size" field (condition met)
        ConfigJS->>ConfigJS: Calculate price: +$5 (Red)
        ConfigJS->>ThemeExt: Update price display to "$105.00"
        
        Customer->>ConfigJS: Select "Large" from Size radio
        ConfigJS->>ConfigJS: Calculate price: +$5 + $10 = $15
        ConfigJS->>ThemeExt: Update price display to "$115.00"
        
        Customer->>ConfigJS: Click "Add to Cart"
        ConfigJS->>ConfigJS: Gather {color: Red (+$5), size: Large (+$10)}
        ConfigJS->>ConfigJS: JSON.stringify → "_configurator" property
        ConfigJS->>Shopify: Submit cart form with property
        
        Note over Shopify: Cart Transform Function fires
        Shopify->>Shopify: Read _configurator property
        Shopify->>Shopify: Read product metafield
        Shopify->>Shopify: Match selections → $15 adjuster
        Shopify->>Shopify: Cart total = $115
        Shopify-->>Customer: Confirm item in cart
        
        Customer->>Shopify: Complete checkout
        Shopify-->>Customer: Order confirmed
        
        Note over Shopify: Order line item has "_configurator" property
        Note over Shopify: orders/create webhook fires
    else No metafield
        ThemeExt->>ThemeExt: Render nothing (hidden)
    end
```

### Conditional Visibility — Decision Tree

```
Customer selects Color = "Red"
  → JS iterates all fields' conditions
  → For field "Size":
       conditions = [{sourceFieldId: "color", operator: "equals", value: "Red"}]
       → Check: current value of field "color" === "Red" → true
       → Show "Size" field (display: block)
  → For field "Trim":
       conditions = [{sourceFieldId: "color", operator: "not_equals", value: "Blue"}]
       → Check: current value of field "color" === "Red" → "Red" !== "Blue" → true
       → Show "Trim" field
  → Fields with no conditions → always visible
  → Fields where conditions fail → hidden (display: none)
```

### Price Calculation — Customer View

```
                 ┌─────────────────────────┐
                 │  Premium Range Hood      │
                 │  Base Price: $100.00     │
                 ├─────────────────────────┤
                 │  Color: ● Red [+$5.00]  │  ← dropdown
                 │         ○ Blue          │
                 ├─────────────────────────┤
                 │  Size:  ○ Small         │  ← radio, shown when
                 │         ● Large [+$10]  │     Color = Red
                 ├─────────────────────────┤
                 │  Total: $115.00         │  ← live update
                 ├─────────────────────────┤
                 │  [ + Add to Cart ]      │
                 └─────────────────────────┘
```

---

## 4. Technical Flows

### Flow 1: Option CRUD

```mermaid
stateDiagram-v2
    [*] --> ListOptions: GET /app/options
    ListOptions --> CreateOption: Click "New"
    ListOptions --> EditOption: Click row
    
    CreateOption --> SavingOption: Submit form
    EditOption --> SavingOption: Submit form
    
    SavingOption --> Created: Zod valid, prisma.create()
    SavingOption --> ValidationError: Zod invalid
    ValidationError --> CreateOption: Show errors
    
    Created --> ListOptions: Redirect
    
    ListOptions --> DeletingOption: Click "Delete"
    DeletingOption --> ListOptions: prisma.delete()
```

### Flow 2: Option Set Save with Manual Assignment

```mermaid
stateDiagram-v2
    [*] --> Editor: Navigate to /app/option-sets/:id
    Editor --> DirtyState: User makes change
    DirtyState --> Saving: Click Save
    
    Saving --> ValidatingFields: Collect fields[] from state
    ValidatingFields --> InsertingOptionSet: Zod OK
    ValidatingFields --> Editor: Zod error → toast
    
    InsertingOptionSet --> PrismaUpsert: prisma.optionSet.upsert()
    PrismaUpsert --> DeletingOldAssignments: prisma.optionSetAssignment.deleteMany()
    DeletingOldAssignments --> InsertingAssignments: prisma.optionSetAssignment.createMany()
    
    InsertingAssignments --> ManualCheck: is assignmentType = "manual"?
    ManualCheck --> WritingMetafields: Yes → for each product
    ManualCheck --> Done: No (automatic)
    
    WritingMetafields --> MetafieldSuccess: admin.graphql(metafieldsSet)
    WritingMetafields --> MetafieldError: GraphQL error
    MetafieldError --> Done: Partial failure → toast warning
    MetafieldSuccess --> Done: All metafields written
    
    Done --> [*]: Redirect to /app
```

### Flow 3: Automatic Assignment Resolution at Storefront

This flow happens on every product page load when no metafield exists yet.

```mermaid
flowchart TD
    A["Product page loads"] --> B{"product.metafields\n.app.configurator\n exists?"}
    B -->|"Yes (manual)"| C["Render fields from metafield"]
    B -->|"No/null"| D["Fetch product\ncollections, tags, vendor"]
    D --> E["Query Prisma:\nOptionSets WHERE\nassignmentType = 'automatic'"]
    E --> F["For each automatic OptionSet:"]
    F --> G{"Product matches\nall rules?"}
    
    G -->|"Check collections"| H{"Product in any\nof autoCollections?"}
    H -->|"No"| I["Skip OptionSet"]
    H -->|"Yes or not set"| J{"Product tags\ncontain autoTags?"}
    
    J -->|"No"| I
    J -->|"Yes or not set"| K{"Product vendor\nmatches autoVendor?"}
    
    K -->|"No"| I
    K -->|"Yes or not set"| L["Match found"]
    
    L --> M["Render fields from\nmatched OptionSet"]
    I --> N["No matching\nOptionSet → no configurator"]
    
    M --> O["Fields displayed\nwith conditions + price deltas"]
    N --> P["Standard product page\nno configurator"]
```

### Flow 4: Order Sync — Full Lifecycle

```mermaid
stateDiagram-v2
    [*] --> OrderPlaced: Shopify fires orders/create
    
    OrderPlaced --> ParsingPayload: Webhook handler
    ParsingPayload --> CreatingSyncLog: Extract orderId, email, items, address, total
    CreatingSyncLog --> Pending: prisma.syncLog.create(status="pending")
    
    Pending --> AttemptSync: syncOrder()
    AttemptSync --> RetryWait: POST failed (500/timeout)
    AttemptSync --> Synced: POST succeeded (200)
    
    RetryWait --> AttemptSync: retryCount < 3
    RetryWait --> PermanentlyFailed: retryCount >= 3
    
    Synced --> [*]
    PermanentlyFailed --> [*]
    
    PermanentlyFailed --> AttemptSync: Admin clicks "Retry"
```

### Flow 5: Cart Transform Function Execution

```mermaid
flowchart TD
    A["Cart line added\nwith _configurator property"] --> B["Cart Transform\nFunction triggered"]
    B --> C["For each cart line:"]
    C --> D["Read line.attribute\nkey = '_configurator'"]
    D --> E{"Has _configurator\nproperty?"}
    E -->|"No"| F["Skip line\n(not configurable)"]
    E -->|"Yes"| G["Parse JSON"]
    G --> H["Read product metafield\napp.configurator"]
    H --> I["For each selection in\n_configurator:"]
    I --> J["Find matching field\n+ option in metafield"]
    J --> K["Extract priceDelta"]
    K --> L["Sum all priceDeltas"]
    L --> M["Build\nsubtotalAdjustment:"]
    M --> N["output.cost\n.subtotalAdjustments\n.push({...})"]
    N --> O["Return FunctionRunResult"]
```

### Flow 6: Admin Sync Log Filters

```mermaid
flowchart LR
    A["SyncLog table"] --> B["Search bar\n(order ID)"]
    A --> C["Status filter"]
    
    B --> D["Client-side filter\nby orderId"]
    C --> E["Filter by status"]
    D --> F["Render filtered rows"]
    E --> F
    
    F --> G["Each row:"]
    G --> H["Status badge color"]
    G --> I["Retry button\n(status = failed\nor permanently_failed)"]
    
    I --> J["POST /app/sync-log\n{action: 'retry', orderId}"]
    J --> K["syncOrder() re-runs"]
```

---

## 5. Error Handling Flows

### Scenario: Admin saves Option Set but GraphQL metafieldsSet fails

```
1. Prisma OptionSet saved successfully
2. Prisma OptionSetAssignment saved successfully
3. Shopify GraphQL metafieldsSet for product A → success
4. Shopify GraphQL metafieldsSet for product B → ERROR (product deleted?)
5. System behavior:
   → Individual failure per product does NOT rollback the entire save
   → Remaining products continue (product C, D are written)
   → Toast shows: "Saved with warnings: 1 product failed"
   → Error logged to console
   → Admin can edit and re-save to retry failed products
```

### Scenario: Webhook receives order but HoodslyHub is down

```
1. orders/create webhook received → HTTP 200 returned immediately
2. SyncLog created with status "pending"
3. syncOrder() called in background:
   → Attempt 1: POST fails (connection refused) → wait 2s
   → Attempt 2: POST fails (timeout) → wait 4s
   → Attempt 3: POST fails (500) → wait 8s
   → Attempt 4: POST fails → status = "permanently_failed"
4. Admin views /app/sync-log → sees permanently_failed
5. Admin clicks Retry after HoodslyHub is restored
6. syncOrder() runs again, succeeds → status = "synced"
```

### Scenario: Customer adds configurable product without _configurator property

```
1. Cart Transform Function receives line
2. line.attribute("_configurator") is null
3. Function does NOT add any subtotalAdjustment
4. Customer pays base price only
5. No configurator data appears in line item properties
```

---

## 6. Flow Timing & Dependencies

```mermaid
timeline
    title Configurator Lifecycle — Time Sequence
    Admin creates Option : ~2 minutes
    Admin creates OptionSet : ~5 minutes
    Admin assigns to product : ~1 minute
    --- : Product configurator live
    Customer browses product : ~10 seconds
    Customer configures : ~30 seconds
    Customer adds to cart : ~2 seconds
    Cart Transform executes : < 1 second
    Customer checks out : ~2 minutes
    --- : Order created
    orders/create webhook : < 1 second
    syncOrder() attempts : 0-30 seconds
    Admin views sync log : ~5 seconds
```

---

## 7. Cross-Flow Dependencies

| Flow | Depends On | Triggered By | Async? |
|---|---|---|---|
| Option CRUD | — | Admin UI action | No |
| Option Set CRUD | Option data (for "add existing") | Admin UI action | No |
| Product metafield write | OptionSet saved | Option Set save (manual) | No (sequential per product) |
| Storefront render | Product metafield (manual) OR | Product page load | No |
|  | OptionSet auto-rules (automatic) | | |
| Cart transform | Cart line with `_configurator` | Add to cart | No |
| Order sync webhook | Order created | Shopify event | No |
| Retry sync | Failed SyncLog | Admin manual click | Yes (awaited) |
| Sync log view | SyncLog data | Admin navigation | No |
