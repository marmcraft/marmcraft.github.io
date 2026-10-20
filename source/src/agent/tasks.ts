/**
 * The task suite: what an episode starts with and what counts as done. Each task is a goal over the final
 * environment state (what the agent holds, what it built, whether it's alive at a time), with milestones along the
 * way (Minecraft's tech tree), so a failed run still shows how far it got.
 *
 * Milestones are checked against what the agent has *ever* had in the episode (`ever`), the goal against the final
 * state (`now`): an end-state objective, as the assignment asks, with progress read off the trajectory.
 */

export interface Holdings {
  /** Item counts carried now (inventory and armour), plus blocks the agent placed that still stand. */
  now: Record<string, number>;
  /** The most of each item the agent has had at once during the episode (placed blocks included). */
  ever: Record<string, number>;
}

export interface GradeState {
  holdings: Holdings;
  alive: boolean;
  deaths: number;
  /** Time of day now (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset) and days passed. */
  time: number;
  day: number;
}

export interface Milestone {
  id: string;
  label: string;
  done(s: GradeState): boolean;
}

export interface Task {
  id: string;
  /** What the agent is told: a player's request, as they'd put it. */
  goal: string;
  /** What it starts with (item → count) and when (time of day). */
  start: { items?: Record<string, number>; time?: number };
  milestones: Milestone[];
  success(s: GradeState): boolean;
  /** How many actions it may take (the step budget) and simulated seconds (a cap on waiting). */
  budget: { steps: number; seconds: number };
}

/** Any of these (a log of any wood, planks of any wood). */
const LOGS = ['oak_log', 'birch_log', 'spruce_log'];
const PLANKS = ['oak_planks', 'birch_planks', 'spruce_planks'];
const sum = (h: Record<string, number>, ids: string[]) => ids.reduce((n, id) => n + (h[id] ?? 0), 0);
const ever = (ids: string[], n = 1, label?: string): Milestone => ({
  id: `have_${ids[0]}${n > 1 ? `_${n}` : ''}`,
  label: label ?? `${n} ${ids[0].replace(/^oak_/, '').replace(/_/g, ' ')}`,
  done: (s) => sum(s.holdings.ever, ids) >= n,
});

/** Minecraft's first steps, as milestones: wood, planks, a table, sticks, a wooden pickaxe, stone, a stone pickaxe. */
const TREE = {
  log: ever(LOGS, 1, 'a log'),
  planks: ever(PLANKS, 1, 'planks'),
  table: ever(['crafting_table'], 1, 'a crafting table'),
  sticks: ever(['stick'], 1, 'sticks'),
  wooden: ever(['wooden_pickaxe'], 1, 'a wooden pickaxe'),
  cobble: ever(['cobblestone'], 1, 'cobblestone'),
  stone: ever(['stone_pickaxe'], 1, 'a stone pickaxe'),
};

export const TASKS: Task[] = [
  {
    id: 'collect_logs',
    goal: 'Collect 4 logs from the trees nearby and keep them in your inventory.',
    start: {},
    milestones: [ever(LOGS, 1, '1 log'), ever(LOGS, 2, '2 logs'), ever(LOGS, 3, '3 logs'), ever(LOGS, 4, '4 logs')],
    success: (s) => sum(s.holdings.now, LOGS) >= 4,
    budget: { steps: 25, seconds: 300 },
  },
  {
    id: 'crafting_table',
    goal: 'I need a crafting table. Make one (you start with nothing).',
    start: {},
    milestones: [TREE.log, TREE.planks, TREE.table],
    success: (s) => (s.holdings.now.crafting_table ?? 0) >= 1,
    budget: { steps: 25, seconds: 300 },
  },
  {
    id: 'wooden_pickaxe',
    goal: 'Get me a wooden pickaxe, starting from nothing.',
    start: {},
    milestones: [TREE.log, TREE.planks, TREE.table, TREE.sticks, TREE.wooden],
    success: (s) => (s.holdings.now.wooden_pickaxe ?? 0) >= 1,
    budget: { steps: 35, seconds: 450 },
  },
  {
    id: 'stone_pickaxe',
    goal: 'I want a stone pickaxe. Start from nothing: you will need wood first, then stone.',
    start: {},
    milestones: [TREE.log, TREE.planks, TREE.table, TREE.sticks, TREE.wooden, TREE.cobble, TREE.stone],
    success: (s) => (s.holdings.now.stone_pickaxe ?? 0) >= 1,
    budget: { steps: 60, seconds: 600 },
  },
  {
    id: 'smelt_iron',
    goal: 'Smelt my 3 raw iron into 3 iron ingots. You have a furnace and some coal.',
    start: { items: { furnace: 1, coal: 2, raw_iron: 3 } },
    milestones: [ever(['furnace'], 1, 'a furnace placed or held'), ever(['iron_ingot'], 1, '1 iron ingot'), ever(['iron_ingot'], 3, '3 iron ingots')],
    success: (s) => (s.holdings.now.iron_ingot ?? 0) >= 3,
    budget: { steps: 20, seconds: 240 },
  },
  {
    id: 'survive_night',
    goal: 'The sun is setting. Survive until morning without dying. You have a wooden sword and some dirt to build with.',
    start: { items: { wooden_sword: 1, dirt: 32, oak_planks: 16 }, time: 0.74 },
    milestones: [
      { id: 'midnight', label: 'alive at midnight', done: (s) => s.deaths === 0 && (s.day > 0 || s.time < 0.5) },
      { id: 'dawn', label: 'alive at dawn', done: (s) => s.deaths === 0 && s.day > 0 && s.time >= 0.24 && s.time < 0.5 },
    ],
    success: (s) => s.deaths === 0 && s.alive && s.day > 0 && s.time >= 0.24 && s.time < 0.5,
    budget: { steps: 30, seconds: 700 },
  },
];

export const taskById = (id: string) => TASKS.find((t) => t.id === id);

/** How far along: the share of milestones reached (1 when the goal's met). */
export function grade(task: Task, s: GradeState) {
  const milestones = task.milestones.map((m) => ({ id: m.id, label: m.label, done: m.done(s) }));
  const success = task.success(s);
  const reached = milestones.filter((m) => m.done).length;
  return { success, progress: success ? 1 : reached / milestones.length, milestones };
}
