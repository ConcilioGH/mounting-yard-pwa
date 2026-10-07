# Ladbrokes automatic resulted-SP feed assessment

Assessment date: 2026-08-04 (Australia/Sydney)

## Decision

Do not ship Ladbrokes as an automatic resulted-SP fallback against the public website feed.
Do not replace TAB with Bet365's website or internal data feed either.

The website does expose result data through GraphQL, but the observed contract is an internal,
versioned web-client contract rather than a documented public racing-results API. Direct calls from
an unrelated deployed PWA origin are blocked at preflight, while a server-side proxy would still
depend on undocumented persisted-query hashes and the site's query-registration fallback. That is
not a reliable production dependency for automatic SP updates.

The existing order remains unchanged: TAB is primary, with Racing NSW and Racenet retained as the
currently configured later fallbacks.

## Bet365 comparison

Bet365 was assessed as a possible replacement on 2026-08-04. It is not a viable source for this
PWA, regardless of the technical accessibility of its website feed.

The current Australian Bet365 terms (version 7.8, effective 2026-07-09) expressly identify as a
prohibited activity the use or facilitation of automated systems, scripts, robots, crawlers, browser
plugins, or other software to copy, scrape, or extract any part of its services. The prohibition
specifically includes results, statistics, sporting data, fixture lists, odds, betting figures,
APIs, background technology, software, code, and source code. The terms also prohibit commercial
use and describe blocking and account action where automated extraction is suspected.

This is broader and clearer than the Ladbrokes reliability concern: using Bet365's internal feed
would be contractually unsuitable even if its request format could be reverse-engineered. No
supported public or partner racing-results API for this use was identified.

### Reliability ranking for the proposed replacements

1. **Ladbrokes public website feed:** technically observable, but undocumented, content-versioned,
   blocked for direct cross-origin PWA access, and unsuitable without a supported partner contract.
2. **Bet365 website/internal feed:** expressly unsuitable for automated extraction under the current
   Australian terms.

Neither proposed source meets the production acceptance criteria, so TAB must not be removed until
a supported replacement is available and verified in parallel.

## Sportsbet comparison

Sportsbet was assessed on 2026-08-04 using its public Australian results workflow.

### What was verified

- The public `/results` archive is accessible without signing in.
- Results can be selected by date, racing category, meeting, and race.
- A completed race page exposes at least first, second, and third, with runner name and number.
- For the sampled Rosehill meeting on 2026-08-01, the result panel displayed `Win` and `Place`
  values for placed runners.

### Why it was not selected

The displayed values are labelled as win/place dividends, not as official starting price. The race
card also displays fixed win/place prices and fluctuations, but those are wagering prices and are not
a sufficiently explicit substitute for the official SP required by the Bias workflow. Inferring SP
from one of those values would risk silently importing the wrong measure.

No documented public or partner Sportsbet racing-results API, schema guarantee, service level, or
permission for automated third-party reuse was identified. The website routes and their underlying
application requests are therefore an internal web-client contract, not an acceptable production
source for this PWA.

Sportsbet does not pass the data-contract gate even though its visible results archive is easier to
access than Ladbrokes' GraphQL feed. It must not replace TAB unless Sportsbet supplies a supported
feed that explicitly identifies official SP and permits this automated use.

### Interim-source follow-up

The user subsequently approved using Sportsbet's displayed win value as an interim approximation,
despite it not being official SP. The technical feed was therefore inspected further.

The current Sportsbet racecard payload represents this value as a runner `dividends` entry with:

- `priceType: "S"`
- `legType: 0`
- numeric `amount`

The sampled winning runner's amount matched the `Win` value displayed in the final race-results
panel. The same racecard model contains runner name, runner number, result marker, and numeric place,
so the response would otherwise be sufficient for deterministic matching and the three-place gate.

The exact current racecard request is rooted at Sportsbet's first-party application gateway, for
example:

`/apigw/sportsbook-racing/Sportsbook/Racing/Events/{eventId}/Racecard`

A read-only server-side request to that endpoint returned HTTP 403 `Access Denied` from Sportsbet's
edge protection. The public application bundles were likewise denied to an ordinary server-side
client while they loaded successfully inside Sportsbet's first-party browser page. A deployed PWA
cannot call the endpoint cross-origin, and its own server proxy cannot reliably fetch it.

This activates the protected-provider stop condition independently of whether the value is accepted
as an SP approximation. Shipping it would require first-party browser state, protection bypasses, or
browser automation, none of which are acceptable production dependencies. No Sportsbet source was
added to the PWA.

## Exact operation used by the website

The current Ladbrokes web bundle (`vendor-graphql-ops-web-DstSCvDk.js`) defines and invokes:

- Operation: `RacingRaceCardScreenWeb`
- Type: GraphQL query
- Variables:
  - `id: ID!`
  - `isLoggedIn: Boolean! = false`
  - `includePlaceExtra: Boolean! = false`
- Configured endpoints:
  - `https://api.ladbrokes.com.au/graphql`
  - `https://api.ladbrokes.com.au/gql/router`

The operation includes the `RaceCardResults` fragment. For ordinary racing results it requests
`results.runnerRows` with:

- `id`
- `position`
- `winPlaceDividends { label value }`
- `toteDividends(includePlaceDividendsForFirstPosition: true) { label value }`

The same operation also returns race and meeting identity, including race `number`, race `status`,
meeting `id`, meeting `name`, meeting `meetingCode`, and venue information. The site's meeting list
query supplies the date-scoped meeting and race IDs needed by the race-card operation.

The bundle's current persisted-query map contains a hash for `RacingRaceCardScreenWeb`, but the web
client does not rely on that map as a stable public contract. Its request middleware calculates a
SHA-256 hash from the full printed query, sends a GET request containing the persisted-query
extension, and retries with the full query when the server responds with `PersistedQueryNotFound`.
Bundle filenames and operation hashes are content-versioned and may change with any site release.

## Reliability evidence

Read-only checks against the production endpoints produced the following results:

1. The ordinary Ladbrokes racing page loaded successfully as a first-party page and loaded the
   GraphQL operation bundle described above.
2. An unauthenticated persisted-query GET to both configured endpoints returned HTTP 200 with
   `PersistedQueryNotFound`, demonstrating that a copied hash alone is not a sufficient contract.
3. A CORS preflight from an unrelated deployed origin to `https://api.ladbrokes.com.au/graphql`
   returned HTTP 403 from Cloudflare and did not return an allow-origin response. A deployed PWA
   therefore cannot call this feed directly.
4. The feed and operation are undocumented for third-party use. No published stability, rate-limit,
   availability, or redistribution contract was identified in the public web configuration.

These findings meet the requested stop condition: the operation cannot be called reliably from the
deployed PWA without either brittle coupling to the current website bundle or an application-owned
proxy that attempts to bypass the browser restriction and inherits the same undocumented contract.

## Safest viable alternative

Keep the current TAB-first resulted-SP workflow and its existing Racing NSW/Racenet fallbacks. For a
new primary source, obtain a documented and licensed racing-results feed whose terms explicitly
permit automated use and redistribution in this PWA. Ladbrokes/Entain could still be used if they
provide a supported partner API, credentials, service limits, and a stable schema for official SP
and placings. Bet365 should only be reconsidered if Bet365 provides equivalent written permission
and a supported partner API. Sportsbet should only be reconsidered if its supported feed explicitly
distinguishes official SP from fixed prices and tote dividends.

Once such a feed is available, integrate it through the existing source abstraction with saved
fixtures, retain the three-placed-runner gate, and preserve the existing no-overwrite behavior and
diagnostic outcomes.

## Recommended TAB recovery path

TAB provides an official supported route through **TAB Studio Web Services**. TAB describes it as
the API behind its website and applications and provides trusted real-time NSW, VIC, and QLD-group
racing information. Access requires an application, declared plans for use, and TAB approval.
Commercial or development use is also subject to Tabcorp and third-party approval, including Racing
Australia approval for thoroughbred materials.

The PWA currently calls the unauthenticated
`https://api.beta.tab.com.au/v1/tab-info-service/` endpoint. A live read-only meeting request on
2026-08-04 did not respond within 50 seconds. This beta endpoint is not the supported TAB Studio
contract and should not remain the long-term primary dependency.

The immediate resilience fix is to bound beta-endpoint requests to eight seconds so provider failure
is recorded and the existing later fallbacks can run. A normal TAB response that says a race has not
resulted remains a distinct `not_ready` outcome and does not incorrectly trigger another provider.

The durable solution is:

1. Apply for TAB Studio access for the PWA's actual intended use.
2. Obtain the approved information-service documentation and credentials.
3. Replace the beta endpoint behind the existing same-origin proxy; keep credentials server-side.
4. Confirm the documented field representing official SP rather than treating a tote win dividend
   or final fixed-odds price as SP.
5. Run the old and new sources in parallel over several meetings before making TAB Studio primary.
