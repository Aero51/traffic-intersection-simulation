// Scene geometry, copied from GlavnaKlasa.java (start(), lines 132-158).
// Coordinates are JavaFX layoutX/layoutY in the original 900x500 scene.

export const SCENE_WIDTH = 900;
export const SCENE_HEIGHT = 500;

// All signals were built with prefWidth(16).prefHeight(40).
export const SIGNAL_WIDTH = 16;
export const SIGNAL_HEIGHT = 40;

export type SignalKind = 'vehicle' | 'pedestrian' | 'turn';

export interface SignalPlacement {
  /** 1-based id, matching the numbering used by the original menu spinner. */
  id: number;
  kind: SignalKind;
  x: number;
  y: number;
  rotate: number;
  dark: boolean;
}

export const SIGNALS: SignalPlacement[] = [
  // Semafor (vehicle) 1-5
  { id: 1, kind: 'vehicle', x: 492, y: 291, rotate: 300, dark: true },
  { id: 2, kind: 'vehicle', x: 466, y: 344, rotate: 210, dark: true },
  { id: 3, kind: 'vehicle', x: 40, y: 170, rotate: 130, dark: true },
  { id: 4, kind: 'vehicle', x: 91, y: 130, rotate: 30, dark: true },
  { id: 5, kind: 'vehicle', x: 492, y: 29, rotate: 270, dark: true },
  // SemaforPjesaci (pedestrian) 6-9
  { id: 6, kind: 'pedestrian', x: 461, y: 282, rotate: 30, dark: true },
  { id: 7, kind: 'pedestrian', x: 385, y: 395, rotate: 210, dark: false },
  { id: 8, kind: 'pedestrian', x: 459, y: 39, rotate: 170, dark: false },
  { id: 9, kind: 'pedestrian', x: 470, y: 135, rotate: 170, dark: false },
  // Skretaci (turn arrow) 10-12
  { id: 10, kind: 'turn', x: 509, y: 283, rotate: 0, dark: false },
  { id: 11, kind: 'turn', x: 85, y: 112, rotate: 0, dark: false },
  { id: 12, kind: 'turn', x: 504, y: 16, rotate: 0, dark: false },
];

/** "Tipkalo" (pedestrian request button) position. */
export const TIPKALO = { x: 477, y: 211 };
