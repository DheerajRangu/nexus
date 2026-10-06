# Citizen emergency request and tracking

Open http://localhost:5173/citizen. The redesigned citizen portal uses a light, readable interface with three steps:

1. Emergency category, optional patient name/contact and description.
2. Patient pickup point: browser GPS, clicking/dragging the geographic pin, or explicit coordinates. Reporter can be with the patient or at another location. Landmark/access notes are optional.
3. Review the request and explicitly confirm the patient pickup before sending.

The action is labeled **Send demo emergency request**. This calls the existing admission API and shared dispatch authority. A stable submission ID makes retrying the same request idempotent. GPS is requested only after the user presses the location button. Empty or invalid coordinates block continuation, and the other coordinate is never silently invented.

After submission, the existing scoped citizen session provides live ambulance, route, ETA and hospital updates. The tracking page retains English/Telugu/Hindi, pickup correction, refresh recovery and restricted link sharing. Clipboard/share failures are handled in-page. Shared tracking styles are now explicitly included in the Vite/Tailwind build; the fallback map renders rather than appearing as a blank oversized panel. Unconfigured Google Maps does not expose setup instructions in the citizen flow.

The header offers `tel:112` for actual emergency calling. This number was verified against the [Government of India's Emergency Response Support System](https://112.gov.in/). Demo requests do not call or dispatch real emergency services. Severity remains the existing intake default for dispatcher assessment; selecting an emergency card does not diagnose or grade the patient's condition.

Browser verification: `/tmp/citizen-redesign-results.json`, `/tmp/citizen-new-{width}.png`, `/tmp/citizen-pickup.png`, `/tmp/citizen-tracking-desktop.png`, `/tmp/citizen-tracking-phone.png`. The isolated test verifies map selection, GPS, empty-coordinate blocking, explicit confirmation, persisted incident data, assigned ambulance updates, refresh recovery and responsive layout. The four-role regression intake selectors are updated for the new steps.
