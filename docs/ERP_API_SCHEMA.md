# ERP Reservation Creation API Schema

**Endpoint:** `/index.php/dataFunction/insBooking`
**Method:** `POST`
**Content-Type:** `application/x-www-form-urlencoded` (Standard Form Data)

## Request Payload (Form Data)

These fields are submitted when creating a new reservation.

### 1. General Info
| Field Name | Description | Required | Example |
| :--- | :--- | :--- | :--- |
| `booking_date` | Date of reservation | **Yes** | `2025-12-18` |
| `type` | Schedule Type | **Yes** | `B` (Reservation), `C` (Consult) |
| `ins_emp_id` | Instructor/Admin ID | No | (Auto-filled by session) |

### 2. Time
| Field Name | Description | Required | Example |
| :--- | :--- | :--- | :--- |
| `stime` | Start Hour | **Yes** | `14` |
| `stime_min` | Start Minute | **Yes** | `00` or `30` |
| `etime` | End Hour | **Yes** | `15` |
| `etime_min` | End Minute | **Yes** | `00` or `30` |

### 3. Machine (Seat)
| Field Name | Description | Required | Note |
| :--- | :--- | :--- | :--- |
| `machine_info_idx` | Machine ID | **Yes** | Values like `dobong-1` or Integer IDs. **Dynamic**: Options load only after Date selection. |

### 4. Member Information
**Mode A: Existing Member** creates a link to a registered user.
**Mode B: New Member** creates a standalone record (Direct Join).

| Field Name | Mode | Description | Example |
| :--- | :--- | :--- | :--- |
| `member_type` | Both | Member Mode | `M` (Existing), `J` (New) |
| `member_name` | **Existing** | Member ID/Value | Selected from dropdown value (e.g., `1943`) |
| `member_ins_name`| **New** | Member Name | `홍길동` |
| `phone` | **New** | Phone Number | `010-1234-5678` |
| `birth` | **New** | Birth Date | `2000-01-01` (Constructed from year/month/day dropdowns) |

### 5. Product & Payment
| Field Name | Description | Required | Note |
| :--- | :--- | :--- | :--- |
| `goods_idx` | Product ID | **Yes** | e.g., `6268` (1-hour), `6272` (1-jong). |
| `payment_idx` | Payment Method | No | `12` = Naver Pay (Common for external) |
| `option` | Option String | No | Additional details |

---

## Analysis of User-Provided JSON
The JSON data you provided (`[{"id":"1913010", ...}]`) identifies as the **GET Response** for the Calendar View, not the **POST Request** for creating a reservation.

- **Response Data** shows what exists *after* saving (ID, Title, Plan).
- **Request Data** (documented above) is what must be *sent* to create it.
