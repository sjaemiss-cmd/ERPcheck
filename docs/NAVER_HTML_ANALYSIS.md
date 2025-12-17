# Naver Reservation Partner Center HTML Analysis

**Date:** 2025-12-18
**Context:** Scraper logic for fetching Naver bookings.

## 1. Booking List Item (Repeated)
Each booking row is wrapped in a `div` and contains a main `a` tag (link).

- **Selector:** `div[class*="BookingListView__list-contents"]`
- **Or directly the Anchor:** `a[class*="BookingListView__contents-user"]`

*Recommendation:* Iterate over the `div` wrapper to ensure context, then scope searches within it.

## 2. Key Elements (Scoped within List Item)

| Field | Description | CSS Selector | Notes |
| :--- | :--- | :--- | :--- |
| **Name** | User's Name | `span[class*="BookingListView__name-ellipsis"]` | Text content (e.g., "양나경") |
| **Detail Link** | Clickable Area | `a[class*="BookingListView__contents-user"]` | The entire row is the link. `href` contains ID. |
| **Phone** | User's Phone | `.BookingListView__phone__i04wO span` | e.g. "010-5182-6325" |
| **Booking No.** | Unique ID | `.BookingListView__book-number__33dBa` | Text content (e.g., "1106382753") |
| **Status** | Status Label | `span[class*="label-round"]` | e.g. "확정", "취소" |
| **Checkbox** | Selection Checkbox | `input.check-radio` | For batch actions |

## 3. Playwright Implementation Strategy

```typescript
// 1. Find all rows
const rows = await page.$$('div[class*="BookingListView__list-contents"]');

for (const row of rows) {
    // 2. Extract Name
    const nameEl = await row.$('span[class*="BookingListView__name-ellipsis"]');
    const name = await nameEl?.innerText();

    // 3. Click for Detail (The whole row is clickable, but safer to click the Name area or empty space)
    // The anchor tag is the robust click target.
    const linkEl = await row.$('a[class*="BookingListView__contents-user"]');
    await linkEl?.click();
}
```

## 4. Helper Function: `extractBookingDetails` (Detail View)

Selectors extracted from Detail View HTML.

| Field | Description | CSS Selector | Notes |
| :--- | :--- | :--- | :--- |
| **Phone** | User Phone | `a[href^="tel:"]` | Extract innerText |
| **Date/Time** | Usage Date | `div:has(span:text-is("이용일시")) > span:nth-child(2)` | Text: "2025. 12. 18.(목) 오전 11:30" |
| **Product** | Product Name | `span[data-tst_biz_item_name]` | Text: "운전 연습..." |
| **Options** | Selected Options | `div:has(span:text-is("옵션")) .Summary__horizontal-unit__QvFA3` | |
| **Booking Status** | "확정" etc. | `span[data-tst_booking_status="0"]` | Main status badge |
| **Payment** | Payment Amount | `div:has(.Detail__item-title__C8WVj:text-is("결제예상금액")) .Detail__item-dsc__uOs57` | e.g. "0원" |

> **Note on Payment Status:** valid "Payment Status" text (like "결제완료") was not found in the provided snippet (possibly because amount is 0). If needed, check the "Booking Status" or look for a specifically named label in paid bookings.
