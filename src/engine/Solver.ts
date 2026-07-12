export interface SolverMove {
  from: number;
  to: number;
  description: string;
}

export class Solver {
  private capacities: number[];

  constructor(capacities: number[] = [10, 4, 3]) {
    this.capacities = capacities;
  }

  /**
   * Performs BFS to find the shortest sequence of pours to reach the target amount.
   * By default, searches for any bucket having exactly `targetAmount` (5L).
   */
  public solve(startAmounts: number[], targetAmount: number = 5): SolverMove[] | null {
    const queue: { state: number[]; path: SolverMove[] }[] = [];
    const visited = new Set<string>();

    const stateKey = (state: number[]) => state.join(',');

    queue.push({ state: [...startAmounts], path: [] });
    visited.add(stateKey(startAmounts));

    while (queue.length > 0) {
      const { state, path } = queue.shift()!;

      // Check if target is met in any bucket
      if (state.some(val => val === targetAmount)) {
        return path;
      }

      // Generate all possible transitions
      for (let i = 0; i < this.capacities.length; i++) {
        for (let j = 0; j < this.capacities.length; j++) {
          if (i === j) continue;

          // Pour from i to j
          const sourceAmount = state[i];
          const destSpace = this.capacities[j] - state[j];
          const amountToPour = Math.min(sourceAmount, destSpace);

          if (amountToPour > 0) {
            const nextState = [...state];
            nextState[i] -= amountToPour;
            nextState[j] += amountToPour;

            const key = stateKey(nextState);
            if (!visited.has(key)) {
              visited.add(key);
              const moveDescription = `Pour Bucket ${String.fromCharCode(65 + i)} (${this.capacities[i]}L) into Bucket ${String.fromCharCode(65 + j)} (${this.capacities[j]}L)`;
              const newMove: SolverMove = {
                from: i,
                to: j,
                description: moveDescription,
              };
              queue.push({
                state: nextState,
                path: [...path, newMove],
              });
            }
          }
        }
      }
    }

    return null; // Unsolvable
  }

  /**
   * Generates a 3-level hint sequence based on the current state.
   */
  public getHint(currentAmounts: number[], hintStage: number, targetAmount: number = 5): string {
    const solution = this.solve(currentAmounts, targetAmount);
    
    if (!solution || solution.length === 0) {
      return "The current state cannot be solved directly. Try resetting or undoing a few steps!";
    }

    const nextMove = solution[0];
    
    // Custom names for buckets based on capacity
    const bucketName = (index: number) => {
      return `${this.capacities[index]}L Bucket`;
    };

    switch (hintStage) {
      case 1:
        // Conceptual hint: suggest which bucket to focus on
        return `Hint 1/3: Consider starting the sequence by using the ${bucketName(nextMove.from)} to fill or adjust another bucket.`;
      case 2:
        // Strategic hint: identify the source and target without giving exact instructions
        return `Hint 2/3: Try pouring water from the ${bucketName(nextMove.from)} into the ${bucketName(nextMove.to)}.`;
      case 3:
      default:
        // Visual/Direct hint: show the exact move
        return `Hint 3/3: Drag the ${bucketName(nextMove.from)} over the ${bucketName(nextMove.to)} and release to pour.`;
    }
  }

  /**
   * Generates a solvable, distinct beaker puzzle based on level
   */
  public static generatePuzzle(level: number): { capacities: number[]; goal: number } {
    if (level === 1) {
      return { capacities: [10, 4, 3], goal: 5 };
    }

    const numBeakers = level <= 2 ? 3 : (level <= 4 ? 4 : 5);
    const minMoves = 3 + level;
    const maxMoves = 6 + level;
    
    // Choose a max capacity range depending on level
    const maxCapMin = 8 + level;
    const maxCapMax = 12 + level;

    for (let attempt = 0; attempt < 300; attempt++) {
      // 1. Generate largest capacity (starts full)
      const capA = Math.floor(maxCapMin + Math.random() * (maxCapMax - maxCapMin + 1));
      
      // 2. Generate other beaker capacities (must be smaller than capA, distinct)
      const otherCaps: number[] = [];
      const used = new Set<number>();
      used.add(capA);

      while (otherCaps.length < numBeakers - 1) {
        // Pick capacity between 2 and capA - 1
        const cap = Math.floor(2 + Math.random() * (capA - 2));
        if (!used.has(cap) && cap > 1) {
          used.add(cap);
          otherCaps.push(cap);
        }
      }

      // Sort capacities descending
      const capacities = [capA, ...otherCaps].sort((x, y) => y - x);
      const solver = new Solver(capacities);

      // 3. Choose a goal amount (must be smaller than capA, not equal to any capacity)
      const goalCandidates: number[] = [];
      for (let g = 2; g < capA; g++) {
        if (!capacities.includes(g)) {
          goalCandidates.push(g);
        }
      }

      if (goalCandidates.length === 0) continue;
      const goal = goalCandidates[Math.floor(Math.random() * goalCandidates.length)];

      // 4. Run BFS solver. The starting amount is [capA, 0, 0, ...]
      const startAmounts = new Array(numBeakers).fill(0);
      startAmounts[0] = capA;

      const path = solver.solve(startAmounts, goal);
      if (path && path.length >= minMoves && path.length <= maxMoves) {
        // Found a good solvable puzzle!
        return { capacities, goal };
      }
    }

    // Fallbacks
    if (level === 2) return { capacities: [9, 5, 4], goal: 6 };
    if (level === 3) return { capacities: [12, 7, 5, 3], goal: 6 };
    if (level === 4) return { capacities: [14, 9, 6, 4], goal: 7 };
    return { capacities: [16, 11, 7, 4, 3], goal: 8 };
  }
}
