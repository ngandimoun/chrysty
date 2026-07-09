import assert from 'node:assert/strict';

import {
  DIGITAL_ZOOM_MIN,
  canAdjustZoom,
  getEffectiveZoomRange,
  getHardwareZoomRange,
  resolveDefaultZoom,
  splitZoom,
} from '@/lib/camera/zoom-model';

const hw05to10 = getHardwareZoomRange({ supported: true, min: 0.5, max: 10, step: 0.1 });
const hw1to10 = getHardwareZoomRange({ supported: true, min: 1, max: 10, step: 0.1 });
const hwUnsupported = getHardwareZoomRange({ supported: false, min: 1, max: 1, step: 0.1 });

assert.equal(DIGITAL_ZOOM_MIN, 0.25);

assert.deepEqual(getEffectiveZoomRange(hw05to10), { min: 0.25, max: 10, step: 0.1 });
assert.deepEqual(getEffectiveZoomRange(hw1to10), { min: 0.25, max: 10, step: 0.1 });
assert.deepEqual(getEffectiveZoomRange(hwUnsupported), { min: 0.25, max: 1, step: 0.1 });

assert.equal(canAdjustZoom(hw05to10), true);
assert.equal(canAdjustZoom(hwUnsupported), true);

assert.equal(resolveDefaultZoom(hw05to10), 1);
assert.equal(resolveDefaultZoom(hwUnsupported), 1);

assert.deepEqual(splitZoom(0.25, hw05to10), {
  displayZoom: 0.25,
  hardwareZoom: 0.5,
  digitalScale: 0.5,
});

assert.deepEqual(splitZoom(0.5, hw05to10), {
  displayZoom: 0.5,
  hardwareZoom: 0.5,
  digitalScale: 1,
});

assert.deepEqual(splitZoom(1, hw1to10), {
  displayZoom: 1,
  hardwareZoom: 1,
  digitalScale: 1,
});

assert.deepEqual(splitZoom(3, hw1to10), {
  displayZoom: 3,
  hardwareZoom: 3,
  digitalScale: 1,
});

assert.deepEqual(splitZoom(0.3, hw1to10), {
  displayZoom: 0.3,
  hardwareZoom: 1,
  digitalScale: 0.3,
});

assert.deepEqual(splitZoom(0.25, hwUnsupported), {
  displayZoom: 0.25,
  hardwareZoom: 1,
  digitalScale: 0.25,
});

console.log('zoom-model tests passed');
