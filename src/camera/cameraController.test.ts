import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraController } from './cameraController';

test('TV camera zooms slightly in attacking danger zone and pulls back when play stretches', () => {
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 290);
  const ctrl = new CameraController();
  ctrl.snapToGameplay({ x: 0, y: 0.22, z: 0 }, 'tv');

  // Settle in midfield neutral position
  for (let i = 0; i < 60; i++) {
    ctrl.update(cam, 'playing', 'tv', { x: 0, y: 0.22, z: 0 }, { x: 0, y: 0, z: 0 }, false, 0.03);
  }
  const midfieldY = cam.position.y;
  const midfieldFov = cam.fov;

  // Move into attacking penalty box (danger zone): camera should smoothly tighten slightly
  for (let i = 0; i < 90; i++) {
    ctrl.update(cam, 'playing', 'tv', { x: 45, y: 0.22, z: 2 }, { x: 44, y: 0, z: 2 }, false, 0.03);
  }
  assert.ok(cam.position.y < midfieldY - 0.5, `expected danger zoom height < ${midfieldY - 0.5}, got ${cam.position.y}`);
  assert.ok(cam.fov < midfieldFov - 0.8, `expected danger zoom FOV < ${midfieldFov - 0.8}, got ${cam.fov}`);

  // Spread ball far from controlled player during long switch: camera should automatically pull back
  for (let i = 0; i < 90; i++) {
    ctrl.update(
      cam,
      'playing',
      'tv',
      { x: 10, y: 0.22, z: -12 },
      { x: -14, y: 0, z: 12 },
      false,
      0.03,
      { ballVelocity: { x: 24, y: 0, z: -6 } },
    );
  }
  assert.ok(cam.position.y > midfieldY + 0.8, `expected spread pullback height > ${midfieldY + 0.8}, got ${cam.position.y}`);
});

test('CLOSE camera transitions progressively without instant FOV jumps or ground clipping', () => {
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 290);
  const ctrl = new CameraController();
  ctrl.snapToGameplay({ x: 0, y: 0.22, z: 0 }, 'tv');
  ctrl.update(cam, 'playing', 'tv', { x: 0, y: 0.22, z: 0 }, { x: 0, y: 0, z: 0 }, false, 0.016);
  const startY = cam.position.y;
  const startFov = cam.fov;

  // First frame into CLOSE mode should move smoothly part-way, never snap instantaneously
  ctrl.update(cam, 'playing', 'close', { x: 0, y: 0.22, z: 0 }, { x: 0, y: 0, z: 0 }, false, 0.016);
  assert.ok(cam.position.y < startY && cam.position.y > 14.5, `expected gradual Y transition from ${startY}, got ${cam.position.y}`);
  assert.ok(cam.fov < startFov && cam.fov > 40.5, `expected gradual FOV transition from ${startFov}, got ${cam.fov}`);

  // Settle in CLOSE mode and confirm safe anti-clipping height floor
  for (let i = 0; i < 80; i++) {
    ctrl.update(cam, 'playing', 'close', { x: 15, y: 0.22, z: 5 }, { x: 14, y: 0, z: 5 }, false, 0.03);
  }
  assert.ok(cam.position.y >= 5.8, 'CLOSE camera must stay safely above pitch & players');
  assert.ok(cam.position.y < 13.5, 'CLOSE camera should sit lower than TV camera');
});

test('Goal broadcast celebration smoothly recenters and zooms toward the scorer without blocking', () => {
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 290);
  const ctrl = new CameraController();
  ctrl.snapToGameplay({ x: 52, y: 1.0, z: 0 }, 'tv');

  for (let i = 0; i < 80; i++) {
    ctrl.update(
      cam,
      'playing',
      'tv',
      { x: 53, y: 0.3, z: 1 },
      { x: 40, y: 0, z: -3 },
      true,
      0.03,
      { scorerPos: { x: 42, y: 0, z: -4 }, isReplaying: false },
    );
  }

  assert.ok(cam.position.y < 11.5 && cam.position.y >= 5.8, 'Goal celebration should zoom in safely');
  assert.ok(cam.fov < 39.0, 'Goal celebration should tighten broadcast FOV slightly');
});
