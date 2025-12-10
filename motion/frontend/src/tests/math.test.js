import { describe, it, expect } from 'vitest';
import { calculateStopSignYaw } from '../utils/math';

describe('calculateStopSignYaw', () => {
    it('returns angle + PI for East direction', () => {
        // Dir = (1, 0) -> Angle 0
        // Expected: PI
        const yaw = calculateStopSignYaw(1, 0);
        expect(yaw).toBeCloseTo(Math.PI);
    });

    it('returns angle + PI for North direction', () => {
        // Dir = (0, 1) -> Angle PI/2
        // Expected: PI/2 + PI = 3PI/2 (or -PI/2 equivalent)
        const yaw = calculateStopSignYaw(0, 1);
        expect(yaw).toBeCloseTo(Math.PI * 1.5);
    });

    it('returns angle + PI for West direction', () => {
        // Dir = (-1, 0) -> Angle PI
        // Expected: PI + PI = 2PI (0)
        const yaw = calculateStopSignYaw(-1, 0);
        expect(yaw).toBeCloseTo(Math.PI * 2);
    });
});
