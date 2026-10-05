import React, { useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { AegisState, Emergency, Hospital } from '../lib/api';
import { isMapConfigured } from '../lib/api';
import { C, S } from './Theme';

const city = { latitude: 12.9716, longitude: 77.6412 };
const position = (x: number, y: number) => ({
  latitude: city.latitude + (52 - y) * 0.0022,
  longitude: city.longitude + (x - 50) * 0.0025,
});

export function MapCanvas({
  state,
  emergency,
  onHospital,
  onIncident,
  compact = false,
}: {
  state: AegisState | null;
  emergency?: Emergency;
  onHospital: (id: string) => void;
  onIncident?: () => void;
  compact?: boolean;
}) {
  const configured = isMapConfigured(Platform.OS as 'ios' | 'android' | 'web');
  const hospitals = state?.hospitals ?? [];
  const ambulances = state?.ambulances ?? [];
  const currentHospital = hospitals.find(h => h.id === emergency?.hospital);
  const route = useMemo(() => {
    if (!emergency) return [];
    const destination = hospitals.find(h => h.id === emergency.hospital);
    const endX = destination?.x ?? 78;
    const endY = destination?.y ?? 33;
    const start = position(emergency.x, emergency.y);
    const end = position(endX, endY);
    return [
      start,
      position((emergency.x + endX) / 2, emergency.y - 2),
      position((emergency.x + endX) / 2, endY + 3),
      end,
    ];
  }, [emergency?.id, emergency?.hospital, emergency?.route, emergency?.progress, hospitals]);

  return (
    <View style={[S.map, { overflow: 'hidden', backgroundColor: '#101a17' }]}>
      {configured ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          initialRegion={{ ...city, latitudeDelta: 0.085, longitudeDelta: 0.085 }}
          customMapStyle={mapStyle}
          showsCompass
          showsScale
          toolbarEnabled={false}
          loadingEnabled
        >
          {state?.incidents.map(incident => (
            <Marker
              key={incident.id}
              coordinate={position(incident.x, incident.y)}
              title={incident.type}
              description="Simulated road condition"
              pinColor={C.amber}
            />
          ))}
          {hospitals.map((hospital: Hospital) => (
            <Marker
              key={hospital.id}
              coordinate={position(hospital.x, hospital.y)}
              title={hospital.name}
              description={`${hospital.icu} simulated ICU beds · ${hospital.eta} min`}
              pinColor={hospital.id === emergency?.hospital ? C.green : '#85c5cd'}
              onPress={() => onHospital(hospital.id)}
            />
          ))}
          {ambulances
            .filter(ambulance => ambulance.id !== emergency?.ambulance)
            .map(ambulance => (
              <Marker
                key={ambulance.id}
                coordinate={position(ambulance.x, ambulance.y)}
                title={`${ambulance.id} · ${ambulance.status}`}
                description={ambulance.equipment}
                pinColor="#c7d7d0"
              />
            ))}
          {emergency ? (
            <>
              <Marker
                coordinate={position(emergency.x, emergency.y)}
                title={`Incident · ${emergency.priority}`}
                description={emergency.type}
                pinColor={C.red}
              />
              <Marker
                coordinate={ambulancePosition(emergency, hospitals)}
                title={`${emergency.ambulance} · en route`}
                description={currentHospital?.name}
                pinColor={C.green}
              />
              <Polyline
                coordinates={route.length ? route : [city, position(76, 34)]}
                strokeColor={C.green}
                strokeWidth={5}
              />
            </>
          ) : null}
        </MapView>
      ) : (
        <View style={S.center}>
          <ActivityIndicator color={C.green} />
          <Text style={[S.title, { fontSize: 18, marginTop: 20, textAlign: 'center' }]}>
            Google Maps is ready for your key
          </Text>
          <Text style={[S.body, { textAlign: 'center', marginTop: 12 }]}>
            Set the Android and iOS API keys in mobile/.env, then create a native development build. Map coordinates and incident locations are simulated.
          </Text>
        </View>
      )}
      {configured ? (
        <View
          style={{ position: 'absolute', top: 12, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' }}
          pointerEvents="box-none"
        >
          <View style={{ backgroundColor: '#101c1ae8', borderColor: '#334840', borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: '#c8ddcf', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>
              BENGALURU · SIMULATED NETWORK
            </Text>
          </View>
          {emergency ? (
            <Pressable
              onPress={onIncident}
              style={{ backgroundColor: '#431f23', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}
            >
              <Text style={{ color: '#ffc1b5', fontSize: 10, fontWeight: '800' }}>
                {emergency.priority}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {configured && emergency && !compact ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 13, bottom: 13, backgroundColor: '#102119ed', borderColor: '#3c6649', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}
        >
          <Text style={S.label}>TIME SAVED · SIMULATED</Text>
          <Text style={[S.metric, { color: C.green, fontSize: 27, marginTop: 3 }]}>
            {formatTime(emergency.normalEta - emergency.optimizedEta)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ambulancePosition(emergency: Emergency, hospitals: Hospital[]) {
  const destination = hospitals.find(h => h.id === emergency.hospital);
  const progress = Math.max(0, Math.min(1, emergency.progress / 100));
  const dx = destination?.x ?? 78;
  const dy = destination?.y ?? 33;
  return position(emergency.x + (dx - emergency.x) * progress, emergency.y + (dy - emergency.y) * progress);
}

function formatTime(seconds: number) {
  const saved = Math.max(0, seconds);
  return `${Math.floor(saved / 60).toString().padStart(2, '0')}:${(saved % 60).toString().padStart(2, '0')}`;
}

const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#101b1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#89a299' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#101b1a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#b7ccb9' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#182522' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#152920' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#283b35' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#344941' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#425548' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#20332e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b191b' }] },
];
