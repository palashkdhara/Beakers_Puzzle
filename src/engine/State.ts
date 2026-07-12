import type { GameState, GameSettings } from './Types';

const DEFAULT_SETTINGS: GameSettings = {
  mute: false,
  reduceMotion: false,
  highContrast: false,
};

const STORAGE_KEY = 'dharas_beaker_challenge_state';

export class StateManager {
  private state: GameState;
  private timerInterval: any = null;
  private onStateChangeCallbacks: (() => void)[] = [];

  constructor() {
    this.state = this.loadState() || this.createInitialState();
    this.startTimer();
  }

  private createInitialState(): GameState {
    return {
      amounts: [10, 0, 0],
      capacities: [10, 4, 3],
      goal: 5,
      currentLevel: 1,
      moves: 0,
      time: 0,
      isWon: false,
      history: [],
      redoHistory: [],
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  public subscribe(callback: () => void) {
    this.onStateChangeCallbacks.push(callback);
    callback(); // Initial trigger
  }

  private notify() {
    this.onStateChangeCallbacks.forEach(cb => cb());
  }

  public getGameState(): GameState {
    return this.state;
  }

  public setAmounts(newAmounts: number[], recordMove: boolean = true) {
    if (this.state.isWon) return;

    if (recordMove) {
      this.state.history.push([...this.state.amounts]);
      this.state.redoHistory = []; // Clear redo stack
      this.state.moves += 1;
    }

    this.state.amounts = [...newAmounts];
    this.checkWinCondition();
    this.saveState();
    this.notify();
  }

  public undo(): boolean {
    if (this.state.history.length === 0 || this.state.isWon) return false;

    const previousAmounts = this.state.history.pop()!;
    this.state.redoHistory.push([...this.state.amounts]);
    this.state.amounts = previousAmounts;
    this.state.moves = Math.max(0, this.state.moves - 1); // standard back-track decrease
    
    this.checkWinCondition();
    this.saveState();
    this.notify();
    return true;
  }

  public redo(): boolean {
    if (this.state.redoHistory.length === 0 || this.state.isWon) return false;

    const nextAmounts = this.state.redoHistory.pop()!;
    this.state.history.push([...this.state.amounts]);
    this.state.amounts = nextAmounts;
    this.state.moves += 1;

    this.checkWinCondition();
    this.saveState();
    this.notify();
    return true;
  }

  public resetPuzzle() {
    this.state.history = [];
    this.state.redoHistory = [];
    
    // Reset amounts to starting configuration for current capacities (first full, others empty)
    this.state.amounts = new Array(this.state.capacities.length).fill(0);
    this.state.amounts[0] = this.state.capacities[0];
    
    this.state.moves = 0;
    this.state.time = 0;
    this.state.isWon = false;

    this.startTimer();
    this.saveState();
    this.notify();
  }

  public restartEntireGame() {
    this.state.currentLevel = 1;
    this.state.capacities = [10, 4, 3];
    this.state.goal = 5;
    this.resetPuzzle();
  }

  public startNextLevel(newCapacities: number[], newGoal: number) {
    if (this.state.currentLevel >= 5) {
      this.restartEntireGame();
      return;
    }

    this.state.currentLevel += 1;
    this.state.capacities = [...newCapacities];
    this.state.goal = newGoal;
    
    // Reset amounts
    this.state.amounts = new Array(newCapacities.length).fill(0);
    this.state.amounts[0] = newCapacities[0];
    
    this.state.moves = 0;
    this.state.time = 0;
    this.state.isWon = false;
    this.state.history = [];
    this.state.redoHistory = [];

    this.startTimer();
    this.saveState();
    this.notify();
  }

  private checkWinCondition() {
    const hasGoalAmount = this.state.amounts.some(amount => amount === this.state.goal);
    if (hasGoalAmount && !this.state.isWon) {
      this.state.isWon = true;
      this.stopTimer();
    }
  }

  public toggleMute() {
    this.state.settings.mute = !this.state.settings.mute;
    this.saveState();
    this.notify();
  }

  public toggleReduceMotion() {
    this.state.settings.reduceMotion = !this.state.settings.reduceMotion;
    this.saveState();
    this.notify();
  }

  public toggleHighContrast() {
    this.state.settings.highContrast = !this.state.settings.highContrast;
    this.saveState();
    this.notify();
  }

  private startTimer() {
    this.stopTimer(); // Ensure no duplicates
    this.timerInterval = setInterval(() => {
      if (!this.state.isWon) {
        this.state.time += 1;
        this.notify();
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        amounts: this.state.amounts,
        capacities: this.state.capacities,
        goal: this.state.goal,
        currentLevel: this.state.currentLevel,
        moves: this.state.moves,
        time: this.state.time,
        isWon: this.state.isWon,
        history: this.state.history,
        redoHistory: this.state.redoHistory,
        settings: this.state.settings
      }));
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }

  private loadState(): GameState | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Ensure all fields exist
      if (
        parsed.amounts && 
        Array.isArray(parsed.amounts) && 
        typeof parsed.moves === 'number' && 
        typeof parsed.time === 'number' && 
        typeof parsed.isWon === 'boolean'
      ) {
        return {
          amounts: parsed.amounts,
          capacities: parsed.capacities || [10, 4, 3],
          goal: typeof parsed.goal === 'number' ? parsed.goal : 5,
          currentLevel: typeof parsed.currentLevel === 'number' ? parsed.currentLevel : 1,
          moves: parsed.moves,
          time: parsed.time,
          isWon: parsed.isWon,
          history: parsed.history || [],
          redoHistory: parsed.redoHistory || [],
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        };
      }
    } catch (e) {
      console.error('Failed to parse stored state:', e);
    }
    return null;
  }

  public destroy() {
    this.stopTimer();
    this.onStateChangeCallbacks = [];
  }
}
