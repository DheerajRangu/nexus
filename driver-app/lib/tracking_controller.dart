import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'api_client.dart';

/// Foreground tracking implementation. Configure native foreground service and an
/// approved background-execution package before claiming persistent tracking.
class TrackingController {
  TrackingController(this.api, {required this.ambulanceId, this.onWarning});
  final AegisApiClient api;
  final String ambulanceId;
  final void Function(String)? onWarning;
  bool _uploading = false;
  Position? _latest;
  StreamSubscription<Position>? _subscription;
  int _sequence = 0;
  String? _session;
  Future<String?> start({String? missionId}) async {
    await stop();
    if (!await Geolocator.isLocationServiceEnabled()) {
      return 'GPS is disabled. Enable location services before tracking.';
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return 'Location permission was not granted.';
    }
    _session = DateTime.now().toUtc().microsecondsSinceEpoch.toString();
    final snapshot = await api.getJson('/api/v1/driver/me/snapshot');
    _sequence = (snapshot['ambulance']?['telemetry']?['sequenceNumber'] as num?)
            ?.toInt() ??
        0;
    _subscription = Geolocator.getPositionStream(
            locationSettings: const LocationSettings(
                accuracy: LocationAccuracy.high, distanceFilter: 12))
        .listen((position) => _upload(position, missionId));
    return null;
  }

  Future<void> _upload(Position p, String? missionId) async {
    _latest = p;
    if (_uploading) return;
    _uploading = true;
    try {
      while (_latest != null) {
        p = _latest!;
        _latest = null;
        try {
          await api.uploadTelemetry({
            'ambulanceId': ambulanceId,
            'missionId': missionId,
            'trackingSessionId': _session,
            'sequenceNumber': ++_sequence,
            'capturedAt': p.timestamp.toUtc().toIso8601String(),
            'latitude': p.latitude,
            'longitude': p.longitude,
            'accuracyMeters': p.accuracy,
            'bearingDegrees':
                p.heading.isFinite && p.heading >= 0 ? p.heading : null,
            'speedMps': p.speed.isFinite && p.speed >= 0 ? p.speed : null,
            'schemaVersion': 'v1'
          });
        } catch (error) {
          onWarning?.call('GPS upload failed: $error');
        }
      }
    } finally {
      _uploading = false;
    }
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
    _latest = null;
  }
}
