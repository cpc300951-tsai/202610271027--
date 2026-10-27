import { HolidayEntry } from './ganttLogic';

/**
 * Built-in Taiwan Calendar holidays and makeup days fallback
 * Covers official government calendar for 2025 and 2026
 */
export const TAIWAN_HOLIDAYS_PRESET: HolidayEntry[] = [
  // 2025
  { date: '2025-01-01', name: '元旦', isMakeup: false },
  { date: '2025-01-25', name: '農曆除夕前一日 (補假)', isMakeup: false },
  { date: '2025-01-27', name: '春節連假', isMakeup: false },
  { date: '2025-01-28', name: '除夕', isMakeup: false },
  { date: '2025-01-29', name: '春節初一', isMakeup: false },
  { date: '2025-01-30', name: '春節初二', isMakeup: false },
  { date: '2025-01-31', name: '春節初三', isMakeup: false },
  { date: '2025-02-08', name: '春節補班日', isMakeup: true },
  { date: '2025-02-28', name: '和平紀念日', isMakeup: false },
  { date: '2025-04-03', name: '兒童節補假', isMakeup: false },
  { date: '2025-04-04', name: '民族掃墓節 (清明節)', isMakeup: false },
  { date: '2025-05-30', name: '端午節連假', isMakeup: false },
  { date: '2025-05-31', name: '端午節', isMakeup: false },
  { date: '2025-10-06', name: '中秋節', isMakeup: false },
  { date: '2025-10-10', name: '國慶日', isMakeup: false },

  // 2026
  { date: '2026-01-01', name: '元旦', isMakeup: false },
  { date: '2026-02-14', name: '春節連假', isMakeup: false },
  { date: '2026-02-15', name: '春節小年夜', isMakeup: false },
  { date: '2026-02-16', name: '除夕', isMakeup: false },
  { date: '2026-02-17', name: '春節初一', isMakeup: false },
  { date: '2026-02-18', name: '春節初二', isMakeup: false },
  { date: '2026-02-19', name: '春節初三', isMakeup: false },
  { date: '2026-02-20', name: '春節調整放假', isMakeup: false },
  { date: '2026-02-28', name: '和平紀念日', isMakeup: false },
  { date: '2026-04-03', name: '兒童節', isMakeup: false },
  { date: '2026-04-04', name: '清明節', isMakeup: false },
  { date: '2026-04-05', name: '清明節補假', isMakeup: false },
  { date: '2026-06-19', name: '端午節', isMakeup: false },
  { date: '2026-09-25', name: '中秋節', isMakeup: false },
  { date: '2026-10-10', name: '國慶日', isMakeup: false },

  // 2027
  { date: '2027-01-01', name: '元旦', isMakeup: false },
  { date: '2027-02-05', name: '除夕', isMakeup: false },
  { date: '2027-02-06', name: '春節初一', isMakeup: false },
  { date: '2027-02-07', name: '春節初二', isMakeup: false },
  { date: '2027-02-08', name: '春節初三', isMakeup: false },
  { date: '2027-02-28', name: '和平紀念日', isMakeup: false },
  { date: '2027-04-04', name: '清明節與兒童節', isMakeup: false },
  { date: '2027-06-09', name: '端午節', isMakeup: false },
  { date: '2027-09-15', name: '中秋節', isMakeup: false },
  { date: '2027-10-10', name: '國慶日', isMakeup: false },
];

/**
 * Fetch Taiwan calendar data for a given year from TaiwanCalendar open repository
 */
export async function fetchTaiwanHolidays(year: number): Promise<{ holidays: HolidayEntry[]; source: string }> {
  const sources = [
    `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`,
    `https://raw.githubusercontent.com/nickhsine/TaiwanCalendar/master/data/${year}.json`,
  ];

  for (const url of sources) {
    try {
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          const result: HolidayEntry[] = [];
          for (const item of data) {
            // item format in TaiwanCalendar: { date: "20260101", isHoliday: true, name: "中華民國開國紀念日", holidayCategory: "..." }
            let dateStr = '';
            if (item.date && String(item.date).length === 8) {
              const s = String(item.date);
              dateStr = `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
            } else if (item.date && String(item.date).includes('-')) {
              dateStr = String(item.date);
            }

            if (!dateStr) continue;

            const isHoliday = item.isHoliday === true || item.isHoliday === 'true';
            const name = item.description || item.name || item.holidayCategory || (isHoliday ? '國定假日' : '補班日');
            const isWeekend = (() => {
              const [y, m, d] = dateStr.split('-').map(Number);
              const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
              return dow === 0 || dow === 6;
            })();

            // If it's a weekend but isHoliday is false or description mentions 補行上班, it's a makeup work day
            const isMakeup = (!isHoliday && isWeekend) || (item.holidayCategory?.includes('補行上班') || name.includes('補行上班') || name.includes('補班'));

            if (isHoliday || isMakeup) {
              result.push({
                date: dateStr,
                name: name || (isMakeup ? '週末補行上班' : '放假日'),
                isMakeup,
              });
            }
          }

          if (result.length > 0) {
            return { holidays: result, source: `開放資料庫 (${url})` };
          }
        }
      }
    } catch {
      // Continue to next source or fallback
    }
  }

  // Fallback to built-in presets
  const filtered = TAIWAN_HOLIDAYS_PRESET.filter(h => h.date.startsWith(String(year)));
  if (filtered.length > 0) {
    return { holidays: filtered, source: '內建台灣國定假日資料庫 (離線備援)' };
  }

  return { holidays: [], source: '無符合資料' };
}
