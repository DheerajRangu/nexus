import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'api_client.dart';

/// Foreground tracking implementation. Configure native foreground service and an
/// approved background-execution package before claiming persistent tracking.
class TrackingController {
  TrackingController(this.api, {required this.ambulanceId});
  final AegisApiClient api; final String ambulanceId;
  StreamSubscription<Position>? _subscription; int _sequence = 0; String? _session;
  Future<String?> start({String? missionId}) async {
    if (!await Geolocator.isLocationServiceEnabled()) return 'GPS is disabled. Enable location services before tracking.';
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return 'Location permission was not granted.';
    _session = DateTime.now().toUtc().microsecondsSinceEpoch.toString(); _sequence = 0;
    _subscription = Geolocator.getPositionStream(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 12)).listen((position) => _upload(position, missionId));
    return null;
  }
  Future<void> _upload(Position p, String? missionId) async { try { await api.uploadTelemetry({'ambulanceId': ambulanceId, 'missionId': missionId, 'trackingSessionId': _session, 'sequenceNumber': ++_sequence, 'capturedAt': p.timestamp?.toUtc().toIso8601String() ?? DateTime.now().toUtc().toIso8601String(), 'latitude': p.latitude, 'longitude': p.longitude, 'accuracyMeters': p.accuracy, 'bearingDegrees': p.heading.isFinite && p.heading >= 0 ? p.heading : null, 'speedMps': p.speed.isFinite && p.speed >= 0 ? p.speed : null, 'schemaVersion': 'v1'}); } catch (_) { /* Keep only an approved bounded queue in a production tracking service. */ } }
  Future<void> stop() async { await _subscription?.cancel(); _subscription = null; }
}
