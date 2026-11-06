# Guest Checkout & ID Verification Pivot Prompts

Run these prompts sequentially in your AI IDE to safely update your system architecture for the Guest Checkout flow.

> Act as the Lead Platform Architect defined in `@AGENTS.md`. Read `@SRS_Jambi_Bike_Rental_Platform.md` and `@Jambi Bike Rental Network PRD .md`. We are making a critical conversion-rate optimization: removing mandatory digital ID verification. 
> 
> You must rewrite and update both documents to enforce these changes:
> 1. **Remove Digital ID Verification:** Completely delete FR-ID-04 (Renter ID verification). Remove the `verification_requests` and `id_document_views` tables from the Data Model. Remove the `VERIFICATION_REQUIRED` error from the `POST /reservations` endpoint.
> 2. **Guest Checkout:** Modify FR-ID-01. Renter login is now strictly optional. Renters can book as guests by providing a contact phone number. The 50% Down Payment (DP) now serves as the primary anti-spam mechanism.
> 3. **Incentivized Auth:** State that renter accounts are now primarily used to claim platform/owner promotions and vouchers. 
> 4. **Offline Collateral Retained:** Ensure the documents still reflect that physical collateral (KTP/SIM/Vehicle) is strictly collected by staff offline during the check-out scan.
> 
> Output the fully revised Markdown for both documents.

> Act as the Technical Project Manager defined in `@AGENTS.md`. Read the newly updated `@SRS_Jambi_Bike_Rental_Platform.md` and `@ISSUE_SKILL_MAP.md`. 
> 
> We have eliminated mandatory digital ID verification in favor of a Guest Checkout flow to maximize conversion rates. 
> 
> Generate a GitHub CLI (`gh`) bash script to manage this pivot:
> 1. Write a `gh issue close` command to permanently close the obsolete 'Renter ID Verification (FR-ID-04)' issue.
> 2. Write a `gh issue create` command for the new **Guest Checkout & Optional Auth** implementation. The `--body` must instruct the Backend Specialist to remove `verification_status` blocks from `POST /reservations`, support unauthenticated booking payloads (requiring just a phone number and the 50% DP), and ensure promos are gated behind actual authenticated sessions.
> 3. Update `@ISSUE_SKILL_MAP.md` to reflect these changes, mapping the new Guest Checkout issue to the `implement_zod_contract_route` skill.
> 
> Output the bash script and the revised markdown file in separate code blocks.