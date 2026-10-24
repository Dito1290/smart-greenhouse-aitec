import { describe, expect, it } from 'vitest';
import { parseSensorPayload, SENSOR_FIELDS } from '../src/sensors/schema.js';
import { VALID_PAYLOAD } from './helpers.js';

describe('parseSensorPayload', () => {
  it('parses every firmware field with original names', () => {
    const r = parseSensorPayload(JSON.stringify(VALID_PAYLOAD));
    expect(r.ok).toBe(true);
    for (const f of SENSOR_FIELDS) expect(r.values[f]).toBe(VALID_PAYLOAD[f]);
    expect(r.issues).toEqual({});
    expect(r.mirrorMismatch).toEqual([]);
  });

  it('never turns missing or null fields into zero', () => {
    const { pH, uv_intensity, ...rest } = VALID_PAYLOAD;
    const r = parseSensorPayload(JSON.stringify({ ...rest, uv_intensity: null }));
    expect(r.ok).toBe(true);
    expect(r.values.pH).toBeNull();
    expect(r.values.uv_intensity).toBeNull();
    expect(r.issues.pH).toBe('missing');
    expect(r.issues.uv_intensity).toBe('null');
  });

  it('rejects non-numeric and out-of-range values per field', () => {
    const r = parseSensorPayload(JSON.stringify({ ...VALID_PAYLOAD, pH: 19.3, TDS: 'abc', env_humidity: -5 }));
    expect(r.values.pH).toBeNull();
    expect(r.issues.pH).toBe('out_of_range');
    expect(r.values.TDS).toBeNull();
    expect(r.issues.TDS).toBe('not_a_number');
    expect(r.values.env_humidity).toBeNull();
    expect(r.values.env_temp_c).toBe(29.8);
  });

  it('handles invalid JSON and non-object payloads without throwing', () => {
    expect(parseSensorPayload('{"TDS": 8').error).toBe('invalid_json');
    expect(parseSensorPayload('[1,2]').error).toBe('not_an_object');
    expect(parseSensorPayload('null').error).toBe('not_an_object');
    expect(parseSensorPayload('{}').error).toBe('no_valid_fields');
  });

  it('flags mirror fields that disagree with their source', () => {
    const r = parseSensorPayload(JSON.stringify({ ...VALID_PAYLOAD, temperature: 25 }));
    expect(r.mirrorMismatch).toEqual(['temperature']);
  });
});
