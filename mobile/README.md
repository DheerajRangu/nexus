# AEGIS mobile

AEGIS Mobile is a native Expo Router app for Android and iOS. It uses Google Maps through `react-native-maps`, the existing AEGIS REST service, and native secured credential storage. Google Maps keys and a reachable API address are configured separately for the mobile build.

## 1. Create restricted Google Maps keys

In the Google Cloud project you control:

1. Enable billing and the **Maps SDK for Android** and **Maps SDK for iOS**.
2. Create one Android restricted key and one iOS restricted key. Restrict each key to its matching Maps SDK. Restrict the Android key to package `com.aegis.emergency` and its release signing certificate fingerprint; restrict the iOS key to bundle ID `com.aegis.emergency`.
3. Set usage quotas and billing alerts. Maps key configuration is public in the compiled app, so application and API restrictions are required.

Google requires billing and an API key for these native map SDKs. Current costs depend on Google Maps SKU, region, and usage; review the current project billing page before enabling map traffic. See [Google's key setup](https://developers.google.com/maps/documentation/android-sdk/get-api-key) and [key security guidance](https://developers.google.com/maps/api-security-best-practices).

From `mobile/`, create `.env` from `.env.example` and add the two keys:

```sh
cp .env.example .env
```

Use separate Google Cloud keys; never commit `mobile/.env`. The native map SDK embeds its key in the app binary. The app requires a new native build after changing either key. Expo Go cannot add these native Google Maps settings to its already compiled container; use a development build.

## 2. Set an accessible AEGIS API origin

Set `EXPO_PUBLIC_AEGIS_API_URL` in `mobile/.env` to the HTTPS origin for the authorized, network reachable AEGIS API server. A standalone mobile app cannot use an Expo development machine's `localhost`, and owner-private Sites pages may require web platform authentication that isn't available to a standalone app. The app has an API connection setting so a developer can set a different authorized API origin on the device without rebuilding it.

For development on the same computer, start the local AEGIS Worker and set `EXPO_PUBLIC_AEGIS_API_URL=http://<your-computer-lan-ip>:8787`. From the repository root, run `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 0.0.0.0 --inspector-port 0` so Wrangler listens on the LAN interface, then keep the device on the same trusted network. The AEGIS server accepts Expo development requests from private local network addresses; it requires HTTPS for a remote API. Never expose the local development server directly to the public internet.

The mobile API authenticates with a short lived JWT over HTTPS (or HTTP on a trusted private LAN during development). Tokens are stored in iOS Keychain or Android Keystore through Expo SecureStore. Citizen account data remains isolated. Demo workspaces use synthetic city data. A public production backend should independently verify account ownership and organizational role provisioning before you invite professional users.

## 3. Start and build

From `mobile/`:

```sh
npm install
npx expo start
```

Build a native development client when using Google Maps or changing keys:

```sh
npx expo prebuild
npx expo run:android
npx expo run:ios
```

Android needs Android Studio and a device/emulator with Google Play Services. Building for iOS requires macOS with Xcode. EAS Build is configured in `eas.json` for development, preview, and production profiles; it also requires an Expo account and an EAS project ID.

The map starts in Bengaluru and uses the seed city markers, emergency locations, and simulated routes from the AEGIS service. No device GPS, production routing, emergency number dispatch, or live public traffic feed is connected. Google map tiles themselves are served by Google Maps Platform.

## Structure

- `src/app/(tabs)/index.tsx`: native city map and command overview.
- `src/app/(tabs)/hospitals.tsx`: explainable hospital ranking.
- `src/app/(tabs)/response.tsx`: SOS, countdown, incident timeline, patient arrival, and driver reroute.
- `src/app/(tabs)/profile.tsx`: protected account profile and emergency contacts.
- `src/lib/api.ts`: mobile API client and secured token storage.
- `app.config.ts`: native bundle identifiers, Maps SDK key injection, and server configuration.
