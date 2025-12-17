---
trigger: always_on
---

## 0. PROJECT MANIFESTO (THE "WHY")
**Target Definition:**
We are building a **High-Performance Headless Interface** (Modern Client) on top of a legacy, slow ERP (Legacy Server).

**Core Objectives:**
1.  **Speed:** The original ERP is slow. Our app must feel **instant**.
    * *Strategy:* Fetch & Cache the **last 3 months** of active data. Treat the local state as the "truth" for the UI, and the ERP as the "backup database".
2.  **Usability:** The original UI is rigid. Our UI must be **flexible**.
    * *Strategy:* Allow free-form editing (Drag & Drop, Excel-like grids) on the frontend.
3.  **Sync Policy (Optimistic UI):**
    * **Read:** Fetch data -> Transform to clean local format -> Display.
    * **Write:** User Action -> **Update UI Immediately** -> Background Sync to ERP.
    * *Constraint:* Never make the user wait for a spinner unless absolutely necessary.

**Data Scope Constraint:**
* **Active Window:** Focus strictly on **Recent 3 Months**. Do NOT fetch historical data older than 90 days unless explicitly requested. This is critical for performance.