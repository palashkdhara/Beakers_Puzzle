import type { BucketState, WaterParticle, AmbientParticle, GameState } from './Types';
import { WaterSim } from './WaterSim';
import { Solver } from './Solver';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private waterSim: WaterSim;
  private confetti: { x: number; y: number; vx: number; vy: number; color: string; r: number; size: number }[] = [];

  constructor(canvas: HTMLCanvasElement, waterSim: WaterSim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.waterSim = waterSim;
  }

  /**
   * Resizes the canvas to match display size, adjusting for High-DPI screens.
   */
  public resize(width: number, height: number): { scale: number } {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
    return { scale: dpr };
  }

  /**
   * Main render method
   */
  public draw(
    state: GameState,
    buckets: BucketState[],
    waterParticles: WaterParticle[],
    ambientParticles: AmbientParticle[],
    hoveredButtonId: string | null,
    hintText: string | null
  ) {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    this.ctx.clearRect(0, 0, w, h);

    // 1. Draw background gradient and ambient particles
    this.drawBackground(w, h, state.settings.highContrast);
    this.drawAmbientParticles(ambientParticles);

    // 2. Draw Table
    const tableY = h * 0.72;
    this.drawTable(w, h, tableY, state.settings.highContrast);

    // 3. Draw Bucket Shadows on Table (drawn first so they sit under the buckets)
    this.drawBucketShadows(buckets, tableY);

    // 4. Draw Buckets & Water
    this.drawBuckets(buckets, state.settings.highContrast);

    // 5. Draw Water Stream and Splash Particles
    this.drawWaterParticles(waterParticles);

    // 6. Draw UI HUD
    this.drawHUD(state, hoveredButtonId, hintText, w, h);

    // 7. Victory Screen Overlay
    if (state.isWon) {
      this.drawVictoryOverlay(state, hoveredButtonId, w, h);
    }
  }

  private drawBackground(w: number, h: number, highContrast: boolean) {
    const grad = this.ctx.createLinearGradient(0, 0, 0, h);
    if (highContrast) {
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(1, '#E6E1D5');
    } else {
      grad.addColorStop(0, '#F7F4ED'); // Warm linen white
      grad.addColorStop(1, '#ECE7DC'); // Soft warm gray-sand
    }
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, w, h);
  }

  private drawAmbientParticles(particles: AmbientParticle[]) {
    this.ctx.save();
    particles.forEach(p => {
      this.ctx.fillStyle = `rgba(213, 196, 161, ${p.opacity})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  private drawTable(w: number, h: number, tableY: number, highContrast: boolean) {
    this.ctx.save();

    // Subtle table perspective shadow
    this.ctx.fillStyle = 'rgba(40, 36, 32, 0.05)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, tableY);
    this.ctx.lineTo(w, tableY);
    this.ctx.lineTo(w, tableY + 25);
    this.ctx.lineTo(0, tableY + 25);
    this.ctx.fill();

    // Table body
    const tableGrad = this.ctx.createLinearGradient(0, tableY, 0, h);
    if (highContrast) {
      tableGrad.addColorStop(0, '#D1C2A3');
      tableGrad.addColorStop(1, '#8C7E62');
    } else {
      tableGrad.addColorStop(0, '#EAE4D8'); // Very soft light wooden table
      tableGrad.addColorStop(1, '#D8CFBE');
    }

    this.ctx.fillStyle = tableGrad;
    this.ctx.beginPath();
    this.ctx.moveTo(0, tableY);
    this.ctx.lineTo(w, tableY);
    this.ctx.lineTo(w, h);
    this.ctx.lineTo(0, h);
    this.ctx.fill();

    // Minimal table top border
    this.ctx.strokeStyle = highContrast ? '#8C7E62' : 'rgba(213, 196, 161, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, tableY);
    this.ctx.lineTo(w, tableY);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawBucketShadows(buckets: BucketState[], tableY: number) {
    this.ctx.save();
    buckets.forEach(b => {
      // Height from resting position
      const hoverHeight = Math.max(0, tableY - (b.y + b.height / 2));
      const liftScale = 1.0 + hoverHeight * 0.003;
      
      // Shadow size decreases and blurs more as it lifts
      const shadowW = b.width * 0.8 * liftScale;
      const shadowH = 14 / liftScale;
      const shadowOpacity = Math.max(0.02, 0.15 - hoverHeight * 0.0008);

      const shadowX = b.x;
      const shadowY = tableY + 5 + hoverHeight * 0.1; // slide shadow back slightly as lifted

      const shadowGrad = this.ctx.createRadialGradient(
        shadowX, shadowY, 0,
        shadowX, shadowY, shadowW / 2
      );
      shadowGrad.addColorStop(0, `rgba(40, 36, 32, ${shadowOpacity})`);
      shadowGrad.addColorStop(0.5, `rgba(40, 36, 32, ${shadowOpacity * 0.5})`);
      shadowGrad.addColorStop(1, 'rgba(40, 36, 32, 0)');

      this.ctx.fillStyle = shadowGrad;
      this.ctx.beginPath();
      this.ctx.ellipse(shadowX, shadowY, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  private drawBuckets(buckets: BucketState[], highContrast: boolean) {
    buckets.forEach(b => {
      this.ctx.save();
      this.ctx.translate(b.x, b.y);
      this.ctx.rotate(b.angle);
      
      // Apply elastic scale (squash/stretch bounce)
      this.ctx.scale(b.scaleX, b.scaleY);

      // 1. Draw Handle (REMOVED)
      // this.drawBucketHandle(b, highContrast);

      // 2. Draw Back Rim / Inside Background
      this.drawBucketInterior(b, highContrast);

      // 3. Draw Water Volume inside Bucket
      this.drawWaterInside(b, highContrast);

      // 4. Draw Front Walls / Glassmorphism Glass Body
      this.drawBucketBody(b, highContrast);

      // 5. Draw Measurement Lines and Text Labels
      this.drawBucketMarkingsAndText(b, highContrast);

      this.ctx.restore();
    });
  }

  private drawBucketInterior(b: BucketState, highContrast: boolean) {
    const halfW = b.width / 2;
    const halfH = b.height / 2;
    const r = 16; // bottom corner rounding radius

    // Back interior gradient
    this.ctx.fillStyle = highContrast ? '#E8E4D9' : 'rgba(230, 225, 215, 0.7)';
    this.ctx.beginPath();
    this.ctx.moveTo(-halfW, -halfH);
    this.ctx.lineTo(halfW, -halfH);
    this.ctx.lineTo(halfW, halfH - r);
    this.ctx.arcTo(halfW, halfH, halfW - r, halfH, r);
    this.ctx.lineTo(-halfW + r, halfH);
    this.ctx.arcTo(-halfW, halfH, -halfW, halfH - r, r);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawWaterInside(b: BucketState, highContrast: boolean) {
    if (b.amount <= 0.001) return;

    const halfW = b.width / 2;
    const halfH = b.height / 2;
    const r = 16;

    this.ctx.save();

    // Clip to the bucket's inner shape
    this.ctx.beginPath();
    this.ctx.moveTo(-halfW + 1, -halfH + 1);
    this.ctx.lineTo(halfW - 1, -halfH + 1);
    this.ctx.lineTo(halfW - 1, halfH - r);
    this.ctx.arcTo(halfW - 1, halfH - 1, halfW - r, halfH - 1, r);
    this.ctx.lineTo(-halfW + r, halfH - 1);
    this.ctx.arcTo(-halfW + 1, halfH - 1, -halfW + 1, halfH - r, r);
    this.ctx.closePath();
    this.ctx.clip();

    // Water level height inside bucket: y increases downwards, so water bottom is at halfH, top is at:
    const fillPercent = b.amount / b.capacity;
    const waterHeight = b.height * fillPercent;
    const waterBaseY = halfH - waterHeight;

    // Get sloshing wave nodes
    const nodes = this.waterSim.getNodes(b.id);
    const nodeCount = nodes.length;

    // Draw the water polygon
    this.ctx.beginPath();
    
    // Bottom right corner
    this.ctx.lineTo(halfW, halfH);
    // Bottom left corner
    this.ctx.lineTo(-halfW, halfH);

    // Left wall surface point
    const startX = -halfW;
    const startY = waterBaseY + nodes[0].y;
    this.ctx.lineTo(startX, startY);

    // Dynamic wave curves across nodes
    for (let i = 1; i < nodeCount; i++) {
      const nodeX = -halfW + (b.width * i) / (nodeCount - 1);
      
      // Wobble sloshing angle tilt calculations:
      // Offset height due to overall water angle sloshing wobble
      const wobbleOffset = Math.sin(b.wobbleAngle) * (nodeX / halfW) * 12;
      const nodeY = waterBaseY + nodes[i].y + wobbleOffset;
      
      const prevX = -halfW + (b.width * (i - 1)) / (nodeCount - 1);
      const prevWobble = Math.sin(b.wobbleAngle) * (prevX / halfW) * 12;
      const prevY = waterBaseY + nodes[i - 1].y + prevWobble;

      // Draw bezier curves for smooth water ripple curves
      const cpX = (prevX + nodeX) / 2;
      this.ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + nodeY) / 2);
    }

    // Connect to right wall
    const endX = halfW;
    const endY = waterBaseY + nodes[nodeCount - 1].y + Math.sin(b.wobbleAngle) * 12;
    this.ctx.lineTo(endX, endY);
    this.ctx.closePath();

    // Paint water gradient
    const waterGrad = this.ctx.createLinearGradient(0, waterBaseY, 0, halfH);
    if (highContrast) {
      waterGrad.addColorStop(0, '#005DFF');
      waterGrad.addColorStop(1, '#002C9E');
    } else {
      waterGrad.addColorStop(0, 'rgba(79, 169, 255, 0.85)'); // Glassy light sky blue
      waterGrad.addColorStop(0.5, 'rgba(64, 150, 240, 0.85)');
      waterGrad.addColorStop(1, 'rgba(40, 110, 210, 0.9)'); // Deep ocean bottom
    }
    
    this.ctx.fillStyle = waterGrad;
    this.ctx.fill();

    // Draw high-contrast water boundary line
    this.ctx.strokeStyle = highContrast ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 2.5;
    
    // Redraw surface line to paint glowing white crest
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    for (let i = 1; i < nodeCount; i++) {
      const nodeX = -halfW + (b.width * i) / (nodeCount - 1);
      const wobbleOffset = Math.sin(b.wobbleAngle) * (nodeX / halfW) * 12;
      const nodeY = waterBaseY + nodes[i].y + wobbleOffset;
      const prevX = -halfW + (b.width * (i - 1)) / (nodeCount - 1);
      const prevWobble = Math.sin(b.wobbleAngle) * (prevX / halfW) * 12;
      const prevY = waterBaseY + nodes[i - 1].y + prevWobble;
      const cpX = (prevX + nodeX) / 2;
      this.ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + nodeY) / 2);
    }
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawBucketBody(b: BucketState, highContrast: boolean) {
    const halfW = b.width / 2;
    const halfH = b.height / 2;
    const r = 16;

    // Glass/Metallic frame drawing
    this.ctx.beginPath();
    this.ctx.moveTo(-halfW, -halfH);
    this.ctx.lineTo(halfW, -halfH);
    this.ctx.lineTo(halfW, halfH - r);
    this.ctx.arcTo(halfW, halfH, halfW - r, halfH, r);
    this.ctx.lineTo(-halfW + r, halfH);
    this.ctx.arcTo(-halfW, halfH, -halfW, halfH - r, r);
    this.ctx.closePath();

    // Body fills: Glass-morphic semi-transparency
    const bodyGrad = this.ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
    if (highContrast) {
      this.ctx.strokeStyle = '#333333';
      this.ctx.lineWidth = 4;
      this.ctx.stroke();
    } else {
      bodyGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      bodyGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
      bodyGrad.addColorStop(1, 'rgba(255, 255, 255, 0.35)');
      this.ctx.fillStyle = bodyGrad;
      this.ctx.fill();

      // Soft borders
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();

      // Outer drop highlight
      this.ctx.strokeStyle = 'rgba(120, 115, 105, 0.15)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      // Glass shine reflections
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.moveTo(-halfW + 6, -halfH + 10);
      this.ctx.lineTo(-halfW + 6, halfH - 20);
      this.ctx.stroke();
    }

    // Draw top lip rim highlight ellipse
    this.ctx.beginPath();
    this.ctx.ellipse(0, -halfH, halfW, 7, 0, 0, Math.PI * 2);
    if (highContrast) {
      this.ctx.fillStyle = '#E8E4D9';
      this.ctx.fill();
      this.ctx.strokeStyle = '#333333';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    } else {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  private drawBucketMarkingsAndText(b: BucketState, highContrast: boolean) {
    const halfW = b.width / 2;
    const halfH = b.height / 2;

    // Draw dynamic measurement markings ticks
    const tickCount = b.capacity;
    for (let i = 1; i < tickCount; i++) {
      const fillPercent = i / b.capacity;
      const tickY = halfH - (b.height * fillPercent);
      
      // Draw tick line on the left side
      this.ctx.strokeStyle = highContrast ? '#333333' : 'rgba(90, 84, 74, 0.4)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(-halfW, tickY);
      this.ctx.lineTo(-halfW + 8, tickY);
      this.ctx.stroke();
    }

    // Volumetric display capacity label (e.g., "10L")
    this.ctx.font = '700 17px Outfit';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = highContrast ? '#111111' : '#2C2720';
    
    // Draw capacity title above beaker
    this.ctx.fillText(`${b.capacity}L`, 0, -halfH - 15);
  }

  private drawWaterParticles(particles: WaterParticle[]) {
    this.ctx.save();
    particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.opacity;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  private drawHUD(state: GameState, hoveredButtonId: string | null, hintText: string | null, w: number, h: number) {
    this.ctx.save();

    // Calculate dynamic coordinates
    const padding = 20;

    // 1. TOP HEADER PANEL
    const headerW = Math.min(380, w - padding * 2);
    const headerH = 75;
    const headerX = (w - headerW) / 2;
    const headerY = padding;

    this.drawGlassCard(headerX, headerY, headerW, headerH, state.settings.highContrast);

    // Header Content
    this.ctx.fillStyle = state.settings.highContrast ? '#111111' : '#2C2720';
    this.ctx.font = '700 20px Outfit';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Measure exactly ${state.goal} Liters`, headerX + 20, headerY + 34);

    // Moves and Timer HUD Subtext
    this.ctx.font = '500 14px Outfit';
    this.ctx.fillStyle = state.settings.highContrast ? '#333333' : '#5A544A';
    
    const minutes = Math.floor(state.time / 60);
    const seconds = state.time % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    this.ctx.fillText(`Level ${state.currentLevel}/5    •    Moves: ${state.moves}    •    Time: ${timeStr}`, headerX + 20, headerY + 56);

    // 2. INTERACTIVE BUTTONS IN HEADER (Undo, Redo, Restart)
    const buttonSize = 36;
    const buttons = [
      { id: 'restart', icon: '⟳', x: headerX + headerW - 40, label: 'Restart' },
      { id: 'redo', icon: '→', x: headerX + headerW - 85, label: 'Redo', disabled: state.redoHistory.length === 0 },
      { id: 'undo', icon: '←', x: headerX + headerW - 130, label: 'Undo', disabled: state.history.length === 0 },
    ];

    buttons.forEach(btn => {
      this.drawHUDButton(btn.id, btn.icon, btn.x, headerY + headerH / 2 - buttonSize / 2, buttonSize, hoveredButtonId === btn.id, state.settings.highContrast, btn.disabled);
    });

    // 3. BOTTOM CONTROL PANEL
    const footerW = Math.min(380, w - padding * 2);
    const footerH = 50;
    const footerX = (w - footerW) / 2;
    const footerY = h - footerH - padding;

    const btnSpacing = (footerW - buttonSize - 50) / 4;
    const footBtns = [
      { id: 'mute', icon: state.settings.mute ? '🔇' : '🔊', x: footerX + 25 },
      { id: 'highContrast', icon: '◐', x: footerX + 25 + btnSpacing },
      { id: 'reduceMotion', icon: '〰', x: footerX + 25 + btnSpacing * 2 },
      { id: 'autoSolve', icon: '🤖', x: footerX + 25 + btnSpacing * 3 },
      { id: 'hint', icon: '💡', x: footerX + footerW - 25 - buttonSize },
    ];

    footBtns.forEach(btn => {
      this.drawHUDButton(
        btn.id, 
        btn.icon, 
        btn.x, 
        footerY + footerH / 2 - buttonSize / 2, 
        buttonSize, 
        hoveredButtonId === btn.id, 
        state.settings.highContrast
      );
    });

    // Label for footers
    this.ctx.fillStyle = state.settings.highContrast ? '#333333' : '#666155';
    this.ctx.font = '600 12px Outfit';
    this.ctx.textAlign = 'center';
    footBtns.forEach(btn => {
      let label = '';
      if (btn.id === 'mute') label = 'Mute';
      else if (btn.id === 'highContrast') label = 'Contrast';
      else if (btn.id === 'reduceMotion') label = 'Motion';
      else if (btn.id === 'autoSolve') label = 'Auto';
      else if (btn.id === 'hint') label = 'Hint';
      
      this.ctx.fillText(label, btn.x + buttonSize / 2, footerY + footerH - 4);
    });

    // 4. FLOATING HINT OVERLAY CARD (If Active)
    if (hintText) {
      const hintW = Math.min(420, w - padding * 2);
      const hintH = 65;
      const hintX = (w - hintW) / 2;
      const hintY = headerY + headerH + 15;

      this.drawGlassCard(hintX, hintY, hintW, hintH, state.settings.highContrast);
      
      this.ctx.fillStyle = state.settings.highContrast ? '#900000' : '#C74A2C'; // warm red highlight
      this.ctx.font = 'bold 13px Outfit';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('HINT SOLVER', w / 2, hintY + 22);

      this.ctx.fillStyle = state.settings.highContrast ? '#111111' : '#3C372F';
      this.ctx.font = '500 14px Outfit';
      this.ctx.fillText(hintText, w / 2, hintY + 45);
    }

    this.ctx.restore();
  }

  private drawHUDButton(
    _id: string,
    icon: string,
    x: number,
    y: number,
    size: number,
    isHovered: boolean,
    highContrast: boolean,
    disabled: boolean = false
  ) {
    this.ctx.save();
    
    // Background glow
    this.ctx.beginPath();
    this.ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    
    if (disabled) {
      this.ctx.fillStyle = highContrast ? '#E8E4D9' : 'rgba(230, 225, 215, 0.3)';
      this.ctx.strokeStyle = highContrast ? '#CCCCCC' : 'rgba(255, 255, 255, 0.2)';
    } else if (isHovered) {
      this.ctx.fillStyle = highContrast ? '#333333' : 'rgba(79, 169, 255, 0.15)';
      this.ctx.strokeStyle = highContrast ? '#000000' : 'rgba(79, 169, 255, 0.5)';
    } else {
      this.ctx.fillStyle = highContrast ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)';
      this.ctx.strokeStyle = highContrast ? '#888888' : 'rgba(255, 255, 255, 0.6)';
    }
    
    this.ctx.lineWidth = 1.5;
    this.ctx.fill();
    this.ctx.stroke();

    // Icon glyph
    this.ctx.fillStyle = disabled
      ? (highContrast ? '#888888' : 'rgba(90, 85, 75, 0.3)')
      : (isHovered && highContrast ? '#FFFFFF' : (highContrast ? '#111111' : '#3C372F'));
    this.ctx.font = '600 17px Outfit';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(icon, x + size / 2, y + size / 2 + 1);

    this.ctx.restore();
  }

  private drawGlassCard(x: number, y: number, w: number, h: number, highContrast: boolean) {
    this.ctx.save();
    this.ctx.beginPath();
    
    // Rounded glass card path
    const r = 16;
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.arcTo(x + w, y, x + w, y + r, r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.arcTo(x, y + h, x, y + h - r, r);
    this.ctx.lineTo(x, y + r);
    this.ctx.arcTo(x, y, x + r, y, r);
    this.ctx.closePath();

    if (highContrast) {
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 3;
    } else {
      // Glassmorphism subtle blur mock
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      this.ctx.shadowColor = 'rgba(40, 36, 32, 0.05)';
      this.ctx.shadowBlur = 15;
      this.ctx.shadowOffsetY = 4;
      this.ctx.lineWidth = 1.5;
    }

    this.ctx.fill();
    this.ctx.shadowColor = 'transparent'; // Reset shadows
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawVictoryOverlay(state: GameState, hoveredButtonId: string | null, w: number, h: number) {
    this.ctx.save();

    // 1. Semi-transparent backdrop blur
    this.ctx.fillStyle = state.settings.highContrast ? 'rgba(255, 255, 255, 0.95)' : 'rgba(247, 244, 237, 0.8)';
    this.ctx.fillRect(0, 0, w, h);

    // 2. Victory Modal Card
    const cardW = Math.min(360, w - 40);
    const cardH = 340;
    const cardX = (w - cardW) / 2;
    const cardY = (h - cardH) / 2;

    this.drawGlassCard(cardX, cardY, cardW, cardH, state.settings.highContrast);

    const isGameFinished = state.currentLevel === 5;

    // Title Header
    this.ctx.fillStyle = state.settings.highContrast ? '#008C1A' : '#1D6F2C'; // Warm victory forest green
    this.ctx.font = '700 28px Outfit';
    this.ctx.textAlign = 'center';
    
    const titleText = isGameFinished ? 'Grand Master!' : 'Puzzle Solved!';
    this.ctx.fillText(titleText, w / 2, cardY + 50);

    this.ctx.fillStyle = state.settings.highContrast ? '#333333' : '#5A544A';
    this.ctx.font = '500 15px Outfit';
    
    const subtitleText = isGameFinished 
      ? "You finished all 5 Beaker Puzzles!"
      : `You measured exactly ${state.goal} liters.`;
    this.ctx.fillText(subtitleText, w / 2, cardY + 80);

    // 3. Dynamic Stars Rating Calculations using local Solver
    const capacities = state.capacities;
    const initial = new Array(capacities.length).fill(0);
    initial[0] = capacities[0];
    
    const solver = new Solver(capacities);
    const solution = solver.solve(initial, state.goal);
    const optimalMoves = solution ? solution.length : 7;

    let stars = 1;
    if (state.moves <= optimalMoves) stars = 3;
    else if (state.moves <= optimalMoves + 3) stars = 2;

    this.drawStars(w / 2, cardY + 130, stars, state.settings.highContrast);

    // 4. Statistics Block
    this.ctx.fillStyle = state.settings.highContrast ? '#111111' : '#2C2720';
    this.ctx.font = '600 16px Outfit';
    this.ctx.fillText(`Moves Count: ${state.moves}`, w / 2, cardY + 185);

    const minutes = Math.floor(state.time / 60);
    const seconds = state.time % 60;
    const timeStr = `${minutes}m ${seconds}s`;
    this.ctx.fillText(`Completion Time: ${timeStr}`, w / 2, cardY + 210);

    // Optimal comparison helper
    this.ctx.font = 'italic 12.5px Outfit';
    this.ctx.fillStyle = state.settings.highContrast ? '#555555' : '#777265';
    this.ctx.fillText(`(Optimal solution requires ${optimalMoves} moves)`, w / 2, cardY + 235);

    // 5. Next Level / Play Again Interactive Button
    const playAgainW = 160;
    const playAgainH = 46;
    const playAgainX = (w - playAgainW) / 2;
    const playAgainY = cardY + cardH - 75;
    const isHovered = hoveredButtonId === 'playAgain';

    this.ctx.beginPath();
    const r = 23; // fully pill-shaped
    this.ctx.moveTo(playAgainX + r, playAgainY);
    this.ctx.lineTo(playAgainX + playAgainW - r, playAgainY);
    this.ctx.arcTo(playAgainX + playAgainW, playAgainY, playAgainX + playAgainW, playAgainY + r, r);
    this.ctx.lineTo(playAgainX + playAgainW, playAgainY + playAgainH - r);
    this.ctx.arcTo(playAgainX + playAgainW, playAgainY + playAgainH, playAgainX + playAgainW - r, playAgainY + playAgainH, r);
    this.ctx.lineTo(playAgainX + r, playAgainY + playAgainH);
    this.ctx.arcTo(playAgainX, playAgainY + playAgainH, playAgainX, playAgainY + playAgainH - r, r);
    this.ctx.lineTo(playAgainX, playAgainY + r);
    this.ctx.arcTo(playAgainX, playAgainY, playAgainX + r, playAgainY, r);
    this.ctx.closePath();

    if (state.settings.highContrast) {
      this.ctx.fillStyle = isHovered ? '#111111' : '#FFFFFF';
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 2.5;
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = isHovered ? '#FFFFFF' : '#111111';
    } else {
      this.ctx.fillStyle = isHovered ? '#4FA9FF' : '#3C372F'; // Blue highlight on hover, else charcoal
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowOffsetY = 3;
      this.ctx.fill();
      this.ctx.shadowColor = 'transparent';
      this.ctx.fillStyle = '#FFFFFF';
    }

    this.ctx.font = 'bold 15px Outfit';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    const btnText = state.currentLevel < 5 ? 'NEXT LEVEL' : 'REPLAY GAME';
    this.ctx.fillText(btnText, w / 2, playAgainY + playAgainH / 2);

    // 6. Draw Satisfying Confetti
    this.updateConfetti(w, h, state.settings.reduceMotion);
    this.drawConfetti();

    this.ctx.restore();
  }

  private drawStars(cx: number, cy: number, rating: number, highContrast: boolean) {
    const starSpacing = 40;
    const starCount = 3;
    
    for (let i = 0; i < starCount; i++) {
      const x = cx + (i - 1) * starSpacing;
      const isFilled = i < rating;
      
      this.drawSingleStar(x, cy, isFilled, highContrast);
    }
  }

  private drawSingleStar(x: number, y: number, filled: boolean, highContrast: boolean) {
    this.ctx.save();
    
    const spikes = 5;
    const outerRadius = 14;
    const innerRadius = 6;
    
    let rot = Math.PI / 2 * 3;
    let cx = x;
    let cy = y;
    let step = Math.PI / spikes;

    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - outerRadius);
    
    for (let i = 0; i < spikes; i++) {
      cx = x + Math.cos(rot) * outerRadius;
      cy = y + Math.sin(rot) * outerRadius;
      this.ctx.lineTo(cx, cy);
      rot += step;

      cx = x + Math.cos(rot) * innerRadius;
      cy = y + Math.sin(rot) * innerRadius;
      this.ctx.lineTo(cx, cy);
      rot += step;
    }
    
    this.ctx.lineTo(x, y - outerRadius);
    this.ctx.closePath();

    if (filled) {
      this.ctx.fillStyle = highContrast ? '#000000' : '#FFD214'; // Gold star
      this.ctx.fill();
      this.ctx.strokeStyle = highContrast ? '#000000' : '#E6B800';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    } else {
      this.ctx.fillStyle = highContrast ? '#E8E4D9' : 'rgba(230, 225, 215, 0.5)';
      this.ctx.fill();
      this.ctx.strokeStyle = highContrast ? '#CCCCCC' : 'rgba(90, 85, 75, 0.2)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }

  private initConfetti(w: number, _h: number) {
    if (this.confetti.length > 0) return;
    const colors = ['#4FA9FF', '#FF85A2', '#FFD214', '#5CD3A5', '#A78BFA'];
    for (let i = 0; i < 90; i++) {
      this.confetti.push({
        x: Math.random() * w,
        y: -10 - Math.random() * 80,
        vx: (Math.random() * 4 - 2) * 60,
        vy: (120 + Math.random() * 150),
        color: colors[Math.floor(Math.random() * colors.length)],
        r: Math.random() * Math.PI,
        size: 5 + Math.random() * 6
      });
    }
  }

  private updateConfetti(w: number, h: number, reduceMotion: boolean) {
    if (reduceMotion) {
      this.confetti = [];
      return;
    }
    
    if (this.confetti.length === 0) {
      this.initConfetti(w, h);
    }

    const dt = 1 / 60;
    this.confetti.forEach(c => {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.r += c.vx * 0.05 * dt;

      // Wrap around or cap y
      if (c.y > h + 10) {
        c.y = -10;
        c.x = Math.random() * w;
        c.vy = 120 + Math.random() * 150;
      }
    });
  }

  private drawConfetti() {
    this.ctx.save();
    this.confetti.forEach(c => {
      this.ctx.fillStyle = c.color;
      this.ctx.save();
      this.ctx.translate(c.x, c.y);
      this.ctx.rotate(c.r);
      // Draw rectangular paper confetti pieces
      this.ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      this.ctx.restore();
    });
    this.ctx.restore();
  }

  public triggerWinConfetti() {
    this.confetti = [];
  }
}
