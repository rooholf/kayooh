> Act as the Lead Platform Architect defined in `@AGENTS.md`. Read `@SRS_Jambi_Bike_Rental_Platform.md` and `@Jambi Bike Rental Network PRD .md`. We are pivoting the architecture to align with local Jambi operational practices. You must rewrite and update both documents to enforce the following architectural changes:
> 
> 1. **Multi-bike Reservations:** Keep the category-level locking, but allow renters to book multiple bikes at once. Add `quantity` to the `reservations` table and update `computeAvailability` to check if `available < reservation.quantity`.
> 2. **Remove Digital Deposits:** Completely strip out the digital security deposit flow. Remove the `deposits` and `deposit_claims` tables from the data model and all associated API endpoints.
> 3. **50% Down Payment (DP):** Online reservations now require a 50% DP to move from `held` to `confirmed`. The remaining 50% is collected offline (cash/QRIS) by staff at check-out.
> 4. **Physical Collateral:** During the FR-RNT-01 check-out event, staff must collect and log physical collateral (`ktp`, `sim`, or `vehicle`). The event payload must accept an array of `bikeAssetTags` (matching the reservation quantity) and a `collateral` field.
> 5. **Configurable Seed Pricing:** Incorporate the local penalty structures (e.g., Rp 20,000/30 min unconfirmed late fee, Rp 4,000,000 lost unit penalty) and tiered pricing (weekday/weekend). **Crucially**, state explicitly in Section 4 that these amounts are strictly configurable seed/mock data, and owners can modify their own pricing.
> 6. **Mock Payments for P1:** Update Section 2 to state that Phase 1 will exclusively use the `FakeGateway` for mock reservation flows.
> 
> Output the fully revised Markdown for both documents.

***

> Act as the Technical Project Manager defined in `@AGENTS.md`. Read the newly updated `@SRS_Jambi_Bike_Rental_Platform.md` and `@ISSUE_SKILL_MAP.md`. 
> 
> Because we just removed the digital security deposit and introduced 50% DP, physical collateral, and multi-bike `quantity` reservations, our Phase 1 Step 6 backlog is out of date. 
> 
> 1. **Rewrite `@ISSUE_SKILL_MAP.md`:** Update Issue 1 to completely remove security deposits. Re-task the Backend Specialist and Web Frontend Developer to focus on implementing the 50% DP calculation, the `quantity` reservation logic, and the `collateral` logging for the staff app.
> 2. **Audit Current GitHub Issues:** Review our existing open issues. Generate `gh issue close <issue-number>` commands for any issues related to the deprecated digital security deposits. Generate `gh issue edit` commands to modify existing issues that need updated Acceptance Criteria (AC).
> 3. **Generate new GitHub CLI Script:** Create a new executable bash script for the remaining Phase 1 tasks. Ensure the `--body` for the updated reservation issue explicitly details the AC for the 50% DP math (using `bigint`) and the requirement for staff to log an array of asset tags and collateral at check-out. Update the T-13 E2E test issue to simulate a multi-bike checkout with the `FakeGateway`.
> 
> Output the revised `ISSUE_SKILL_MAP.md` content and the complete bash script (including close, edit, and create commands) in separate code blocks.