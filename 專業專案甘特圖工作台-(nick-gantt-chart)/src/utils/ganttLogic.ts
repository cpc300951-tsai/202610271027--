/**
 * Gantt core pure logic and calculation utilities
 * Uses strict UTC date calculation to avoid cross-timezone +/- 1 day drift.
 */

export interface Task {
  id: string;
  name: string;
  level: number; // 0, 1, 2, ...
  collapsed?: boolean;
  plannedStart: string; // YYYY-MM-DD
  plannedEnd: string;   // YYYY-MM-DD
  actualStart?: string; // YYYY-MM-DD
  actualEnd?: string;   // YYYY-MM-DD
  progress: number;     // 0 - 100
  notes?: string;
  assignee?: string;
}

export interface ComputedTask extends Task {
  wbs: string;
  isParent: boolean;
  childIds: string[];
  leafChildIds: string[];
  plannedWorkingDays: number;
  plannedCalendarDays: number;
  actualWorkingDays?: number;
  actualCalendarDays?: number;
  isReadOnly: boolean;
  visible: boolean; // false if any ancestor is collapsed
}

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  name: string;
  isMakeup?: boolean; // true = 補班日 (work day on weekend), false = 國定假日 (day off)
}

export interface GanttProjectState {
  version: string;
  projectName: string;
  projectDescription: string;
  tasks: Task[];
  holidays: HolidayEntry[];
  lastModified: string;
}

/**
 * Parse YYYY-MM-DD to UTC timestamp (midnight)
 */
export function parseDateUTC(dateStr: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const parts = dateStr.trim().split('-');
  if (parts.length < 3) return 0;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
  return Date.UTC(y, m, d);
}

/**
 * Format UTC timestamp to YYYY-MM-DD
 */
export function formatDateUTC(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '';
  const date = new Date(timestamp);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check if UTC timestamp is Saturday (6) or Sunday (0)
 */
export function isWeekendUTC(timestamp: number): boolean {
  const day = new Date(timestamp).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Calculate total calendar days (inclusive)
 */
export function getCalendarDays(startDateStr: string, endDateStr: string): number {
  const start = parseDateUTC(startDateStr);
  const end = parseDateUTC(endDateStr);
  if (!start || !end || end < start) return 0;
  const diffMs = end - start;
  return Math.round(diffMs / 86400000) + 1;
}

/**
 * Calculate working days (inclusive) taking weekends, holidays, and makeup days into account
 */
export function getWorkingDays(
  startDateStr: string,
  endDateStr: string,
  holidaysSet: Set<string>,
  makeupDaysSet: Set<string>
): number {
  const start = parseDateUTC(startDateStr);
  const end = parseDateUTC(endDateStr);
  if (!start || !end || end < start) return 0;

  let count = 0;
  const oneDay = 86400000;
  const totalDays = Math.round((end - start) / oneDay) + 1;

  for (let i = 0; i < totalDays; i++) {
    const current = start + i * oneDay;
    const dateStr = formatDateUTC(current);
    const isWk = isWeekendUTC(current);

    if (holidaysSet.has(dateStr)) {
      // Holiday off
      continue;
    }
    if (makeupDaysSet.has(dateStr)) {
      // Makeup working day overrides weekend
      count++;
      continue;
    }
    if (!isWk) {
      count++;
    }
  }

  return count;
}

/**
 * Compute WBS codes, parent-child hierarchies, and rollup values
 */
export function computeGanttHierarchy(
  tasks: Task[],
  holidays: HolidayEntry[] = []
): ComputedTask[] {
  const holidaySet = new Set<string>();
  const makeupSet = new Set<string>();

  for (const h of holidays) {
    if (h.isMakeup) {
      makeupSet.add(h.date);
    } else {
      holidaySet.add(h.date);
    }
  }

  const n = tasks.length;
  // Step 1: determine parent-child relationships and calculate WBS numbering
  const isParentArr = new Array<boolean>(n).fill(false);
  const childIndicesMap = new Map<number, number[]>(); // direct child indices
  const allDescendantIndicesMap = new Map<number, number[]>(); // all descendant indices
  const leafDescendantIndicesMap = new Map<number, number[]>();

  for (let i = 0; i < n; i++) {
    childIndicesMap.set(i, []);
    allDescendantIndicesMap.set(i, []);
    leafDescendantIndicesMap.set(i, []);
    const currLevel = tasks[i].level;
    if (i + 1 < n && tasks[i + 1].level > currLevel) {
      isParentArr[i] = true;
    }
  }

  // Find all descendants for each task
  for (let i = 0; i < n; i++) {
    const currLevel = tasks[i].level;
    for (let j = i + 1; j < n; j++) {
      if (tasks[j].level <= currLevel) {
        break; // out of descendants range
      }
      allDescendantIndicesMap.get(i)!.push(j);
      if (tasks[j].level === currLevel + 1) {
        childIndicesMap.get(i)!.push(j);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const desc = allDescendantIndicesMap.get(i)!;
    const leaves = desc.filter(idx => !isParentArr[idx]);
    leafDescendantIndicesMap.set(i, leaves);
  }

  // Calculate WBS numbers
  const levelCounters: number[] = [];
  const wbsArr = new Array<string>(n);

  for (let i = 0; i < n; i++) {
    const lvl = Math.max(0, tasks[i].level);
    // Ensure array length
    while (levelCounters.length <= lvl) {
      levelCounters.push(0);
    }
    // Trim deeper levels
    levelCounters.length = lvl + 1;
    levelCounters[lvl] += 1;

    wbsArr[i] = levelCounters.join('.');
  }

  // Determine visibility (is any ancestor collapsed?)
  const visibleArr = new Array<boolean>(n).fill(true);
  for (let i = 0; i < n; i++) {
    if (!visibleArr[i]) continue;
    if (isParentArr[i] && tasks[i].collapsed) {
      const descendants = allDescendantIndicesMap.get(i)!;
      for (const d of descendants) {
        visibleArr[d] = false;
      }
    }
  }

  // Roll up dates and progress from bottom up (reverse iteration)
  // First, initialize leaf tasks
  const result: ComputedTask[] = tasks.map((t, i) => {
    const isParent = isParentArr[i];
    const pStart = t.plannedStart || '';
    const pEnd = t.plannedEnd || '';
    const aStart = t.actualStart || '';
    const aEnd = t.actualEnd || '';

    const pCal = getCalendarDays(pStart, pEnd);
    const pWork = getWorkingDays(pStart, pEnd, holidaySet, makeupSet);
    const aCal = (aStart && aEnd) ? getCalendarDays(aStart, aEnd) : 0;
    const aWork = (aStart && aEnd) ? getWorkingDays(aStart, aEnd, holidaySet, makeupSet) : 0;

    return {
      ...t,
      wbs: wbsArr[i],
      isParent,
      childIds: (childIndicesMap.get(i) || []).map(idx => tasks[idx].id),
      leafChildIds: (leafDescendantIndicesMap.get(i) || []).map(idx => tasks[idx].id),
      plannedStart: pStart,
      plannedEnd: pEnd,
      actualStart: aStart,
      actualEnd: aEnd,
      progress: Math.min(100, Math.max(0, Math.round(t.progress || 0))),
      plannedWorkingDays: pWork,
      plannedCalendarDays: pCal,
      actualWorkingDays: aWork,
      actualCalendarDays: aCal,
      isReadOnly: isParent,
      visible: visibleArr[i],
    };
  });

  // Roll up parent tasks in reverse order (so deepest parents roll up first)
  for (let i = n - 1; i >= 0; i--) {
    if (!isParentArr[i]) continue;

    const childIndices = childIndicesMap.get(i)!;
    if (childIndices.length === 0) continue;

    let minPlannedStartMs = Infinity;
    let maxPlannedEndMs = -Infinity;
    let minActualStartMs = Infinity;
    let maxActualEndMs = -Infinity;
    let hasActualStart = false;
    let hasActualEnd = false;

    let totalWeight = 0;
    let weightedProgressSum = 0;

    for (const cIdx of childIndices) {
      const child = result[cIdx];

      // Planned range
      if (child.plannedStart) {
        const ms = parseDateUTC(child.plannedStart);
        if (ms && ms < minPlannedStartMs) minPlannedStartMs = ms;
      }
      if (child.plannedEnd) {
        const ms = parseDateUTC(child.plannedEnd);
        if (ms && ms > maxPlannedEndMs) maxPlannedEndMs = ms;
      }

      // Actual range
      if (child.actualStart) {
        const ms = parseDateUTC(child.actualStart);
        if (ms && ms < minActualStartMs) {
          minActualStartMs = ms;
          hasActualStart = true;
        }
      }
      if (child.actualEnd) {
        const ms = parseDateUTC(child.actualEnd);
        if (ms && ms > maxActualEndMs) {
          maxActualEndMs = ms;
          hasActualEnd = true;
        }
      }

      // Weight by planned working days (or fallback to calendar days or 1)
      const weight = child.plannedWorkingDays > 0 ? child.plannedWorkingDays : (child.plannedCalendarDays > 0 ? child.plannedCalendarDays : 1);
      totalWeight += weight;
      weightedProgressSum += (child.progress || 0) * weight;
    }

    if (minPlannedStartMs !== Infinity) {
      result[i].plannedStart = formatDateUTC(minPlannedStartMs);
    }
    if (maxPlannedEndMs !== -Infinity) {
      result[i].plannedEnd = formatDateUTC(maxPlannedEndMs);
    }

    if (hasActualStart && minActualStartMs !== Infinity) {
      result[i].actualStart = formatDateUTC(minActualStartMs);
    } else {
      result[i].actualStart = '';
    }

    if (hasActualEnd && maxActualEndMs !== -Infinity) {
      result[i].actualEnd = formatDateUTC(maxActualEndMs);
    } else {
      result[i].actualEnd = '';
    }

    result[i].progress = totalWeight > 0 ? Math.round(weightedProgressSum / totalWeight) : 0;
    result[i].plannedCalendarDays = getCalendarDays(result[i].plannedStart, result[i].plannedEnd);
    result[i].plannedWorkingDays = getWorkingDays(result[i].plannedStart, result[i].plannedEnd, holidaySet, makeupSet);
    result[i].actualCalendarDays = (result[i].actualStart && result[i].actualEnd)
      ? getCalendarDays(result[i].actualStart, result[i].actualEnd)
      : 0;
    result[i].actualWorkingDays = (result[i].actualStart && result[i].actualEnd)
      ? getWorkingDays(result[i].actualStart, result[i].actualEnd, holidaySet, makeupSet)
      : 0;
    result[i].isReadOnly = true;
  }

  return result;
}

export interface DayInfo {
  dateStr: string;
  dayNumber: number;
  dayOfWeek: number; // 0=Sun, 6=Sat
  dayOfWeekText: string;
  isWeekend: boolean;
  isHoliday: boolean;
  isMakeup: boolean;
  holidayName?: string;
  isToday: boolean;
  timestamp: number;
}

export interface MonthInfo {
  yearMonth: string; // "2026年10月"
  year: number;
  month: number;
  daysCount: number;
  startDayIndex: number;
}

export interface TimelineRange {
  startDate: string;
  endDate: string;
  totalDays: number;
  days: DayInfo[];
  months: MonthInfo[];
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * Compute timeline start and end range with padding (e.g. 3 days before earliest and 5 days after latest)
 */
export function computeTimelineRange(
  tasks: Task[],
  holidays: HolidayEntry[] = [],
  paddingStart = 3,
  paddingEnd = 7
): TimelineRange {
  let minMs = Infinity;
  let maxMs = -Infinity;

  const todayStr = formatDateUTC(Date.now());
  const todayMs = parseDateUTC(todayStr);

  for (const t of tasks) {
    for (const d of [t.plannedStart, t.plannedEnd, t.actualStart, t.actualEnd]) {
      if (!d) continue;
      const ms = parseDateUTC(d);
      if (ms) {
        if (ms < minMs) minMs = ms;
        if (ms > maxMs) maxMs = ms;
      }
    }
  }

  // If no tasks or invalid dates, default around today
  if (minMs === Infinity || maxMs === -Infinity) {
    minMs = todayMs - 7 * 86400000;
    maxMs = todayMs + 21 * 86400000;
  } else {
    // Add padding
    minMs -= paddingStart * 86400000;
    maxMs += paddingEnd * 86400000;
  }

  const holidayMap = new Map<string, HolidayEntry>();
  for (const h of holidays) {
    holidayMap.set(h.date, h);
  }

  const oneDay = 86400000;
  const totalDays = Math.max(1, Math.round((maxMs - minMs) / oneDay) + 1);

  const days: DayInfo[] = [];
  const monthMap = new Map<string, { year: number; month: number; daysCount: number; startDayIndex: number }>();

  for (let i = 0; i < totalDays; i++) {
    const curMs = minMs + i * oneDay;
    const dateStr = formatDateUTC(curMs);
    const dObj = new Date(curMs);
    const dow = dObj.getUTCDay();
    const isWk = dow === 0 || dow === 6;
    const hEntry = holidayMap.get(dateStr);
    const isHoliday = !!(hEntry && !hEntry.isMakeup);
    const isMakeup = !!(hEntry && hEntry.isMakeup);
    const isToday = (curMs === todayMs);

    days.push({
      dateStr,
      dayNumber: dObj.getUTCDate(),
      dayOfWeek: dow,
      dayOfWeekText: WEEKDAY_NAMES[dow],
      isWeekend: isWk,
      isHoliday,
      isMakeup,
      holidayName: hEntry?.name,
      isToday,
      timestamp: curMs,
    });

    const ymKey = `${dObj.getUTCFullYear()}年${String(dObj.getUTCMonth() + 1).padStart(2, '0')}月`;
    if (!monthMap.has(ymKey)) {
      monthMap.set(ymKey, {
        year: dObj.getUTCFullYear(),
        month: dObj.getUTCMonth() + 1,
        daysCount: 1,
        startDayIndex: i,
      });
    } else {
      monthMap.get(ymKey)!.daysCount += 1;
    }
  }

  const months: MonthInfo[] = Array.from(monthMap.entries()).map(([ym, val]) => ({
    yearMonth: ym,
    year: val.year,
    month: val.month,
    daysCount: val.daysCount,
    startDayIndex: val.startDayIndex,
  }));

  return {
    startDate: formatDateUTC(minMs),
    endDate: formatDateUTC(maxMs),
    totalDays,
    days,
    months,
  };
}

/**
 * Generate .nick format text string
 */
export function generateNickFormat(state: GanttProjectState): string {
  const payload = {
    meta: {
      fileType: 'NICK_GANTT_PROJECT',
      version: state.version || '1.0.0',
      exportedAt: new Date().toISOString(),
      projectName: state.projectName,
      projectDescription: state.projectDescription,
    },
    holidays: state.holidays,
    tasks: state.tasks,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse .nick format text string into GanttProjectState
 */
export function parseNickFormat(content: string): GanttProjectState {
  try {
    const data = JSON.parse(content);
    if (!data || (!data.tasks && !data.meta)) {
      throw new Error('無效的 .nick 格式：缺少必要專案結構');
    }
    return {
      version: data.meta?.version || '1.0.0',
      projectName: data.meta?.projectName || '未命名專案',
      projectDescription: data.meta?.projectDescription || '',
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      holidays: Array.isArray(data.holidays) ? data.holidays : [],
      lastModified: data.meta?.exportedAt || new Date().toISOString(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`解析 .nick 檔案失敗: ${msg}`);
  }
}

/**
 * Generate Mermaid.js Gantt syntax
 */
export function generateMermaidCode(tasks: ComputedTask[], projectName: string): string {
  const lines: string[] = [];
  lines.push('gantt');
  lines.push(`    title ${projectName || '專案甘特圖'}`);
  lines.push('    dateFormat YYYY-MM-DD');
  lines.push('    axisFormat %m/%d');
  lines.push('');

  let currentSection = '主要任務';
  lines.push(`    section ${currentSection}`);

  for (const t of tasks) {
    if (!t.plannedStart || !t.plannedEnd) continue;
    if (t.level === 0) {
      lines.push('');
      currentSection = `${t.wbs} ${t.name.replace(/[:;#]/g, ' ')}`;
      lines.push(`    section ${currentSection}`);
    }

    const safeName = `${t.wbs} ${t.name}`.replace(/[:;#]/g, ' ').trim();
    const id = `task_${t.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    let status = '';
    if (t.progress >= 100) {
      status = 'done, ';
    } else if (t.progress > 0) {
      status = 'active, ';
    }

    lines.push(`    ${safeName} :${status}${id}, ${t.plannedStart}, ${t.plannedEnd}`);
  }

  return lines.join('\n');
}
