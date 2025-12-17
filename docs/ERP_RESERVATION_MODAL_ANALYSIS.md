# ERP "New Schedule" Modal Analysis

**Date:** 2025-12-18
**Context:** Logic for programmatically injecting reservations into the legacy ERP.

## Modal Structure

### Selectors
- **Modal ID:** `#CalenderModalNew` (triggered by button or JS `$('#CalenderModalNew').modal('show')`)
- **Form Action:** `/index.php/dataFunction/insBooking`
- **Submit Button:** `.antosubmit` (triggers `insFormChk(this)`)

### Key Dependencies
> [!IMPORTANT]
> **Machine Selection Dependency:**
> The `#insMachine` dropdown is **empty** by default. It is populated via AJAX only AFTER:
> 1. `#insDate` value changes.
> 2. `$('#insDate').trigger('change')` is fired.
> 
> *Automation Logic must wait for `#insMachine option` length > 1 before selecting.*

### Form Fields

| Field Label | DOM Selector | Type | Notes |
| :--- | :--- | :--- | :--- |
| **Schedule Type** | `input[name="type"]` | Radio | Value `B` (Book) or `C` (Consult). Default `B`. |
| **Date** | `#insDate` | Input (Datepicker) | Format `yyyy-mm-dd`. Triggers machine list load. |
| **Start Time** | `#insStime` (Hour), `#insStime_min` (Min) | Select | Hours: 07-22, Mins: 00/30. |
| **End Time** | `#insEtime` (Hour), `#insEtime_min` (Min) | Select | Hours: 07-23, Mins: 00/30. |
| **Machine/Seat** | `#insMachine` | Select | Dynamic. Contains `dobong-X` or numeric values. |
| **Member Type** | `input[name="member_type"]` | Radio | **Crucial Split**: <br> - `M` (Existing): `.type_member_a` <br> - `J` (Direct Join): `.type_member_b` |
| **Existing Member** | `#member_select` | Select (Select2) | Used when `member_type=M`. Contains extensive list of `member_idx` and names. |
| **New Member Name** | `#member_ins_name` | Input | Used when `member_type=J` (Direct Join). |
| **Phone** | `#insPhone` | Input | Used when `member_type=J`. |
| **Product** | `select[name="goods_idx"]` | Select | e.g., 6268 (1-hour), 6269 (course). Logic required to map external string to ID. |
| **Payment** | `.payment_select` | Select | `12` = Naver Pay (often used for external bookings). |

### Member Linkage Logic
- **Goal:** Link external Naver booking to existing ERP member if possible.
- **Process:**
    1. Check `type_member_a` (Existing).
    2. Search `#member_select` options for exact name match.
    3. If found -> Select value (Member ID).
    4. If not found -> Switch to `type_member_b` (Direct Join) -> Fill Name/Phone.
