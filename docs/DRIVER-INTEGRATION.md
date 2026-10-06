# Flutter driver integration

The `driver-app/` client is a minimal runnable integration, not a replacement for the teammate's full app. It restores the driver snapshot, records receipt, exposes **Acknowledge & start navigation**, tracks foreground locations after explicit acknowledgement, launches external Google navigation, supports arrival, and displays GPS/connection errors.

Configure `--dart-define=AEGIS_API_ORIGIN=http://10.0.2.2:8080` for Android Emulator. For a device use the LAN IP and HTTPS in a real environment. Add Android Maps SDK key and iOS Maps SDK key in the native application configuration required by `google_maps_flutter`; use separate restricted keys.

The included tracker is foreground-only and uses `geolocator` with a 12 m distance filter. It does **not** claim validated background behaviour, persistent foreground notification, process-death recovery, bounded encrypted offline queue, or tracking while external navigation is active. Integrate an organization-approved background-location service, Android foreground-service declaration/notification, iOS background mode, bounded retry queue, and device testing before enabling those policies. At shift end, keep tracking only where an active authorized mission policy requires it; otherwise stop it and alert operations rather than silently losing or indefinitely retaining location.

The driver receives no accept/decline choice. “Acknowledge” records a fact about an already backend-confirmed assignment. An operational problem must be reported to `/api/v1/driver/assignments/{assignmentId}/operational-problems`; it does not cancel the mission.
