# ALSTORE Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every unspecified path in Firestore is strictly denied for all reads and writes.
2. **PII Isolation**: `users/{userId}` and `orders/{orderId}` contain PII (`email`, `whatsapp`, `accountId`). Reads (`get`, `list`) are strictly restricted to the owning verified user (`request.auth.uid == userId` / `resource.data.ownerUid == request.auth.uid`).
3. **Master Gate Relational Sync**: `users/{userId}/savedAccounts/{gameId}` requires the parent `users/{userId}` document to exist (`exists(...)`) and `userId == request.auth.uid`.
4. **Immutable Ownership & Financial Fields**: On `orders/{orderId}`, `invoiceId`, `ownerUid`, `basePrice`, `adminFee`, `uniqueCode`, `totalAmount`, `expiresAtMs`, and `createdAt` are immutable after creation.
5. **Terminal State Locking**: Once an order reaches `status == 'completed'` or `status == 'expired'`, no further client-side updates are permitted.
6. **Strict Server Timestamps**: `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
7. **Verified Account Writes**: All writes require `request.auth != null && request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Shadow Field Injection on User**: Creating `users/{uid}` with extra field `isAdmin: true`.
2. **Identity Spoofing on User**: Creating `users/{otherUid}` with `uid: request.auth.uid`.
3. **Unverified Email Write**: Creating an order with `email_verified: false`.
4. **Cross-User PII Read**: Reading `users/{otherUid}` as a signed-in non-owner.
5. **Orphaned SavedAccount**: Creating `users/{uid}/savedAccounts/mlbb` when parent `users/{uid}` does not exist.
6. **ID Poisoning**: Creating an order with a 200-character or special-character `orderId` (`../hack`).
7. **Order Identity Spoofing**: Creating `orders/ALS-20261234` with `ownerUid: "victim-uid"`.
8. **Forged Completed Status on Create**: Creating an order directly with `status: "completed"`.
9. **Price Tampering Update**: Updating `orders/ALS-20261234` to modify `totalAmount` from `28500` to `1`.
10. **Terminal State Bypass**: Updating an order whose existing `status` is `"completed"` or `"expired"`.
11. **Timestamp Forgery**: Creating an order with a client-forged `createdAt` timestamp instead of `request.time`.
12. **Blanket List Scraping**: Listing `orders` without scoping to `resource.data.ownerUid == request.auth.uid`.
