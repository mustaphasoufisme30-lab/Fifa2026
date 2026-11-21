import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAnalogJoystickVector } from './joystickMath';
import { InputManager } from './inputManager';

test('computeAnalogJoystickVector enforces circular deadzone and returns neutral at center', () => {
  const center = computeAnalogJoystickVector(0, 0, 50, 0.14);
  assert.equal(center.active, false);
  assert.equal(center.x, 0);
  assert.equal(center.z, 0);
  assert.equal(center.magnitude, 0);

  // Inside 14% deadzone (dist = 5 out of 50 = 0.10)
  const tiny = computeAnalogJoystickVector(4, 3, 50, 0.14);
  assert.equal(tiny.active, false);
  assert.equal(tiny.x, 0);
  assert.equal(tiny.z, 0);
});

test('computeAnalogJoystickVector preserves true 360-degree direction and progressive curve', () => {
  // Small deflection (~40% radius) gives gentle progressive dribble magnitude
  const gentle = computeAnalogJoystickVector(20, 0, 50, 0.14);
  assert.equal(gentle.active, true);
  assert.ok(gentle.magnitude > 0.15 && gentle.magnitude < 0.35, `expected gentle mag, got ${gentle.magnitude}`);
  assert.ok(Math.abs(gentle.z) < 1e-6);

  // Arbitrary 360-degree diagonal angle (30 degrees) beyond outer rim clamps cleanly to 1.0
  const rad = Math.PI / 6;
  const full = computeAnalogJoystickVector(Math.cos(rad) * 120, Math.sin(rad) * 120, 50, 0.14);
  assert.equal(full.active, true);
  assert.ok(Math.abs(full.magnitude - 1.0) < 1e-5);
  assert.ok(Math.abs(full.x - Math.cos(rad)) < 1e-4);
  assert.ok(Math.abs(full.z - Math.sin(rad)) < 1e-4);
  assert.ok(Math.abs(Math.hypot(full.knobX, full.knobY) - 50) < 1e-4, 'visual knob must clamp to maxRadius');
});

test('InputManager integrates analog touch joystick, sprint, pass, shoot, and defense press seamlessly', () => {
  const im = new InputManager();

  // Analog off-axis movement (e.g. slight Z angle should not be dropped to 0!)
  im.setTouchJoystick(0.85, 0.03);
  im.setTouchSprint(true);
  im.triggerPass();
  im.setTouchShootHeld(true);

  const snap1 = im.consumeSnapshot();
  assert.ok(Math.abs(snap1.moveX - 0.85) < 1e-5);
  assert.ok(Math.abs(snap1.moveZ - 0.03) < 1e-5, 'radial analog Z component must be preserved');
  assert.equal(snap1.sprint, true);
  assert.equal(snap1.passPressed, true);
  assert.equal(snap1.shootHeld, true);
  assert.equal(snap1.shootReleased, false);

  // Release shoot & activate defense/press button
  im.setTouchShootHeld(false);
  im.setTouchSprint(false);
  im.setTouchPress(true);
  im.triggerTackle();
  im.setTouchJoystick(0, 0);

  const snap2 = im.consumeSnapshot();
  assert.equal(snap2.moveX, 0);
  assert.equal(snap2.moveZ, 0);
  assert.equal(snap2.shootHeld, false);
  assert.equal(snap2.shootReleased, true);
  assert.equal(snap2.tacklePressed, true);
  assert.equal(snap2.sprint, true, 'holding defense/press should assist pressing without changing physics');

  im.setTouchPress(false);
  const snap3 = im.consumeSnapshot();
  assert.equal(snap3.sprint, false);
  assert.equal(snap3.tacklePressed, false);
});
