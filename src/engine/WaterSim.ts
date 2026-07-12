import type { BucketState, WaterParticle, AmbientParticle } from './Types';

// Constants for water surface wave system
const SPRING_CONSTANT = 0.12; // stiffness
const DAMPING = 0.06; // friction
const SPREAD = 0.2; // how fast ripples propagate across the surface
const NUM_NODES = 12; // resolution of water surface

interface WaveNode {
  y: number;
  velocity: number;
}

export class WaterSim {
  // Map of bucket ID -> surface wave nodes
  private waveNodes: Map<number, WaveNode[]> = new Map();
  private flowRate: number = 3.0; // Liters per second
  private splashTimer: number = 0;

  constructor() {
    // Wave nodes will be lazy-initialized for each bucket
  }

  private initBucketNodes(bucketId: number) {
    const nodes: WaveNode[] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      nodes.push({ y: 0, velocity: 0 });
    }
    this.waveNodes.set(bucketId, nodes);
  }

  public getNodes(bucketId: number): WaveNode[] {
    if (!this.waveNodes.has(bucketId)) {
      this.initBucketNodes(bucketId);
    }
    return this.waveNodes.get(bucketId)!;
  }

  /**
   * Applies a ripple force at a specific point on the bucket's water surface
   * @param bucketId Target bucket
   * @param index Point index (0 to NUM_NODES - 1)
   * @param force Force amount (negative is downward displacement/velocity)
   */
  public triggerRipple(bucketId: number, index: number, force: number) {
    const nodes = this.getNodes(bucketId);
    const clampedIndex = Math.max(0, Math.min(NUM_NODES - 1, index));
    nodes[clampedIndex].velocity += force;
  }

  /**
   * Triggers a slosh wave when a bucket is accelerated horizontally.
   */
  public triggerSlosh(bucketId: number, velocityX: number) {
    const nodes = this.getNodes(bucketId);
    // Displace left and right sides in opposite directions
    const force = velocityX * 0.15;
    nodes[0].velocity += force;
    nodes[1].velocity += force * 0.5;
    nodes[NUM_NODES - 1].velocity -= force;
    nodes[NUM_NODES - 2].velocity -= force * 0.5;
  }

  /**
   * Main simulation frame step.
   * Updates spring-mass systems, handles active pouring transitions, and spawns water/ambient particles.
   */
  public update(
    buckets: BucketState[],
    waterParticles: WaterParticle[],
    ambientParticles: AmbientParticle[],
    dt: number,
    onPourStep: (fromId: number, toId: number, amount: number) => void,
    onPourComplete: (fromId: number, toId: number) => void,
    reduceMotion: boolean
  ) {
    this.updateWaterSurfaces(buckets, dt, reduceMotion);
    this.updatePouringState(buckets, waterParticles, dt, onPourStep, onPourComplete);
    this.updateParticles(waterParticles, ambientParticles, dt);
  }

  /**
   * Updates the surface wave equation for all buckets
   */
  private updateWaterSurfaces(buckets: BucketState[], dt: number, reduceMotion: boolean) {
    // If reduceMotion is active, damp everything immediately
    const k = reduceMotion ? 0.3 : SPRING_CONSTANT;
    const d = reduceMotion ? 0.2 : DAMPING;
    const s = reduceMotion ? 0.05 : SPREAD;
    const timeScale = Math.min(dt * 60, 2.0); // Clamp dt to prevent explosion on frame drops

    buckets.forEach(bucket => {
      const nodes = this.getNodes(bucket.id);

      // 1. Update spring forces (individual oscillators)
      for (let i = 0; i < NUM_NODES; i++) {
        const node = nodes[i];
        const displacement = node.y; // distance from equilibrium (0)
        const force = -k * displacement - d * node.velocity;
        node.velocity += force * timeScale;
        node.y += node.velocity * timeScale;
      }

      // 2. Propagate waves across neighbors (double-pass to simulate ripple spread)
      const leftDeltas = new Array(NUM_NODES).fill(0);
      const rightDeltas = new Array(NUM_NODES).fill(0);

      for (let i = 0; i < NUM_NODES; i++) {
        if (i > 0) {
          leftDeltas[i] = s * (nodes[i].y - nodes[i - 1].y);
          nodes[i - 1].velocity += leftDeltas[i] * timeScale;
        }
        if (i < NUM_NODES - 1) {
          rightDeltas[i] = s * (nodes[i].y - nodes[i + 1].y);
          nodes[i + 1].velocity += rightDeltas[i] * timeScale;
        }
      }

      for (let i = 0; i < NUM_NODES; i++) {
        if (i > 0) nodes[i - 1].y += leftDeltas[i] * timeScale;
        if (i < NUM_NODES - 1) nodes[i + 1].y += rightDeltas[i] * timeScale;
      }

      // 3. Add random minor idle breathing ripples
      if (!reduceMotion && Math.random() < 0.02) {
        const randIndex = Math.floor(Math.random() * NUM_NODES);
        nodes[randIndex].velocity += (Math.random() * 0.4 - 0.2);
      }
    });
  }

  /**
   * Updates active pours, adjusts volumes, and spawns pouring stream elements
   */
  private updatePouringState(
    buckets: BucketState[],
    waterParticles: WaterParticle[],
    dt: number,
    onPourStep: (fromId: number, toId: number, amount: number) => void,
    onPourComplete: (fromId: number, toId: number) => void
  ) {
    this.splashTimer += dt;

    buckets.forEach(source => {
      if (!source.isPouring || source.pourTargetId === null) return;

      const dest = buckets.find(b => b.id === source.pourTargetId);
      if (!dest) return;

      // Calculate how much we can pour
      const remainingSource = source.amount;
      const remainingDestSpace = dest.capacity - dest.amount;
      const maxTransfer = Math.min(remainingSource, remainingDestSpace);

      // If we've completed the pour
      if (maxTransfer <= 0.001) {
        source.isPouring = false;
        source.pourTargetId = null;
        source.targetAngle = 0; // Rotate upright
        onPourComplete(source.id, dest.id);
        return;
      }

      // Calculate transfer step
      const transferStep = Math.min(this.flowRate * dt, maxTransfer);
      
      // Update amounts smoothly
      source.amount -= transferStep;
      dest.amount += transferStep;
      source.targetAmount = source.amount;
      dest.targetAmount = dest.amount;

      // Trigger callback to notify state/sound synth
      onPourStep(source.id, dest.id, transferStep);

      // Calculate lip physics point
      const lip = this.getBucketLipPoint(source);
      // Target hits the water surface height
      const targetWaterLevelPercent = dest.amount / dest.capacity;
      const targetWaterY = dest.y + dest.height / 2 - targetWaterLevelPercent * dest.height;

      // X coordinate is centered on target bucket mouth
      const hitX = dest.x;
      const hitY = Math.min(targetWaterY, dest.y + dest.height / 2 - 10); // clamp slightly above bottom

      // Spawn falling stream particles
      this.spawnStreamParticles(lip.x, lip.y, hitX, hitY, transferStep, waterParticles);

      // Trigger landing splashes and ripples in the target bucket
      if (this.splashTimer > 0.05) {
        this.splashTimer = 0;
        
        // Ripple center
        const hitIndex = Math.floor(NUM_NODES / 2);
        const splashForce = -3.5 - Math.min(transferStep * 15, 6);
        this.triggerRipple(dest.id, hitIndex, splashForce);
        this.triggerRipple(dest.id, hitIndex - 1, splashForce * 0.5);
        this.triggerRipple(dest.id, hitIndex + 1, splashForce * 0.5);

        // Spawn splash droplets popping up from water surface
        const splashCount = Math.floor(3 + Math.random() * 4);
        for (let k = 0; k < splashCount; k++) {
          const vx = (Math.random() * 4 - 2) * 50;
          const vy = - (100 + Math.random() * 150);
          waterParticles.push({
            x: hitX + (Math.random() * 10 - 5),
            y: hitY - 5,
            vx,
            vy,
            color: '#4FA9FF',
            size: 2 + Math.random() * 3,
            life: 0,
            maxLife: 0.4 + Math.random() * 0.3,
            opacity: 0.8
          });
        }
      }
    });
  }

  /**
   * Spawns flowing particles along a Bezier path from source lip to dest surface
   */
  private spawnStreamParticles(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    transferStep: number,
    waterParticles: WaterParticle[]
  ) {
    // Flow speed density
    const particleCount = Math.floor(2 + transferStep * 120);
    const controlX = (startX + endX) / 2;
    const controlY = Math.min(startY, endY) - 50; // curve upwards slightly

    for (let i = 0; i < particleCount; i++) {
      // Pick a random parameter along the Bezier curve to spawn, to simulate continuous stream
      const t = Math.random();
      
      // Bezier formula: B(t) = (1-t)^2*P0 + 2(1-t)*t*P1 + t^2*P2
      const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * endX;
      const by = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * controlY + t * t * endY;

      // Particle velocity along curve tangent
      const dx = 2 * (1 - t) * (controlX - startX) + 2 * t * (endX - controlX);
      const dy = 2 * (1 - t) * (controlY - startY) + 2 * t * (endY - controlY);
      const len = Math.sqrt(dx * dx + dy * dy);
      const speed = 300 + Math.random() * 100;

      waterParticles.push({
        x: bx + (Math.random() * 6 - 3),
        y: by + (Math.random() * 6 - 3),
        vx: (dx / len) * speed + (Math.random() * 10 - 5),
        vy: (dy / len) * speed + (Math.random() * 10 - 5),
        color: '#4FA9FF',
        size: 3 + Math.random() * 4,
        life: 0,
        maxLife: 0.15, // short life, recreated along curve
        opacity: 0.9
      });
    }
  }

  /**
   * Computes the pouring lip point of a tilted bucket
   */
  public getBucketLipPoint(bucket: BucketState): { x: number; y: number } {
    const isPouringRight = bucket.pourDirection > 0;
    const halfWidth = bucket.width / 2;
    const halfHeight = bucket.height / 2;
    
    // The bucket rotates around its lip corner (top left or top right)
    // Depending on rotation angle, calculate coordinates of pouring rim
    const localLipX = isPouringRight ? halfWidth : -halfWidth;
    const localLipY = -halfHeight;

    // Rotate local coords by bucket angle
    const cosA = Math.cos(bucket.angle);
    const sinA = Math.sin(bucket.angle);

    const rotatedLipX = localLipX * cosA - localLipY * sinA;
    const rotatedLipY = localLipX * sinA + localLipY * cosA;

    return {
      x: bucket.x + rotatedLipX,
      y: bucket.y + rotatedLipY
    };
  }

  /**
   * Updates all active particle physics
   */
  private updateParticles(
    waterParticles: WaterParticle[],
    ambientParticles: AmbientParticle[],
    dt: number
  ) {
    // 1. Water particles (gravity-bound)
    for (let i = waterParticles.length - 1; i >= 0; i--) {
      const p = waterParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        waterParticles.splice(i, 1);
        continue;
      }

      // Apply gravity
      p.vy += 650 * dt; // gravity force
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.opacity = 1 - (p.life / p.maxLife);
    }

    // 2. Ambient dust particles (floating slowly in sinusoidal wave)
    ambientParticles.forEach(p => {
      p.offset += dt * p.frequency;
      
      // Floating sinusoidal motion
      const driftX = Math.sin(p.offset) * p.amplitude * dt;
      p.x += (p.vx + driftX) * dt;
      p.y += p.vy * dt;

      // Wrap around bounds
      if (p.y < -10) {
        p.y = window.innerHeight + 10;
        p.x = Math.random() * window.innerWidth;
      }
      if (p.x < -10) p.x = window.innerWidth + 10;
      if (p.x > window.innerWidth + 10) p.x = -10;
    });
  }
}
