# Naver to ERP Synchronization Logic

**Date:** 2025-12-18
**Purpose:** Define how to map Naver Reservation data to ERP fields and the overall validataion/insertion flow.

## 1. Data Mapping Table (JSON)

This JSON defines the rules for converting Naver "Product/Options" into ERP "Goods IDs".

```json
{
  "product_mapping": [
    {
      "naver_keywords": ["1종", "자동"],
      "erp_goods_idx": "6272",
      "note": "1종 보통 (자동)"
    },
    {
      "naver_keywords": ["2종", "자동", "기능"],
      "erp_goods_idx": "6268",
      "note": "2종 자동 (기본)"
    },
    {
      "naver_keywords": ["2종", "도로"],
      "erp_goods_idx": "6272",
      "note": "2종 도로주행 (Requires verification of ID)"
    },
    {
      "naver_keywords": ["장롱", "연수"],
      "erp_goods_idx": "6269",
      "note": "시간제/장롱면허 (6시간?)"
    },
    {
      "naver_keywords": ["체험"],
      "erp_goods_idx": "6268",
      "note": "무료 체험 -> 기본 상품으로 매핑"
    }
  ],
  "field_transformation": {
    "date": {
      "source_format": "YYYY. MM. DD.(ddd) A hh:mm",
      "source_example": "2025. 12. 18.(목) 오전 11:30",
      "target_format": "YYYY-MM-DD",
      "logic": "Regex parse: /(\\d{4})\\. (\\d{1,2})\\. (\\d{1,2})/ -> $1-$2-$3"
    },
    "time": {
      "source_example": "오전 11:30",
      "target_format": "HH:mm",
      "logic": "Convert '오후 7:51' to 19:51. Split '11:30' -> stime=11, stime_min=30. Duration default = 1hr (create end_time)"
    },
    "phone": {
      "source_format": "010-XXXX-XXXX",
      "logic": "Keep as is or strip dashes if ERP requires."
    }
  }
}
```

> **Note:** The `erp_goods_idx` values "6268", "6272" etc. are taken from the legacy Python code. These **must** be verified against the live ERP `<select>` options in production.

## 2. Synchronization Pseudo-Code

**Objective:** Fetch Naver bookings and inject them into ERP only if they don't already exist.

```typescript
async function syncNaverToErp() {
    // 1. Fetch Data
    const naverBookings = await scraperService.getNaverBookings();
    
    // Sort by date to process efficiently
    const targetDate = naverBookings[0].date; // Assuming batch or daily sync
    
    // 2. Fetch Existing ERP Schedule for context
    // We need to know what's already there to prevent duplicates
    const erpSchedule = await erpService.getSchedule(targetDate);
    
    for (const booking of naverBookings) {
        console.log(`Processing: ${booking.user_name} (${booking.time})`);
        
        // --- A. Duplicate Check ---
        // Definition of Duplicate: Same Name + Same Date + Same Start Time
        const exists = erpSchedule.some(erpEvent => {
            const isNameMatch = erpEvent.title.includes(booking.user_name);
            const isTimeMatch = erpEvent.start.includes(booking.time_start); // e.g., "11:00:00"
            return isNameMatch && isTimeMatch;
        });

        if (exists) {
            console.log(`[SKIP] Already exists in ERP: ${booking.user_name}`);
            continue;
        }

        // --- B. Data Preparation ---
        // Map Naver Product -> ERP Goods ID
        const goodsId = mapProductToGoodsId(booking.product, booking.options);
        
        // Calculate Time (Naver gives Start, assume 1h or 2h duration based on product?)
        // Defaulting to 1 hour for now, or parsing "1시간" from option string
        const endTime = calculateEndTime(booking.time_start, booking.options); 
        
        const erpPayload = {
            date: booking.date,         // "2025-12-18"
            start_time: booking.time_start, // "11:30"
            end_time: endTime,          // "12:30"
            name: booking.user_name,
            phone: booking.phone,
            product: booking.product,
            option: booking.options,
            goods_idx: goodsId,
            memberType: 'existing',     // Try linking first
            payment_type: 'naver'       // '12'
        };

        // --- C. Injection ---
        try {
            const result = await erpService.addReservation(erpPayload);
            if (result) {
                console.log(`[SUCCESS] Created reservation for ${booking.user_name}`);
            } else {
                console.error(`[FAIL] ERP rejected reservation for ${booking.user_name}`);
            }
        } catch (error) {
            console.error(`[ERROR] System error during injection: ${error}`);
        }
        
        // Optional: Throttle to prevent overwhelming the server
        await sleep(1000);
    }
}
```

## 3. Exception Handling Policy

1.  **Parsing Errors:** If Naver date/time format changes, log validation error and **skip** that record. Do not crash the sync process.
2.  **Seat Full (ERP):** `addReservation` already has retry logic for seats. If it fails after 5 retries, the function returns `false`. Log this as "Manual Intervention Required".
3.  **Ambiguous Product:** If product mapping misses, default to "Standard Course (6268)" and log a warning.
4.  **Network Failure:** If ERP goes down mid-sync, catch exception, pause 10s, retry once, then abort batch.
