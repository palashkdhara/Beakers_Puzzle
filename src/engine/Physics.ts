import type { BucketState } from './Types';
import { SoundSynth } from './SoundSynth';

// Constants for physics easing and springs
const DRAG_SPEED = 15.0; // Inertial lag speed
const RESTORE_SPEED = 12.0; // Spring back speed
const ROTATION_SPEED = 8.0; // Easing for bucket pouring tilt
const BOUNCE_K = 0.25; // Table drop bounce stiffness
const BOUNCE_DAMP = 0.85; // Table drop bounce dampening
const WOBBLE_K = 0.18; // Water slosh angle stiffness
const WOBBLE_DAMP = 0.92; // Water slosh angle dampening

export class PhysicsEngine {
  private soundSynth: SoundSynth;
  private activeDragBucket: BucketState | null = null;
  private isPointerDown: boolean = false;

  constructor(soundSynth: SoundSynth) {
    this.soundSynth = soundSynth;
  }

  /**
   * Performs hit-testing to see if the user clicked inside a bucket.
   * Checks a generous touch target area around the bucket.
   */
  public getBucketAtPoint(buckets: BucketState[], px: number, py: number): BucketState | null {
    // Traverse in reverse order so elements drawn on top are hit first
    for (let i = buckets.length - 1; i >= 0; i--) {
      const b = buckets[i];
      // Skip if already pouring
      if (b.isPouring || b.pourTargetId !== null) continue;

      const halfW = b.width / 2 + 15; // generous touch padding
      const halfH = b.height / 2 + 15;
      
      if (
        px >= b.x - halfW &&
        px <= b.x + halfW &&
        py >= b.y - halfH &&
        py <= b.y + halfH
      ) {
        return b;
      }
    }
    return null;
  }

  public handlePointerDown(buckets: BucketState[], px: number, py: number): boolean {
    this.isPointerDown = true;
    const bucket = this.getBucketAtPoint(buckets, px, py);
    
    if (bucket) {
      this.activeDragBucket = bucket;
      bucket.isDragged = true;
      bucket.dragOffsetX = bucket.x - px;
      bucket.dragOffsetY = bucket.y - py;
      bucket.onTable = false;
      
      // Squash on lift (tactile response)
      bucket.scaleX = 0.92;
      bucket.scaleY = 1.08;
      
      this.soundSynth.playLift();
      this.soundSynth.startDrag();
      return true;
    }
    return false;
  }

  public handlePointerMove(px: number, py: number, speed: number) {
    if (this.activeDragBucket && this.isPointerDown) {
      // Calculate target coordinate with offset
      const targetX = px + this.activeDragBucket.dragOffsetX;
      const targetY = py + this.activeDragBucket.dragOffsetY;
      
      // Update sounds
      this.soundSynth.updateDrag(speed);
      
      // We will interpolate towards this in the update loop rather than snapping instantly,
      // to give the buckets a heavy, satisfying feeling.
      this.activeDragBucket.startX = targetX;
      this.activeDragBucket.startY = targetY;
    }
  }

  public handlePointerUp(
    buckets: BucketState[],
    onPourTrigger: (fromId: number, toId: number) => void
  ) {
    this.isPointerDown = false;
    this.soundSynth.stopDrag();

    if (!this.activeDragBucket) return;

    const source = this.activeDragBucket;
    source.isDragged = false;
    this.activeDragBucket = null;

    // Check if released near another bucket for pouring
    let poured = false;
    for (let i = 0; i < buckets.length; i++) {
      const dest = buckets[i];
      if (dest.id === source.id) continue;

      // Pour condition: source is dragged close enough and is positioned above dest
      const dx = source.x - dest.x;
      const dy = source.y - (dest.y - dest.height / 2 - 50); // Above destination mouth
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 150 && source.amount > 0 && dest.amount < dest.capacity) {
        // Snap source to pour configuration above target
        const isLeft = source.x < dest.x;
        source.pourDirection = isLeft ? 1 : -1; // 1 means pouring rightwards, -1 leftwards
        
        // Target pour position relative to destination mouth
        const offset = dest.width * 0.55;
        source.startX = dest.x + (isLeft ? -offset : offset);
        source.startY = dest.y - dest.height * 0.75;
        
        source.isPouring = true;
        source.pourTargetId = dest.id;
        source.targetAngle = isLeft ? 1.3 : -1.3; // Tilt angle (~75 degrees)
        
        onPourTrigger(source.id, dest.id);
        poured = true;
        break;
      }
    }

    if (!poured) {
      // Return to its original table slot (which we will restore in the Game class)
      source.targetAngle = 0;
      source.pourTargetId = null;
      source.isPouring = false;
      
      // Squash on drop trigger
      source.scaleX = 1.08;
      source.scaleY = 0.92;
    }
  }

  /**
   * Main physics frame step
   */
  public update(buckets: BucketState[], dt: number, originalSlots: { x: number; y: number }[]) {
    const timeScale = Math.min(dt * 60, 2.0);

    buckets.forEach(bucket => {
      const originalSlot = originalSlots[bucket.id];

      // 1. Position Easing (Weight & Inertia)
      if (bucket.isDragged) {
        // Drag interpolation: interpolate x, y towards startX, startY (which stores the pointer target)
        const prevX = bucket.x;
        const dx = bucket.startX - bucket.x;
        const dy = bucket.startY - bucket.y;
        
        bucket.velocity.x = dx * DRAG_SPEED;
        bucket.velocity.y = dy * DRAG_SPEED;
        
        bucket.x += bucket.velocity.x * dt;
        bucket.y += bucket.velocity.y * dt;

        // Apply visual tilt proportional to drag speed
        const deltaX = bucket.x - prevX;
        bucket.targetAngle = Math.max(-0.25, Math.min(0.25, deltaX * 0.05));
      } else if (bucket.isPouring) {
        // Pour snapping interpolation
        bucket.x += (bucket.startX - bucket.x) * RESTORE_SPEED * dt;
        bucket.y += (bucket.startY - bucket.y) * RESTORE_SPEED * dt;
      } else {
        // Return to resting slot on table
        const dx = originalSlot.x - bucket.x;
        const dy = originalSlot.y - bucket.y;
        
        bucket.velocity.x = dx * RESTORE_SPEED;
        bucket.velocity.y = dy * RESTORE_SPEED;
        
        const prevY = bucket.y;
        bucket.x += bucket.velocity.x * dt;
        bucket.y += bucket.velocity.y * dt;

        // Detect table impact
        if (prevY < originalSlot.y && bucket.y >= originalSlot.y) {
          bucket.y = originalSlot.y;
          bucket.velocity.y = 0;
          
          if (!bucket.onTable) {
            bucket.onTable = true;
            this.soundSynth.playDrop();
            
            // Trigger squash and drop bounce
            bucket.bounceVelocity = 4.0; 
            bucket.scaleX = 1.12;
            bucket.scaleY = 0.88;
          }
        }
      }

      // 2. Angle/Rotation Easing
      bucket.angle += (bucket.targetAngle - bucket.angle) * ROTATION_SPEED * dt;

      // 3. Water Wobble/Sloshing Physics
      // wobble is affected by horizontal bucket acceleration and updates like a spring-mass oscillator
      const accelX = bucket.velocity.x * dt;
      const wobbleForce = -accelX * 0.005; // force depends on acceleration
      
      const wobbleAccel = -WOBBLE_K * bucket.wobbleAngle - WOBBLE_DAMP * bucket.wobbleVelocity + wobbleForce;
      bucket.wobbleVelocity += wobbleAccel * timeScale;
      bucket.wobbleAngle += bucket.wobbleVelocity * timeScale;

      // 4. Elastic scale bounce decay (Squash & Stretch)
      // Restore scales to 1.0 using a damp spring
      const scaleElasticity = 0.15;
      const forceX = -scaleElasticity * (bucket.scaleX - 1.0);

      // Bounce values act as velocities
      bucket.bounceOffset += forceX; // reuse bounce offset as a spring rate
      bucket.scaleX += (1.0 - bucket.scaleX) * 0.12 * timeScale;
      bucket.scaleY += (1.0 - bucket.scaleY) * 0.12 * timeScale;

      // Drop bounce bounceOffset spring
      if (bucket.onTable && Math.abs(bucket.bounceVelocity) > 0.01) {
        const bounceForce = -BOUNCE_K * bucket.bounceOffset - BOUNCE_DAMP * bucket.bounceVelocity;
        bucket.bounceVelocity += bounceForce * timeScale;
        bucket.bounceOffset += bucket.bounceVelocity * timeScale;
        
        // Decaying wobble visual
        if (Math.abs(bucket.bounceVelocity) < 0.05) {
          bucket.bounceVelocity = 0;
          bucket.bounceOffset = 0;
        }
      }
    });
  }
}
