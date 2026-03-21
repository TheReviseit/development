# IMPLEMENTATION_PLAN.md

## 1. Problem Definition
- **Exact Requirement Breakdown**: 
  1. The bulk "Delete" button lacks functionality. 
  2. Pressing "Delete" must ask for confirmation via a modal before executing.
  3. "Other buttons" (Send Message, View Details, Add to Segment) are currently stubbed without interaction, frustrating the user's intent to navigate the CRM properly.
- **Functional requirements**: 
  - Wire the existing `ConfirmationModal` component to authorize deletion logic.
  - Plumb `Promise.all` bulk DELETE requests mapping to the backend endpoint natively handling singular HTTP standard operations cleanly.
  - Introduce a Trash-can action icon onto each row specifically for individual contact deletion.
  - Wire functional generic routing or alert-stubs onto the other interface buttons matching Next.js navigation flow standards.
- **Explicit Assumptions**: 
  - Standard REST definitions (`DELETE /api/contacts/<id>`) are sufficient, and the frontend should govern bulk loops via `Promise.all` rather than defining a custom bulk-delete ad-hoc endpoint over a generic REST architecture pattern.
  - The UI uses Next.js 14 App Router, so `useRouter` from `next/navigation` will be leveraged.

## 2. System Architecture
- **Layer**: Contextual UI State Layer & Navigation Layer.
- **Data Flow**: 
  - Delete Intent $\rightarrow$ Updates `pendingDeleteIds` state $\rightarrow$ Flips `isDeleteModalOpen` boolean.
  - Delete Authorization $\rightarrow$ Maps over `pendingDeleteIds` executing stateless `DELETE /api/contacts/<id>` fetches $\rightarrow$ Triggers React Query invalidation loop + cleans up `selectedContacts` subsets.

## 3. API & Contract Design
- **Action**: `DELETE /api/contacts/<contact_id>` (inherent to the existing Python Blueprint implementation).
- Requires `X-User-ID: <firebase_usr_uid>` header. Returns JSON payload with `success: true`.

## 4. File & Module Structure
- `frontend/app/dashboard/components/ContactsView.tsx` (Target Modification only)

## 5. Execution Plan (Atomic Steps)

### Step 1: Initialize New State Elements in `ContactsView.tsx`
- Setup routing: `import { useRouter } from "next/navigation"; const router = useRouter();`
- State hooks: 
  - `const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);`
  - `const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);`
  - `const [deleteLoading, setDeleteLoading] = useState(false);`

### Step 2: Implement `executeDelete()` logic
- Create an asynchronous function bound to `onConfirm` over the `ConfirmationModal`:
  - Enforce `deleteLoading = true`.
  - Gather `auth.currentUser`.
  - Build `Promise.all(pendingDeleteIds.map(...))` array running `fetch` with `method: "DELETE"`.
  - Catch failures alerting the user smoothly.
  - Upon success: Execute `refetch()`, filter `pendingDeleteIds` out from `selectedContacts`, and forcefully toggle `setIsDeleteModalOpen(false)`.

### Step 3: Wire Interface Buttons & Actions
- **Bulk Delete**: `onClick={() => { setPendingDeleteIds(selectedContacts); setIsDeleteModalOpen(true); }}`
- **Row Delete [NEW UI ELEMENT]**: Instantiate a Trash Icon SVG into `<div className={styles.cellActions}>`, replacing "View Details" (or resting next to it depending on real estate). Send `[contact.id]` directly to `setPendingDeleteIds`.
- **Bulk "Send Message"**: `onClick={() => router.push('/dashboard/bulk-messages')}`
- **Bulk "Add to Segment"**: `onClick={() => alert('Add to Segment coming soon')}`
- **Row "Message"**: `onClick={() => router.push('/dashboard/messages?phone=' + contact.phone_number)}`
- **Row "View Details"** (if preserved): `onClick={() => alert('View Details coming soon')}`

### Step 4: Render `ConfirmationModal` Output
- Append the `<ConfirmationModal>` block next to the `<AddContactModal>` at the base of the `ContactsView` return layout. Pass `isLoading={deleteLoading}`, inject Title strings, and bind confirmation handlers effectively.

## 6. Edge Cases & Failure Modes
- Single Deletions via Row Action unchecking selected contacts: Avoided deliberately by storing temporary execution state in `pendingDeleteIds` instead of overwriting the global array indiscriminately.
- Mixed Request Outcomes (1 delete succeeds, 2 fail): Simple bulk Promise handling. The user sees an alert, but the subsequent `refetch()` immediately verifies valid server-side alterations.

## 7. Performance & Scalability
- Deleting $\le$ 100 rows per loop via frontend Promises creates minimal HTTP multiplexing overhead and respects typical REST guidelines effectively without blocking thread loops. Time complexity is purely network-bound parallel concurrency.

## 8. Security Model
- Uses `auth.currentUser.uid` enforcing strong backend token validation per ID row ownership dynamically at the Database RLS level. Total data protection constraint adhered to.

## 9. Observability Plan
- Unhandled `Promise.all` breaks yield `console.error` logs safely.

## 10. Testing Strategy
- **Manual Verification**:
  1. Open Dashboard Contacts. Verify Next.js cache.
  2. Select two users. Click the bulk "Delete" action.
  3. Ensure a custom branded Confirmation modal appears. Click Cancel. Modal closes via generic state closure.
  4. Ensure checking "Delete" again and hitting "Confirm" processes loading behavior. Row disappears natively.
  5. Locate a single user row. Click the trash icon. Verify confirmation logic targets uniquely.
  6. Click "Send Message". Verify router properly navigates to `/dashboard/bulk-messages`.

## 11. Rollback Strategy
- Discard modifications from `frontend/app/dashboard/components/ContactsView.tsx` tracking back to previous layout commit.
