export interface GameSettings {
  mute: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
}

export interface GameState {
  amounts: number[];
  capacities: number[];
  goal: number;
  currentLevel: number;
  moves: number;
  time: number;
  isWon: boolean;
  history: number[][]; // Stack of historical amounts for undo
  redoHistory: number[][]; // Stack of historical amounts for redo
  settings: GameSettings;
}

export interface BucketState {
  id: number;
  capacity: number;
  amount: number;
  targetAmount: number;
  
  // Physics positions
  x: number;
  y: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  
  // Rotation and layout
  angle: number; // in radians
  targetAngle: number; // in radians
  scaleX: number; // for squash and stretch
  scaleY: number; // for squash and stretch
  
  // Interaction states
  isDragged: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  
  // Animation/Pouring state
  isPouring: boolean;
  pourProgress: number; // 0 to 1
  pourTargetId: number | null;
  pourDirection: number; // -1 for left, 1 for right
  
  // Water wobble variables (spring-mass-damper for sloshing)
  wobbleAngle: number;
  wobbleVelocity: number;
  
  // Rest and bounce physics
  velocity: { x: number; y: number };
  onTable: boolean;
  bounceOffset: number;
  bounceVelocity: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface WaterParticle extends Particle {
  opacity: number;
}

export interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  amplitude: number;
  frequency: number;
  offset: number;
}
