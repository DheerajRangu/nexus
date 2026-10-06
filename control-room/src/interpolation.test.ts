import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolation';
describe('telemetry interpolation', () => {
  it('interpolates only between observations and never extrapolates', () => {
    const points=[{coordinates:{latitude:0,longitude:0},capturedAt:1000},{coordinates:{latitude:10,longitude:20},capturedAt:2000}];
    expect(interpolate(points,1500)).toEqual({latitude:5,longitude:10});
    expect(interpolate(points,2500)).toEqual({latitude:10,longitude:20});
  });
  it('stops at last known location when stale', () => expect(interpolate([{coordinates:{latitude:2,longitude:3},capturedAt:1000}],200_000)).toEqual({latitude:2,longitude:3}));
});
