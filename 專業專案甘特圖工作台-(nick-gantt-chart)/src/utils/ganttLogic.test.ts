import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateUTC,
  formatDateUTC,
  isWeekendUTC,
  getCalendarDays,
  getWorkingDays,
  computeGanttHierarchy,
  computeTimelineRange,
  generateNickFormat,
  parseNickFormat,
  Task,
  HolidayEntry,
} from './ganttLogic';

test('UTC date parsing and formatting avoids timezone drift', () => {
  const ts = parseDateUTC('2026-10-27');
  assert.equal(formatDateUTC(ts), '2026-10-27');
  assert.equal(parseDateUTC(''), 0);
  assert.equal(formatDateUTC(0), '');
});

test('Weekend detection in UTC', () => {
  // 2026-10-24 is Saturday, 2026-10-25 is Sunday, 2026-10-26 is Monday
  const sat = parseDateUTC('2026-10-24');
  const sun = parseDateUTC('2026-10-25');
  const mon = parseDateUTC('2026-10-26');

  assert.equal(isWeekendUTC(sat), true);
  assert.equal(isWeekendUTC(sun), true);
  assert.equal(isWeekendUTC(mon), false);
});

test('Calendar days calculation (inclusive)', () => {
  // 2026-10-01 to 2026-10-01 is 1 day
  assert.equal(getCalendarDays('2026-10-01', '2026-10-01'), 1);
  // 2026-10-01 to 2026-10-05 is 5 days
  assert.equal(getCalendarDays('2026-10-01', '2026-10-05'), 5);
  // Invalid or inverted range
  assert.equal(getCalendarDays('2026-10-05', '2026-10-01'), 0);
});

test('Working days calculation with holidays and makeup days', () => {
  // Week: 2026-10-19 (Mon) to 2026-10-25 (Sun) -> 5 working days, 2 weekend days
  const holidays = new Set<string>();
  const makeup = new Set<string>();

  assert.equal(getWorkingDays('2026-10-19', '2026-10-25', holidays, makeup), 5);

  // Add 2026-10-21 (Wed) as national holiday -> 4 working days
  holidays.add('2026-10-21');
  assert.equal(getWorkingDays('2026-10-19', '2026-10-25', holidays, makeup), 4);

  // Add 2026-10-24 (Sat) as makeup working day -> 5 working days
  makeup.add('2026-10-24');
  assert.equal(getWorkingDays('2026-10-19', '2026-10-25', holidays, makeup), 5);
});

test('WBS calculation and parent rollup logic', () => {
  const sampleTasks: Task[] = [
    {
      id: 't1',
      name: '專案階段一：需求訪談與規劃',
      level: 0,
      plannedStart: '',
      plannedEnd: '',
      progress: 0,
    },
    {
      id: 't1_1',
      name: '使用者訪談',
      level: 1,
      plannedStart: '2026-10-05', // Mon
      plannedEnd: '2026-10-09',   // Fri (5 work days)
      progress: 100,
    },
    {
      id: 't1_2',
      name: '規格確認',
      level: 1,
      plannedStart: '2026-10-12', // Mon
      plannedEnd: '2026-10-16',   // Fri (5 work days)
      progress: 50,
    },
    {
      id: 't2',
      name: '專案階段二：系統開發',
      level: 0,
      plannedStart: '2026-10-19',
      plannedEnd: '2026-10-30',
      progress: 20,
    },
  ];

  const computed = computeGanttHierarchy(sampleTasks);

  // Check WBS numbers
  assert.equal(computed[0].wbs, '1');
  assert.equal(computed[1].wbs, '1.1');
  assert.equal(computed[2].wbs, '1.2');
  assert.equal(computed[3].wbs, '2');

  // Check parent identification and read-only status
  assert.equal(computed[0].isParent, true);
  assert.equal(computed[0].isReadOnly, true);
  assert.equal(computed[1].isParent, false);
  assert.equal(computed[1].isReadOnly, false);
  assert.equal(computed[3].isParent, false);

  // Check parent date rollup: earliest start (2026-10-05) and latest end (2026-10-16)
  assert.equal(computed[0].plannedStart, '2026-10-05');
  assert.equal(computed[0].plannedEnd, '2026-10-16');

  // Check weighted progress: child 1 has 5 days @ 100%, child 2 has 5 days @ 50%
  // Average = (5*100 + 5*50) / 10 = 750 / 10 = 75%
  assert.equal(computed[0].progress, 75);
});

test('Multi-level nested WBS 1.1.1 and deep rollup', () => {
  const deepTasks: Task[] = [
    { id: '1', name: 'Root', level: 0, plannedStart: '', plannedEnd: '', progress: 0 },
    { id: '1.1', name: 'Sub', level: 1, plannedStart: '', plannedEnd: '', progress: 0 },
    { id: '1.1.1', name: 'Leaf 1', level: 2, plannedStart: '2026-11-02', plannedEnd: '2026-11-06', progress: 100 },
    { id: '1.1.2', name: 'Leaf 2', level: 2, plannedStart: '2026-11-09', plannedEnd: '2026-11-13', progress: 0 },
  ];

  const computed = computeGanttHierarchy(deepTasks);

  assert.equal(computed[0].wbs, '1');
  assert.equal(computed[1].wbs, '1.1');
  assert.equal(computed[2].wbs, '1.1.1');
  assert.equal(computed[3].wbs, '1.1.2');

  assert.equal(computed[1].isParent, true);
  assert.equal(computed[0].isParent, true);

  // Sub rolls up from leaves
  assert.equal(computed[1].plannedStart, '2026-11-02');
  assert.equal(computed[1].plannedEnd, '2026-11-13');
  assert.equal(computed[1].progress, 50);

  // Root rolls up from Sub
  assert.equal(computed[0].plannedStart, '2026-11-02');
  assert.equal(computed[0].plannedEnd, '2026-11-13');
  assert.equal(computed[0].progress, 50);
});

test('Collapsed parent hides all descendant tasks', () => {
  const tasks: Task[] = [
    { id: 'p1', name: 'Parent', level: 0, plannedStart: '', plannedEnd: '', progress: 0, collapsed: true },
    { id: 'c1', name: 'Child 1', level: 1, plannedStart: '2026-10-01', plannedEnd: '2026-10-05', progress: 50 },
    { id: 'c2', name: 'Child 2', level: 1, plannedStart: '2026-10-06', plannedEnd: '2026-10-10', progress: 50 },
    { id: 'p2', name: 'Next Parent', level: 0, plannedStart: '2026-10-11', plannedEnd: '2026-10-15', progress: 0 },
  ];

  const computed = computeGanttHierarchy(tasks);
  assert.equal(computed[0].visible, true);
  assert.equal(computed[1].visible, false);
  assert.equal(computed[2].visible, false);
  assert.equal(computed[3].visible, true);
});

test('.nick format export and import round-trip', () => {
  const state = {
    version: '1.0.0',
    projectName: '測試專案甘特圖',
    projectDescription: '專案說明驗證',
    tasks: [
      { id: 't1', name: '設計', level: 0, plannedStart: '2026-10-01', plannedEnd: '2026-10-05', progress: 100 },
    ],
    holidays: [
      { date: '2026-10-10', name: '國慶日', isMakeup: false },
    ],
    lastModified: '2026-10-27T12:00:00.000Z',
  };

  const nickString = generateNickFormat(state);
  assert.match(nickString, /NICK_GANTT_PROJECT/);
  assert.match(nickString, /測試專案甘特圖/);

  const parsed = parseNickFormat(nickString);
  assert.equal(parsed.projectName, '測試專案甘特圖');
  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.holidays[0].name, '國慶日');
});

test('Timeline range calculation computes calendar days and months properly', () => {
  const tasks: Task[] = [
    { id: 't1', name: 'Task', level: 0, plannedStart: '2026-10-10', plannedEnd: '2026-10-20', progress: 50 },
  ];

  const range = computeTimelineRange(tasks, [], 2, 2);
  assert.ok(range.totalDays >= 15);
  assert.ok(range.days.length === range.totalDays);
  assert.ok(range.months.length >= 1);
});
