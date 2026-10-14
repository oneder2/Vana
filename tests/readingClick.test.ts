import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadingClickTracker } from '../src/lib/readingClick';

const point = (x = 100, y = 100, timeStamp = 0, pointerId = 1) => ({
  clientX: x, clientY: y, timeStamp, pointerId,
});

test('native event properties on the prototype are captured before release', () => {
  const gesture = new ReadingClickTracker();
  const nativeEvent = Object.create(point());
  assert.deepEqual(Object.keys(nativeEvent), []);
  gesture.begin(nativeEvent, true, 0);
  assert.equal(gesture.finish(Object.create(point(100, 100, 100))), true);
});

test('a brief click allows small hand jitter', () => {
  const gesture = new ReadingClickTracker();
  gesture.begin(point(), true, 0);
  gesture.move(point(102, 101, 40));
  assert.equal(gesture.finish(point(101, 102, 100)), true);
  assert.equal(gesture.finish(point(101, 102, 110)), false);
});

test('a drag cannot become a click by returning to its starting position', () => {
  const gesture = new ReadingClickTracker();
  gesture.begin(point(), true, 0);
  gesture.move(point(140, 100, 40));
  assert.equal(gesture.finish(point(100, 100, 120)), false);
  gesture.begin(point(), true, 0);
  assert.equal(gesture.finish(point(100, 108, 120)), false);
});

test('long presses and invalid timestamps do not prompt editing', () => {
  const gesture = new ReadingClickTracker();
  gesture.begin(point(), true, 0);
  assert.equal(gesture.finish(point(100, 100, 500)), false);
  gesture.begin(point(100, 100, 100), true, 0);
  assert.equal(gesture.finish(point(100, 100, 90)), false);
});

test('scroll, cancellation and secondary buttons do not become clicks', () => {
  const gesture = new ReadingClickTracker();
  gesture.begin(point(), true, 0);
  gesture.cancel();
  assert.equal(gesture.finish(point(100, 100, 100)), false);
  gesture.begin(point(), true, 2);
  assert.equal(gesture.finish(point(100, 100, 100)), false);
});

test('multiple pointers and mismatched release invalidate the whole gesture', () => {
  const gesture = new ReadingClickTracker();
  gesture.begin(point(), true, 0);
  gesture.begin(point(200, 100, 20, 2), false, 0);
  assert.equal(gesture.finish(point(100, 100, 100)), false);
  gesture.begin(point(), true, 0);
  assert.equal(gesture.finish(point(100, 100, 100, 2)), false);
});
