import type { BucketState, WaterParticle, AmbientParticle } from './Types';
import { StateManager } from './State';
import { PhysicsEngine } from './Physics';
import { WaterSim } from './WaterSim';
import { CanvasRenderer } from './CanvasRenderer';
import { SoundSynth } from './SoundSynth';
import { Solver } from './Solver';

export class GameOrchestrator {
  private stateManager: StateManager;
  private physics: PhysicsEngine;
  private waterSim: WaterSim;
  private renderer: CanvasRenderer;
  private soundSynth: SoundSynth;
  private solver: Solver;

  // Canvas elements
  private canvas: HTMLCanvasElement;
  private isRunning: boolean = false;
  private lastTime: number = 0;

  // Game assets & actors
  private buckets: BucketState[] = [];
  private waterParticles: WaterParticle[] = [];
  private ambientParticles: AmbientParticle[] = [];
  private originalSlots: { x: number; y: number }[] = [];

  // Auto solver queue
  private autoSolveQueue: { from: number; to: number }[] = [];
  private autoSolveDelayTimer: number = 0;

  // Interactive UI hovered items
  private hoveredButtonId: string | null = null;
  private activeHintText: string | null = null;
  private hintStage: number = 0;
  private hintTimeout: any = null;

  // Pointer position tracking for drag velocity calculation
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private pointerSpeed: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.soundSynth = new SoundSynth();
    this.stateManager = new StateManager();
    this.physics = new PhysicsEngine(this.soundSynth);
    this.waterSim = new WaterSim();
    this.renderer = new CanvasRenderer(this.canvas, this.waterSim);
    
    const initialState = this.stateManager.getGameState();
    this.solver = new Solver(initialState.capacities);

    this.initBuckets();
    this.initAmbientParticles();
    this.setupEventListeners();

    // Subscribe to state changes
    this.stateManager.subscribe(() => {
      this.syncBucketsWithState();
      
      // Update sound synth mute configuration
      const state = this.stateManager.getGameState();
      this.soundSynth.setMute(state.settings.mute);

      // Keep solver in sync with dynamic capacities
      this.solver = new Solver(state.capacities);

      // Reset hint state on state change (user made a move)
      this.clearHint();
    });

    // Start loop
    this.isRunning = true;
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', () => this.checkOrientation());
    this.handleResize();
    requestAnimationFrame(this.loop);
  }

  private initBuckets() {
    const state = this.stateManager.getGameState();
    const capacities = state.capacities;
    const initialAmounts = state.amounts;

    this.buckets = [];
    for (let i = 0; i < capacities.length; i++) {
      this.buckets.push({
        id: i,
        capacity: capacities[i],
        amount: initialAmounts[i],
        targetAmount: initialAmounts[i],
        x: 0,
        y: 0,
        startX: 0,
        startY: 0,
        width: 100,
        height: 150,
        angle: 0,
        targetAngle: 0,
        scaleX: 1,
        scaleY: 1,
        isDragged: false,
        dragOffsetX: 0,
        dragOffsetY: 0,
        isPouring: false,
        pourProgress: 0,
        pourTargetId: null,
        pourDirection: 1,
        wobbleAngle: 0,
        wobbleVelocity: 0,
        velocity: { x: 0, y: 0 },
        onTable: true,
        bounceOffset: 0,
        bounceVelocity: 0
      });
    }
  }

  private initAmbientParticles() {
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      this.ambientParticles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() * 6 - 3) * 3, // very slow drift
        vy: - (15 + Math.random() * 20), // float upwards
        size: 1 + Math.random() * 2.5,
        opacity: 0.1 + Math.random() * 0.35,
        amplitude: 5 + Math.random() * 10,
        frequency: 0.5 + Math.random() * 1.0,
        offset: Math.random() * Math.PI * 2
      });
    }
  }

  private syncBucketsWithState() {
    const state = this.stateManager.getGameState();
    
    // Re-initialize buckets array if the number of beakers has changed
    if (this.buckets.length !== state.capacities.length) {
      this.initBuckets();
      this.handleResize(); // recalculate slots immediately!
      return;
    }

    this.buckets.forEach(b => {
      // If the bucket is not currently in a pouring animation, sync its amount
      if (!b.isPouring) {
        b.targetAmount = state.amounts[b.id];
        // Trigger water surface ripple slosh if value changed suddenly (e.g., undo/redo)
        if (Math.abs(b.amount - b.targetAmount) > 0.05) {
          const nodes = this.waterSim.getNodes(b.id);
          // Apply a vertical wobble ripple to all nodes
          nodes.forEach(n => n.velocity += (Math.random() * 2 - 1) * 3);
        }
      }
    });
  }

  private setupEventListeners() {
    // Touch Events
    this.canvas.addEventListener('touchstart', this.handlePointerDown, { passive: false });
    this.canvas.addEventListener('touchmove', this.handlePointerMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handlePointerUp, { passive: false });

    // Mouse Events
    this.canvas.addEventListener('mousedown', this.handlePointerDown);
    this.canvas.addEventListener('mousemove', this.handlePointerMove);
    window.addEventListener('mouseup', this.handlePointerUp);
  }

  private getPointerCoords(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  private handlePointerDown = (e: MouseEvent | TouchEvent) => {
    // Prevent scrolling or double-tap zoom gestures
    if (e.cancelable) e.preventDefault();

    const { x, y } = this.getPointerCoords(e);
    this.lastPointerX = x;
    this.lastPointerY = y;
    this.pointerSpeed = 0;

    // Lock sound synthesizer trigger on first user interaction
    this.soundSynth.init();

    // Attempt to lock landscape orientation on mobile devices upon user interaction
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch (e) {}
    }

    // Cancel any active auto-solve on user interaction
    this.autoSolveQueue = [];

    // 1. Check if victory overlay is active and we click "Play Again"
    const state = this.stateManager.getGameState();
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    if (state.isWon) {
      const playAgainW = 160;
      const playAgainH = 46;
      const playAgainX = (w - playAgainW) / 2;
      const playAgainY = (h - 340) / 2 + 340 - 75; // cardY + cardH - 75
      
      if (
        x >= playAgainX &&
        x <= playAgainX + playAgainW &&
        y >= playAgainY &&
        y <= playAgainY + playAgainH
      ) {
        this.soundSynth.playChime();
        
        if (state.currentLevel < 5) {
          const nextPuzzle = Solver.generatePuzzle(state.currentLevel + 1);
          this.stateManager.startNextLevel(nextPuzzle.capacities, nextPuzzle.goal);
        } else {
          this.stateManager.restartEntireGame();
        }
        this.renderer.triggerWinConfetti();
        return;
      }
    }

    // 2. HUD Buttons Click checks
    const clickedButton = this.getHUDButtonAtPoint(x, y, w, h);
    if (clickedButton) {
      this.handleHUDButtonClick(clickedButton);
      return;
    }

    // 3. Physics drag check
    if (!state.isWon) {
      this.physics.handlePointerDown(this.buckets, x, y);
    }
  };

  private handlePointerMove = (e: MouseEvent | TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    const { x, y } = this.getPointerCoords(e);

    // Calculate velocity for drag sound updates
    const dx = x - this.lastPointerX;
    const dy = y - this.lastPointerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    this.pointerSpeed = dist;
    this.lastPointerX = x;
    this.lastPointerY = y;

    // Update hovered buttons highlight
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    this.hoveredButtonId = this.getHUDButtonAtPoint(x, y, w, h);

    // Physics update
    this.physics.handlePointerMove(x, y, this.pointerSpeed);
  };

  private handlePointerUp = (_e: MouseEvent | TouchEvent) => {
    this.physics.handlePointerUp(this.buckets, (fromId, _toId) => {
      // Trigger dynamic pouring animation loop
      this.soundSynth.startPour();
      
      // Instantly start sloshing water on pour start
      const sourceNodes = this.waterSim.getNodes(fromId);
      sourceNodes.forEach(n => n.velocity += (Math.random() * 2 - 1) * 2.5);
    });
    this.hoveredButtonId = null;
  };

  private getHUDButtonAtPoint(x: number, y: number, w: number, h: number): string | null {
    const padding = 20;
    const headerW = Math.min(380, w - padding * 2);
    const headerX = (w - headerW) / 2;
    const headerY = padding;
    const buttonSize = 36;
    const state = this.stateManager.getGameState();

    // Check Header Buttons (Undo, Redo, Restart)
    const headerBtns = [
      { id: 'restart', x: headerX + headerW - 40 },
      { id: 'redo', x: headerX + headerW - 85, disabled: state.redoHistory.length === 0 },
      { id: 'undo', x: headerX + headerW - 130, disabled: state.history.length === 0 },
    ];

    for (let btn of headerBtns) {
      if (btn.disabled) continue;
      const bx = btn.x + buttonSize / 2;
      const by = headerY + 75 / 2; // header center
      const dist = Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by));
      if (dist <= buttonSize / 2) {
        return btn.id;
      }
    }

    // Check Footer Buttons (Mute, Contrast, Motion, Auto, Hint)
    const footerW = Math.min(380, w - padding * 2);
    const footerX = (w - footerW) / 2;
    const footerY = h - 50 - padding;
    const btnSpacing = (footerW - buttonSize - 50) / 4;

    const footerBtns = [
      { id: 'mute', x: footerX + 25 },
      { id: 'highContrast', x: footerX + 25 + btnSpacing },
      { id: 'reduceMotion', x: footerX + 25 + btnSpacing * 2 },
      { id: 'autoSolve', x: footerX + 25 + btnSpacing * 3 },
      { id: 'hint', x: footerX + footerW - 25 - buttonSize },
    ];

    for (let btn of footerBtns) {
      const bx = btn.x + buttonSize / 2;
      const by = footerY + 50 / 2; // footer center
      const dist = Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by));
      if (dist <= buttonSize / 2) {
        return btn.id;
      }
    }

    // Check victory play again button
    if (state.isWon) {
      const playAgainW = 160;
      const playAgainH = 46;
      const playAgainX = (w - playAgainW) / 2;
      const playAgainY = (h - 340) / 2 + 340 - 75;
      if (
        x >= playAgainX &&
        x <= playAgainX + playAgainW &&
        y >= playAgainY &&
        y <= playAgainY + playAgainH
      ) {
        return 'playAgain';
      }
    }

    return null;
  }

  private handleHUDButtonClick(id: string) {
    this.soundSynth.playChime();
    
    switch (id) {
      case 'undo':
        this.stateManager.undo();
        break;
      case 'redo':
        this.stateManager.redo();
        break;
      case 'restart':
        this.stateManager.resetPuzzle();
        break;
      case 'mute':
        this.stateManager.toggleMute();
        break;
      case 'highContrast':
        this.stateManager.toggleHighContrast();
        break;
      case 'reduceMotion':
        this.stateManager.toggleReduceMotion();
        break;
      case 'autoSolve':
        this.triggerAutoSolve();
        break;
      case 'hint':
        this.triggerHint();
        break;
    }
  }

  private triggerAutoSolve() {
    const state = this.stateManager.getGameState();
    if (state.isWon) return;

    // Run BFS solver to calculate the path of moves
    const solution = this.solver.solve(state.amounts);
    if (solution && solution.length > 0) {
      this.autoSolveQueue = solution.map(m => ({ from: m.from, to: m.to }));
      this.clearHint();
    } else {
      // If puzzle is already solved or stuck in unsolvable state
      this.activeHintText = "No solution path found. Try resetting the puzzle!";
      if (this.hintTimeout) clearTimeout(this.hintTimeout);
      this.hintTimeout = setTimeout(() => {
        this.clearHint();
      }, 4000);
    }
  }

  private triggerHint() {
    const state = this.stateManager.getGameState();
    
    // Cycle hint stage (1, 2, 3, then off)
    this.hintStage += 1;
    if (this.hintStage > 3) {
      this.clearHint();
      return;
    }

    this.activeHintText = this.solver.getHint(state.amounts, this.hintStage);

    // Auto-clear hint after 8 seconds
    if (this.hintTimeout) clearTimeout(this.hintTimeout);
    this.hintTimeout = setTimeout(() => {
      this.clearHint();
    }, 8000);
  }

  private clearHint() {
    this.activeHintText = null;
    this.hintStage = 0;
    if (this.hintTimeout) {
      clearTimeout(this.hintTimeout);
      this.hintTimeout = null;
    }
  }

  private handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Toggle portrait prompt on mobile screens
    this.checkOrientation();

    // Adjust scaling parameters in renderer
    this.renderer.resize(w, h);

    const N = this.buckets.length;
    if (N === 0) return;

    // Recalculate original bucket resting positions responsively
    const tableY = h * 0.72;
    
    // Resize bucket dimensions based on screen scale and beaker count
    const capMax = Math.max(...this.buckets.map(b => b.capacity));
    const scaleMultiplier = N === 3 ? 1.0 : (N === 4 ? 0.82 : 0.70);
    const screenScale = Math.max(0.48, Math.min(1.2, w / 700)) * scaleMultiplier;

    // size all buckets proportional to capacity
    this.buckets.forEach(b => {
      const relativeScale = b.capacity / capMax;
      const baseW = 90 + relativeScale * 35;
      const baseH = 115 + relativeScale * 70;
      b.width = baseW * screenScale;
      b.height = baseH * screenScale;
    });

    const gap = (N === 3 ? 60 : (N === 4 ? 40 : 25)) * screenScale;
    const centerX = w / 2;

    // Calculate total width of all beakers + gaps
    let totalWidth = 0;
    this.buckets.forEach((b, idx) => {
      totalWidth += b.width;
      if (idx > 0) totalWidth += gap;
    });

    // Compute starting x
    let currentX = centerX - totalWidth / 2;

    this.originalSlots = [];
    this.buckets.forEach(b => {
      const beakerCenter = currentX + b.width / 2;
      this.originalSlots.push({
        x: beakerCenter,
        y: tableY - b.height / 2
      });
      currentX += b.width + gap;
    });

    this.buckets.forEach((b, idx) => {
      // If starting or not currently dragged/pouring, set coordinates
      if (!this.isRunning || (!b.isDragged && !b.isPouring)) {
        b.x = this.originalSlots[idx].x;
        b.y = this.originalSlots[idx].y;
        b.startX = b.x;
        b.startY = b.y;
      }
    });
  };

  private checkOrientation() {
    const prompt = document.getElementById('orientation-prompt');
    if (!prompt) return;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isPortrait = window.innerHeight > window.innerWidth;

    if (isMobile && isPortrait) {
      prompt.style.display = 'flex';
      this.isRunning = false;
    } else {
      prompt.style.display = 'none';
      if (!this.isRunning) {
        this.isRunning = true;
        this.lastTime = 0; // Reset lastTime delta tracking
        requestAnimationFrame(this.loop);
      }
    }
  }

  /**
   * Main game physics & animation loop
   */
  private loop = (timestamp: number) => {
    if (!this.isRunning) return;

    if (!this.lastTime) this.lastTime = timestamp;
    const dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Process Auto Solver queue if not empty and no bucket is actively pouring
    if (this.autoSolveDelayTimer > 0) {
      this.autoSolveDelayTimer -= dt;
    } else if (this.autoSolveQueue.length > 0) {
      const isAnyPouring = this.buckets.some(b => b.isPouring || b.pourTargetId !== null);
      if (!isAnyPouring) {
        const nextMove = this.autoSolveQueue.shift()!;
        const source = this.buckets[nextMove.from];
        const dest = this.buckets[nextMove.to];

        if (source.amount > 0 && dest.amount < dest.capacity) {
          const isLeft = source.x < dest.x;
          source.pourDirection = isLeft ? 1 : -1;
          
          const offset = dest.width * 0.55;
          source.startX = dest.x + (isLeft ? -offset : offset);
          source.startY = dest.y - dest.height * 0.75;
          
          source.isPouring = true;
          source.pourTargetId = dest.id;
          source.targetAngle = isLeft ? 1.3 : -1.3;

          // Sound triggers
          this.soundSynth.startPour();

          // Water sloshing nodes
          const sourceNodes = this.waterSim.getNodes(source.id);
          sourceNodes.forEach(n => n.velocity += (Math.random() * 2 - 1) * 2.5);
        }
      }
    }

    const state = this.stateManager.getGameState();

    // 1. Update Physics (Positions, inertia dragging, table drop bounces)
    this.physics.update(this.buckets, dt, this.originalSlots);

    // 2. Update Water sloshing, pouring transfers, splashes and ripples
    this.waterSim.update(
      this.buckets,
      this.waterParticles,
      this.ambientParticles,
      dt,
      // On Pour step callback: update synth frequency
      (_fromId, toId, transferStep) => {
        const dest = this.buckets[toId];
        this.soundSynth.updatePour(transferStep, dest.amount / dest.capacity);
        
        // Trigger minor slosh wobble inside target bucket from impact force
        this.waterSim.triggerSlosh(toId, (Math.random() * 2 - 1) * 0.8);
      },
      // On Pour completion: sync state amounts & clean audio
      (fromId, toId) => {
        this.soundSynth.stopPour();
        this.soundSynth.playChime();

        // Calculate and commit final amounts into state history
        const finalAmounts = [...state.amounts];
        const dest = this.buckets[toId];
        
        // Re-calculate math snapshot to match physics outcomes
        const transfer = Math.min(state.amounts[fromId], dest.capacity - state.amounts[toId]);
        finalAmounts[fromId] -= transfer;
        finalAmounts[toId] += transfer;

        this.stateManager.setAmounts(finalAmounts, true);

        // Check if just won, trigger success effects
        const newState = this.stateManager.getGameState();
        if (newState.isWon) {
          this.soundSynth.playSuccess();
          this.renderer.triggerWinConfetti();
        }

        // Set delay timer to let previous bucket return upright before next pour
        this.autoSolveDelayTimer = 1.3;
      },
      state.settings.reduceMotion
    );

    // 3. Keep static values smoothly interpolating back on state changes
    this.buckets.forEach(b => {
      if (!b.isPouring) {
        // Levels interpolation (e.g. following undo/redo transitions)
        if (b.amount !== b.targetAmount) {
          const speed = state.settings.reduceMotion ? 20.0 : 5.0;
          b.amount += (b.targetAmount - b.amount) * speed * dt;
          if (Math.abs(b.amount - b.targetAmount) < 0.005) {
            b.amount = b.targetAmount;
          }
        }
      }
    });

    // 4. Render Frame
    this.renderer.draw(
      state,
      this.buckets,
      this.waterParticles,
      this.ambientParticles,
      this.hoveredButtonId,
      this.activeHintText
    );

    requestAnimationFrame(this.loop);
  };

  public destroy() {
    this.isRunning = false;
    this.stateManager.destroy();
    this.soundSynth.destroy();
    window.removeEventListener('resize', this.handleResize);
    
    // Clean event listeners
    this.canvas.removeEventListener('touchstart', this.handlePointerDown);
    this.canvas.removeEventListener('touchmove', this.handlePointerMove);
    this.canvas.removeEventListener('touchend', this.handlePointerUp);
    this.canvas.removeEventListener('mousedown', this.handlePointerDown);
    this.canvas.removeEventListener('mousemove', this.handlePointerMove);
    window.removeEventListener('mouseup', this.handlePointerUp);
  }
}
