import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_client.dart';
import 'tracking_controller.dart';

const apiOrigin = String.fromEnvironment('AEGIS_API_ORIGIN',
    defaultValue: 'http://10.0.2.2:8000');
void main() => runApp(const AegisDriverApp());

class AegisDriverApp extends StatelessWidget {
  const AegisDriverApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
      title: 'AEGIS Driver',
      theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xff0d746f), brightness: Brightness.dark),
          useMaterial3: true),
      home: const AssignmentScreen());
}

class AssignmentScreen extends StatefulWidget {
  const AssignmentScreen({super.key});
  @override
  State<AssignmentScreen> createState() => _AssignmentScreenState();
}

class _AssignmentScreenState extends State<AssignmentScreen> {
  late final AegisApiClient _api;
  TrackingController? _tracking;
  Map<String, dynamic>? _snapshot;
  String? _message;
  Timer? _timer;
  StreamSubscription<Map<String, dynamic>>? _events;
  GoogleMapController? _map;
  @override
  void initState() {
    super.initState();
    _api = AegisApiClient(Uri.parse(apiOrigin), const FlutterSecureStorage());
    _bootstrap();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  Future<void> _bootstrap() async {
    try {
      await _api.signInDriver(
          const String.fromEnvironment('AEGIS_AMBULANCE_ID',
              defaultValue: 'AMB-07'),
          const String.fromEnvironment('AEGIS_OPERATOR_KEY'));
      await _load();
      _events = _api.events().listen((_) => _load(), onError: (Object e) {
        if (mounted) setState(() => _message = 'Realtime reconnecting: $e');
      });
    } catch (e) {
      if (mounted) setState(() => _message = 'Sign-in failed: $e');
    }
  }

  Future<void> _load() async {
    try {
      final data = await _api.getJson('/api/v1/driver/me/snapshot');
      if (mounted) setState(() => _snapshot = data);
      final assignment = data['assignment'] as Map<String, dynamic>?;
      if (assignment == null) {
        await _tracking?.stop();
        _tracking = null;
      }
      if (assignment != null &&
          assignment['acknowledgedAt'] != null &&
          _tracking == null &&
          ['EN_ROUTE_TO_PATIENT', 'EN_ROUTE_TO_HOSPITAL']
              .contains(assignment['state'])) {
        _tracking = TrackingController(_api,
            ambulanceId: data['ambulance']['ambulanceId'] as String,
            onWarning: (warning) {
          if (mounted) setState(() => _message = warning);
        });
        final warning = await _tracking!
            .start(missionId: assignment['missionId'] as String?);
        if (warning != null && mounted) setState(() => _message = warning);
      }
      if (assignment?['assignmentId'] != null &&
          assignment?['receivedAt'] == null) {
        await _api.postNoBody(
            '/api/v1/driver/assignments/${assignment!['assignmentId']}/receipt');
      }
    } catch (e) {
      if (mounted) setState(() => _message = '$e');
    }
  }

  Map<String, dynamic>? get assignment =>
      _snapshot?['assignment'] as Map<String, dynamic>?;
  Map<String, dynamic>? get ambulance =>
      _snapshot?['ambulance'] as Map<String, dynamic>?;
  Future<void> _acknowledge() async {
    final id = assignment?['assignmentId'];
    if (id == null) return;
    try {
      await _api.postNoBody('/api/v1/driver/assignments/$id/acknowledgement');
      _tracking = TrackingController(_api,
          ambulanceId: ambulance!['ambulanceId'] as String,
          onWarning: (warning) {
        if (mounted) setState(() => _message = warning);
      });
      final warning = await _tracking!
          .start(missionId: assignment?['missionId'] as String?);
      if (mounted) {
        setState(() => _message = warning ??
            'Assignment acknowledged. Tracking started while supported by the OS.');
      }
      await _load();
    } catch (e) {
      if (mounted) setState(() => _message = '$e');
    }
  }

  Future<void> _arrival() async {
    final id = assignment?['assignmentId'];
    if (id == null) return;
    try {
      await _api.postNoBody('/api/v1/driver/assignments/$id/arrival');
      await _tracking?.stop();
      await _load();
    } catch (e) {
      if (mounted) setState(() => _message = '$e');
    }
  }

  Future<void> _reportProblem() async {
    final id = assignment?['assignmentId'];
    if (id == null) return;
    final detail = TextEditingController();
    final result = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Report operational problem'),
                content: TextField(
                    controller: detail,
                    autofocus: true,
                    maxLines: 3,
                    decoration: const InputDecoration(
                        labelText:
                            'Breakdown, equipment failure, unsafe condition…')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('CANCEL')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, detail.text),
                      child: const Text('SEND TO CONTROL ROOM'))
                ]));
    if (result == null || result.trim().isEmpty) return;
    try {
      await _api.postJson('/api/v1/driver/assignments/$id/operational-problems',
          {'category': 'DRIVER_REPORTED', 'detail': result.trim()});
      if (mounted) {
        setState(() => _message =
            'Operational problem reported. The confirmed mission remains active until an authorized operator resolves or reassigns it.');
      }
    } catch (e) {
      if (mounted) setState(() => _message = '$e');
    } finally {
      detail.dispose();
    }
  }

  Future<void> _navigate() async {
    final route = assignment?['route'] as Map<String, dynamic>?;
    final geometry = route?['geometry'] as List?;
    if (geometry == null || geometry.isEmpty) return;
    final pickup = geometry.last as Map<String, dynamic>;
    await launchUrl(
        Uri.parse(
            'google.navigation:q=${pickup['latitude']},${pickup['longitude']}'),
        mode: LaunchMode.externalApplication);
  }

  @override
  void dispose() {
    _map?.dispose();
    _timer?.cancel();
    _events?.cancel();
    _tracking?.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_snapshot == null) {
      return Scaffold(
          appBar: AppBar(title: const Text('AEGIS Driver')),
          body: Center(
              child: Text(_message ?? 'Restoring confirmed assignment…')));
    }
    final a = assignment;
    final route = a?['route'] as Map<String, dynamic>?;
    final geo = route?['geometry'] as List?;
    final target =
        geo?.isNotEmpty == true ? geo!.last as Map<String, dynamic> : null;
    final vehicle = ambulance?['location'] as Map<String, dynamic>?;
    final points = (geo ?? [])
        .map((point) => LatLng((point['latitude'] as num).toDouble(),
            (point['longitude'] as num).toDouble()))
        .toList();
    final markers = <Marker>{
      if (vehicle != null)
        Marker(
            markerId: const MarkerId('ambulance'),
            position: LatLng((vehicle['latitude'] as num).toDouble(),
                (vehicle['longitude'] as num).toDouble()),
            infoWindow: const InfoWindow(title: 'Your shared GPS')),
      if (target != null)
        Marker(
            markerId: const MarkerId('pickup'),
            position: LatLng((target['latitude'] as num).toDouble(),
                (target['longitude'] as num).toDouble()),
            infoWindow: const InfoWindow(title: 'Confirmed pickup'))
    };
    return Scaffold(
        appBar:
            AppBar(title: const Text('AEGIS · CONFIRMED MISSION'), actions: [
          IconButton(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh authoritative snapshot')
        ]),
        body: Column(children: [
          if (_message != null)
            MaterialBanner(content: Text(_message!), actions: [
              TextButton(
                  onPressed: () => setState(() => _message = null),
                  child: const Text('DISMISS'))
            ]),
          Expanded(
              child: target == null
                  ? const Center(child: Text('No active confirmed assignment.'))
                  : GoogleMap(
                      initialCameraPosition: CameraPosition(
                          target: LatLng((target['latitude'] as num).toDouble(),
                              (target['longitude'] as num).toDouble()),
                          zoom: 15),
                      onMapCreated: (controller) => _map = controller,
                      polylines: {
                        if (points.isNotEmpty)
                          Polyline(
                              polylineId: const PolylineId("shared-route"),
                              points: points,
                              color: Colors.tealAccent,
                              width: 5)
                      },
                      markers: markers)),
          if (a != null) _missionCard(a)
        ]));
  }

  Future<void> _stage(String stage) async {
    final id = assignment?['assignmentId'];
    if (id == null) return;
    try {
      await _api.postNoBody('/api/v1/driver/assignments/$id/$stage');
      if (stage == 'pickup') {
        final warning = await _tracking?.start(
            missionId: assignment?['missionId'] as String?);
        if (warning != null && mounted) setState(() => _message = warning);
      }
      if (stage == 'arrived-hospital') await _tracking?.stop();
      await _load();
    } catch (e) {
      if (mounted) setState(() => _message = '$e');
    }
  }

  Widget _missionCard(Map<String, dynamic> a) => SafeArea(
      top: false,
      child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (a['state'] == 'ARRIVED_AT_PATIENT')
              FilledButton(
                  onPressed: () => _stage('pickup'),
                  child: const Text('PATIENT PICKED UP')),
            if (a['state'] == 'EN_ROUTE_TO_HOSPITAL')
              FilledButton(
                  onPressed: () => _stage('arrived-hospital'),
                  child: const Text('ARRIVED AT HOSPITAL')),
            Text('Vehicle ${a['ambulanceId']} · ${a['state']}',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 5),
            Text(a['acknowledgedAt'] == null
                ? 'Backend confirmed. Receipt and acknowledgement are separate facts.'
                : 'Driver acknowledgement sent. You are en route.'),
            const SizedBox(height: 12),
            FilledButton.icon(
                onPressed:
                    a['acknowledgedAt'] == null ? _acknowledge : _navigate,
                icon: Icon(
                    a['acknowledgedAt'] == null ? Icons.navigation : Icons.map),
                label: Text(a['acknowledgedAt'] == null
                    ? 'ACKNOWLEDGE & START NAVIGATION'
                    : 'OPEN EXTERNAL NAVIGATION')),
            const SizedBox(height: 8),
            OutlinedButton.icon(
                onPressed: _arrival,
                icon: const Icon(Icons.location_on),
                label: const Text('MARK ARRIVAL')),
            TextButton(
                onPressed: _reportProblem,
                child: const Text(
                    'REPORT OPERATIONAL PROBLEM / CONTACT CONTROL ROOM'))
          ])));
}
