# Post-Mortem: Faceseek Data Restoration Incident

**Date:** January 22, 2026
**Incident Channel:** #inc--restore-faceseek
**Participants:** Zach Smith (incident lead), Angi He, Agree Ahmed, Brooks Flannery, Joey Sabarese

---

## 1. Timeline

| Time (UTC) | Event |
|------------|-------|
| ~10:42 AM | Migration script started for non-Faceseek orgs, completed ~10:43 AM |
| ~10:53 AM | Migration script started for Faceseek |
| ~11:17 AM | Migration script completed for Faceseek |
| ~11:49 AM | Incident channel created, team assembles |
| ~11:51 AM | Run of show established (Zach): (1) restore 4am backup, (2) reinsert products with old IDs, (3) reinsert prices, (4) update historical payments |
| ~11:54 AM | Supabase backup link identified (4:00 AM backup) — Joey |
| ~12:00 PM | Brooks assigned to get local copy of Supabase running from 4am backup |
| ~12:04 PM | SQL identified: 19 products to recover for Faceseek |
| ~12:17 PM | Yellow flag (Zach): Payments between 4am and migration time are absent from backup |
| ~12:18 PM | Migration log times confirmed — Angi |
| ~12:24 PM | Yellow flag (Zach): Customers with duplicate emails were combined/deleted |
| ~12:31 PM | Priority products identified (4 used for faceseek.online/pricing checkout) — Angi |
| ~12:43 PM | Free plans confirmed as non-issue (correctly deduplicated) — Zach |
| ~12:45 PM | Step 1 (backup restoration) marked complete — Joey |
| ~12:52 PM | Full list of 71 deleted prices identified — Joey |
| ~12:53 PM | Products insert values ready; prices in progress (Google Sheet created) — Agree |
| ~12:58 PM | Yellow flag (Zach): Faceseek was managing products via multiple disjoint pricing models |
| ~1:07 PM | Confirmed: deleted product IDs match 1:1 with deleted price product references — Zach |
| ~1:10 PM | Child tables to restore identified: Purchases, Invoice Line Items, Fee Calculations, Checkout Sessions — Zach |
| ~1:14 PM | Yellow flag (Zach): 13 non-Faceseek products also deleted |
| ~1:17 PM | "Her Village LLC" identified as affected org with $8 payments to restore — Angi |
| ~1:23 PM | PR #1616 opened — Angi |
| ~1:29 PM | Brooks assigned to hide "new pricing model" button in livemode — Agree |
| ~2:10 PM | Faceseek checkout confirmed back online — Agree |
| ~2:23 PM | Investigation into non-Faceseek deleted products continues — Zach |
| ~2:36 PM | Docker commands shared for running local Supabase backup — Joey |
| ~3:13 PM | Yellow flag (Zach): Some products in migration log were NOT in the backup |
| ~3:16 PM | Note (Zach): "Claude is smart but not fast" - need better tooling |
| ~5:19 PM | Post-mortem notes shared — Brooks |
| ~5:25 PM | Method for correctly running local Supabase backup documented — Joey |

---

## 2. Root Cause Analysis

### What Happened

A database migration script intended to consolidate pricing models was accidentally run against the **production database** instead of a local/test environment. This resulted in:

1. **19 Faceseek products deleted** (non-default, livemode products)
2. **71 Faceseek prices deleted**
3. **13 non-Faceseek products deleted** (most were free plans that got deduplicated, but "Her Village LLC" had real products with $8 payments)
4. **Child records orphaned:** Purchases, Invoice Line Items, Fee Calculations, Checkout Sessions referencing deleted prices
5. **Customer records merged:** Customers with identical emails were combined and duplicates deleted

### Why It Happened

Based on the transcript, the root cause was **environment misconfiguration**:

> "unlike with drizzle migrations testing i did previously, i just needed to apply migrations to local db clone, this time i had a standalone script to test PM consolidation which required an extra command to run and i messed up my env vars there" — Angi

Contributing factors identified:

1. **Prod DB credentials easily accessible** - Real production database connection was available in local environment variables
2. **Non-standard migration workflow** - This migration used a standalone script rather than Drizzle migrations, requiring manual environment setup
3. **Nullable slugs** - Made deduplication logic more complex (products/prices with null slugs harder to identify uniquely)

---

## 3. Open Questions / Gaps in Transcript

1. **How was the incident first detected?** The transcript starts with the incident channel creation but doesn't explain who noticed the problem or how.

2. **What was the customer impact duration?** Faceseek checkout was confirmed "back online" at ~2:10 PM, but it's unclear when it went down or if customers experienced failed transactions.

3. **Were all child records successfully restored?** The transcript shows the team identifying what needed restoration but doesn't confirm completion of:
   - Purchases
   - Fee Calculations
   - Checkout Sessions
   - Non-Faceseek org data (Her Village LLC)

4. **What happened to payments between 4am and migration time?** Flagged as yellow (not in backup), resolution not documented.

5. **Were some pricing models deleted during migration?** This was raised as an open question but not answered in the transcript.

6. **What was the backup reliability issue?** Note at 3:13 PM: "there are some products mentioned in the migration log that we did NOT see in the backup. so our backups are probably not very reliable!" — needs investigation.

---

## 4. Next Steps / Action Items

### Identified in Transcript

| Item | Owner | Status |
|------|-------|--------|
| Make it harder to accidentally run scripts on prod environment | PM | Noted |
| Implement pgcp tooling for easy backup dumps | Brooks | In progress |
| Make slugs non-nullable (products and prices) | Brooks | Gameplan exists |
| Hide "new pricing model" button in livemode | Brooks | Assigned |
| Consider read replica for prod data access instead of direct prod DB | Team | Discussion |
| Standardize migration testing workflow (only use Drizzle?) | Team | Discussion |
| Investigate Claude allowed-list feature (like Cursor) | Team | Discussion |
| Build "vibecoded tools" to reduce LLM time penalties | PM | Noted |
| Make it trivial to spin up postgres around a pg_dump | PM | Noted |
| Investigate backup reliability issues | Team | Not assigned |

### Recommended Additional Items (not in transcript)

- Document the complete data restoration status
- Verify all affected customers' data integrity
- Add pre-flight checks to migration scripts that detect production environment
- Consider requiring MFA or approval workflow for production database writes
- Post-incident communication to affected customers (Faceseek, Her Village LLC)

---

**Document Status:** Draft - pending team review and gap resolution
