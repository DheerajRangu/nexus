import type { GeoPoint } from "../../shared/contract";

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export const DEFAULT_CENTER = { latitude: 17.385044, longitude: 78.486671 };

export function boundsAround(points: GeoPoint[]): Bounds {
  const source = points.length ? points : [DEFAULT_CENTER];
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const point of source) {
    north = Math.max(north, point.latitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    west = Math.min(west, point.longitude);
  }
  const latPad = Math.max(0.008, (north - south) * 0.35);
  const lngPad = Math.max(0.008, (east - west) * 0.35);
  return { north: north + latPad, south: south - latPad, east: east + lngPad, west: west - lngPad };
}

export function project(point: GeoPoint, bounds: Bounds, width: number, height: number) {
  const x = ((point.longitude - bounds.west) / (bounds.east - bounds.west)) * width;
  const y = ((bounds.north - point.latitude) / (bounds.north - bounds.south)) * height;
  return { x, y };
}

export function unproject(x: number, y: number, bounds: Bounds, width: number, height: number): GeoPoint {
  return {
    longitude: bounds.west + (x / width) * (bounds.east - bounds.west),
    latitude: bounds.north - (y / height) * (bounds.north - bounds.south),
  };
}
