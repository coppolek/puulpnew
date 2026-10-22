# Security Spec & Data Invariants for FeedForge

## 1. Data Invariants
- Feeds must have a valid `url` (valid string <= 2048 chars, >= 5 chars).
- Feeds must have a valid `title` (string <= 500 chars).
- Feeds must have an `interval` between 15 and 1440 minutes.
- Document IDs must conform to `isValidId` (`^[a-zA-Z0-9_-]+$`, max 128 chars).
- `xml` field must be a valid string <= 500000 chars.
- Subscriptions must have a valid `email` (>= 5 chars, <= 256 chars) and a `pages` list (<= 100 entries).
- Notifications must have `title` (<= 300 chars), `link` (<= 2048 chars), and `createdAt` (<= 100 chars).
- No unauthorized field additions (strict key enforcement).

## 2. The Dirty Dozen Payloads
1. **Oversized URL Injection**: `{ url: "a".repeat(3000), title: "Test", interval: 60, xml: "<rss/>" }` -> REJECT (maxLength: 2048)
2. **Missing Required Field URL**: `{ title: "Test", interval: 60, xml: "<rss/>" }` -> REJECT (required keys missing)
3. **Missing Required Field Title**: `{ url: "https://example.com", interval: 60, xml: "<rss/>" }` -> REJECT (required keys missing)
4. **Invalid Interval Type**: `{ url: "https://example.com", title: "Test", interval: "hourly", xml: "<rss/>" }` -> REJECT (interval not a number)
5. **Negative Interval Injection**: `{ url: "https://example.com", title: "Test", interval: -10, xml: "<rss/>" }` -> REJECT (interval < 15)
6. **Massive XML Payload Attack**: `{ url: "https://example.com", title: "Test", interval: 60, xml: "X".repeat(600000) }` -> REJECT (xml > 500k)
7. **Document ID Path Poisoning**: ID with spaces/slashes `../../bad_id` -> REJECT (isValidId check)
8. **Ghost Field Injection (Privilege Escalation)**: `{ url: "https://example.com", title: "Test", interval: 60, xml: "<rss/>", isAdmin: true }` -> REJECT (hasOnly schema keys)
9. **Non-Array Items Injection**: `{ url: "https://example.com", title: "Test", interval: 60, xml: "<rss/>", items: "not-an-array" }` -> REJECT (type check)
10. **Arbitrary Object as Title**: `{ url: "https://example.com", title: { evil: true }, interval: 60, xml: "<rss/>" }` -> REJECT (title must be string)
11. **Malicious Protocol Injection**: Empty or corrupted URL -> REJECT (min size 5)
12. **Catch-All Wildcard Exploit**: Accessing an undeclared collection `/internal_secrets/admin` -> REJECT (default-deny catch-all)
