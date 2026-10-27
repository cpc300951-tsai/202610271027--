import {
  Task,
  HolidayEntry,
  GanttProjectState,
  parseDateUTC,
  formatDateUTC,
  computeGanttHierarchy,
  computeTimelineRange,
  generateNickFormat,
  parseNickFormat,
  generateMermaidCode,
  ComputedTask,
} from './utils/ganttLogic';
import { TAIWAN_HOLIDAYS_PRESET, fetchTaiwanHolidays } from './utils/taiwanHolidays';
import { generateStandaloneHTML } from './utils/standaloneExporter';
import mermaid from 'mermaid';

// Initial Seed Data: Realistic Enterprise Digital Transformation & ERP Upgrade Project
const DEFAULT_TASKS: Task[] = [
  {
    id: 't1',
    name: '1. 專案啟動與需求規劃',
    level: 0,
    plannedStart: '',
    plannedEnd: '',
    progress: 0,
  },
  {
    id: 't1_1',
    name: '利益關係人訪談與業務盤點',
    level: 1,
    plannedStart: '2026-10-01',
    plannedEnd: '2026-10-08',
    actualStart: '2026-10-01',
    actualEnd: '2026-10-07',
    progress: 100,
  },
  {
    id: 't1_2',
    name: '系統規格與作業流程需求簽核',
    level: 1,
    plannedStart: '2026-10-09',
    plannedEnd: '2026-10-16',
    actualStart: '2026-10-09',
    actualEnd: '2026-10-18',
    progress: 100,
  },
  {
    id: 't2',
    name: '2. 系統核心設計與微服務開發',
    level: 0,
    plannedStart: '',
    plannedEnd: '',
    progress: 0,
  },
  {
    id: 't2_1',
    name: '資料庫綱要與雲端架構設計',
    level: 1,
    plannedStart: '2026-10-19',
    plannedEnd: '2026-10-27',
    actualStart: '2026-10-19',
    actualEnd: '2026-10-26',
    progress: 90,
  },
  {
    id: 't2_2',
    name: '業務模組後端 API 實作',
    level: 1,
    plannedStart: '',
    plannedEnd: '',
    progress: 0,
  },
  {
    id: 't2_2_1',
    name: '訂單與供應鏈模組 API',
    level: 2,
    plannedStart: '2026-10-28',
    plannedEnd: '2026-11-06',
    actualStart: '2026-10-28',
    actualEnd: '2026-11-04',
    progress: 60,
  },
  {
    id: 't2_2_2',
    name: '財務核算與報表引擎 API',
    level: 2,
    plannedStart: '2026-11-05',
    plannedEnd: '2026-11-16',
    actualStart: '',
    actualEnd: '',
    progress: 10,
  },
  {
    id: 't2_3',
    name: '前端管理控制台與操作介面',
    level: 1,
    plannedStart: '2026-11-02',
    plannedEnd: '2026-11-18',
    actualStart: '',
    actualEnd: '',
    progress: 25,
  },
  {
    id: 't3',
    name: '3. 系統整合測試與驗收 UAT',
    level: 0,
    plannedStart: '',
    plannedEnd: '',
    progress: 0,
  },
  {
    id: 't3_1',
    name: '高併發壓力測試與資安弱點掃描',
    level: 1,
    plannedStart: '2026-11-19',
    plannedEnd: '2026-11-26',
    progress: 0,
  },
  {
    id: 't3_2',
    name: '業務部門使用者驗收測試 (UAT)',
    level: 1,
    plannedStart: '2026-11-27',
    plannedEnd: '2026-12-07',
    progress: 0,
  },
  {
    id: 't4',
    name: '4. 正式上線與雲端切換營運',
    level: 0,
    plannedStart: '2026-12-08',
    plannedEnd: '2026-12-18',
    progress: 0,
  },
];

export class GanttApp {
  private container: HTMLElement;
  private state: GanttProjectState;
  private isDirty = false;
  private dayWidth = 38; // px
  private activeModal: 'holiday' | 'mermaid' | 'exportHtml' | null = null;
  private tooltipEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.state = {
      version: '1.0.0',
      projectName: '企業 ERP 升級與雲端轉型專案甘特圖',
      projectDescription: '本專案涵蓋業務訪談、微服務架構、資料庫重構、前端介面與完整 UAT 驗收時程。',
      tasks: JSON.parse(JSON.stringify(DEFAULT_TASKS)),
      holidays: JSON.parse(JSON.stringify(TAIWAN_HOLIDAYS_PRESET)),
      lastModified: new Date().toISOString(),
    };

    // Initialize Mermaid
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        gantt: {
          axisFormat: '%m/%d',
          barHeight: 22,
          barGap: 6,
          topPadding: 30,
          sidePadding: 30,
        },
      });
    } catch {
      // Mermaid initialization fallback
    }

    // Setup beforeunload protection
    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '有未儲存的甘特圖變更，確定要離開嗎？';
        return e.returnValue;
      }
    });

    // Create Tooltip DOM
    this.setupTooltip();

    // Initial render
    this.render();
  }

  private markDirty(): void {
    this.isDirty = true;
    this.render();
  }

  private setupTooltip(): void {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'gantt-tooltip';
      document.body.appendChild(this.tooltipEl);
    }
  }

  private showTooltip(text: string, x: number, y: number): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.innerHTML = text;
    this.tooltipEl.style.left = `${Math.min(window.innerWidth - 290, x + 12)}px`;
    this.tooltipEl.style.top = `${y + 16}px`;
    this.tooltipEl.classList.add('visible');
  }

  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.classList.remove('visible');
    }
  }

  /**
   * Main State-driven Render function
   */
  public render(): void {
    // Disconnect previous observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.container.innerHTML = '';
    const computedTasks = computeGanttHierarchy(this.state.tasks, this.state.holidays);
    const visibleTasks = computedTasks.filter((t) => t.visible);
    const timeline = computeTimelineRange(this.state.tasks, this.state.holidays);

    // Stats calculations
    const leafTasks = computedTasks.filter((t) => !t.isParent);
    const totalWorkingDays = leafTasks.reduce((sum, t) => sum + (t.plannedWorkingDays || 0), 0);
    const avgProgress = leafTasks.length > 0
      ? Math.round(leafTasks.reduce((sum, t) => sum + (t.progress || 0), 0) / leafTasks.length)
      : 0;

    // Shell
    const appShell = document.createElement('div');
    appShell.className = 'gantt-app';

    // A3 Print Banner
    const printHeader = document.createElement('div');
    printHeader.className = 'print-header';
    printHeader.style.display = 'none';
    printHeader.innerHTML = `
      <h1>${this.escapeHtml(this.state.projectName)}</h1>
      <p>專案時程基準：${timeline.startDate} 至 ${timeline.endDate} ｜ 總工時：${totalWorkingDays} 工作天 ｜ 目前進度：${avgProgress}% ｜ 列印日期：${formatDateUTC(Date.now())}</p>
    `;
    appShell.appendChild(printHeader);

    // 1. Top Toolbar
    const toolbar = this.createToolbar();
    appShell.appendChild(toolbar);

    // 2. Project Info & Legend Bar
    const infoBar = this.createInfoBar(computedTasks.length, totalWorkingDays, avgProgress);
    appShell.appendChild(infoBar);

    // 3. Main Split View: Left Table + Right Timeline
    const mainView = document.createElement('div');
    mainView.className = 'gantt-main-view';

    const tablePanel = this.createTablePanel(visibleTasks);
    const timelinePanel = this.createTimelinePanel(visibleTasks, timeline);

    mainView.appendChild(tablePanel);
    mainView.appendChild(timelinePanel);
    appShell.appendChild(mainView);

    this.container.appendChild(appShell);

    // Synchronize row heights after DOM layout
    this.syncRowHeights();

    // Attach ResizeObserver to left table rows to auto-align height whenever text wraps
    this.setupHeightAutoSync();

    // Modals
    if (this.activeModal === 'holiday') {
      this.renderHolidayModal();
    } else if (this.activeModal === 'mermaid') {
      this.renderMermaidModal(computedTasks);
    } else if (this.activeModal === 'exportHtml') {
      this.renderExportHtmlModal();
    }
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('header');
    toolbar.className = 'gantt-toolbar';

    // Brand & Title
    const brand = document.createElement('div');
    brand.className = 'gantt-brand';
    brand.innerHTML = `
      <div class="brand-icon">G</div>
      <input type="text" class="brand-title-input" id="gantt-project-title" value="${this.escapeHtml(this.state.projectName)}" title="點選直接修改專案標題" />
      ${
        this.isDirty
          ? `<span class="dirty-indicator" title="修改尚未儲存至 .nick 檔案"><span class="dirty-pulse"></span>有未儲存變更</span>`
          : `<span class="clean-badge">✓ 已就緒</span>`
      }
    `;

    const titleInput = brand.querySelector<HTMLInputElement>('#gantt-project-title');
    if (titleInput) {
      titleInput.addEventListener('change', () => {
        this.state.projectName = titleInput.value.trim() || '未命名專案';
        this.markDirty();
      });
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'toolbar-actions';

    // Buttons
    const btnAdd = this.createButton('➕ 新增任務', 'btn-primary', () => this.handleAddTask());
    const btnHoliday = this.createButton(
      `📅 假日管理 (${this.state.holidays.length})`,
      'btn-secondary',
      () => {
        this.activeModal = 'holiday';
        this.render();
      }
    );
    const btnMermaid = this.createButton('📊 Mermaid 視圖與說明', 'btn-secondary', () => {
      this.activeModal = 'mermaid';
      this.render();
    });
    const btnSaveNick = this.createButton('💾 儲存專案 (.nick)', 'btn-secondary', () => this.handleSaveNick());
    const btnOpenNick = this.createButton('📁 開啟專案', 'btn-secondary', () => {
      fileInput.click();
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.nick,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => this.handleImportFile(e));

    const btnExportHtml = this.createButton('📋 匯出獨立 .html 檔案', 'btn-secondary', () => {
      this.activeModal = 'exportHtml';
      this.render();
    });

    // Zoom buttons
    const zoomGroup = document.createElement('div');
    zoomGroup.style.display = 'inline-flex';
    zoomGroup.style.alignItems = 'center';
    zoomGroup.style.gap = '2px';
    zoomGroup.style.marginLeft = '4px';

    const btnZoomOut = this.createButton('🔍-', 'btn-secondary btn-sm', () => {
      this.dayWidth = Math.max(24, this.dayWidth - 6);
      this.render();
    });
    btnZoomOut.title = '縮小時間軸';

    const btnZoomIn = this.createButton('🔍+', 'btn-secondary btn-sm', () => {
      this.dayWidth = Math.min(60, this.dayWidth + 6);
      this.render();
    });
    btnZoomIn.title = '放大時間軸';

    zoomGroup.appendChild(btnZoomOut);
    zoomGroup.appendChild(btnZoomIn);

    const btnToday = this.createButton('🎯 今天', 'btn-secondary', () => this.scrollToToday());
    const btnPrint = this.createButton('🖨️ A3 橫向列印', 'btn-secondary', () => window.print());

    actions.appendChild(btnAdd);
    actions.appendChild(btnHoliday);
    actions.appendChild(btnMermaid);
    actions.appendChild(btnSaveNick);
    actions.appendChild(btnOpenNick);
    actions.appendChild(fileInput);
    actions.appendChild(btnExportHtml);
    actions.appendChild(zoomGroup);
    actions.appendChild(btnToday);
    actions.appendChild(btnPrint);

    toolbar.appendChild(brand);
    toolbar.appendChild(actions);
    return toolbar;
  }

  private createInfoBar(taskCount: number, workDays: number, progress: number): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'project-infobar';
    bar.innerHTML = `
      <div class="project-stats">
        <div class="stat-item">任務總數：<span class="stat-value">${taskCount} 項</span></div>
        <div class="stat-item">預計總工時：<span class="stat-value">${workDays} 工作天</span></div>
        <div class="stat-item">專案總進度：
          <div class="progress-track-mini"><div class="progress-fill-mini" style="width: ${progress}%"></div></div>
          <span class="stat-value">${progress}%</span>
        </div>
        <div class="stat-item" style="color: #059669;">
          時程邏輯：<span class="stat-value">UTC 安全計算（排除週六日與國定假日）</span>
        </div>
      </div>
      <div class="legend-items">
        <div class="legend-chip"><div class="legend-box" style="background: #4f46e5;"></div>預計時程</div>
        <div class="legend-chip"><div class="legend-box" style="background: #16a34a;"></div>實際進度</div>
        <div class="legend-chip"><div class="legend-box" style="background: #1e293b;"></div>父項目彙總</div>
        <div class="legend-chip"><div class="legend-box" style="background: #f1f5f9; border: 1px solid #cbd5e1;"></div>週末休假</div>
        <div class="legend-chip"><div class="legend-box" style="background: #fee2e2; border: 1px solid #fca5a5;"></div>國定假日</div>
      </div>
    `;
    return bar;
  }

  private createTablePanel(tasks: ComputedTask[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'gantt-table-panel';

    const table = document.createElement('table');
    table.className = 'gantt-table';

    // Header
    const thead = document.createElement('thead');
    thead.className = 'gantt-table-header';
    thead.innerHTML = `
      <tr>
        <th style="width: 55px;" class="text-center">WBS</th>
        <th style="width: 220px;">任務名稱</th>
        <th style="width: 110px;" class="text-center">預計開始</th>
        <th style="width: 110px;" class="text-center">預計結束</th>
        <th style="width: 55px;" class="text-center" title="排除週末與國定假日的工作天數">工天</th>
        <th style="width: 110px;" class="text-center">實際開始</th>
        <th style="width: 110px;" class="text-center">實際結束</th>
        <th style="width: 55px;" class="text-center">進度</th>
        <th style="width: 85px;" class="text-center action-col">操作</th>
      </tr>
    `;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    tbody.className = 'gantt-table-body';

    for (const t of tasks) {
      const tr = document.createElement('tr');
      tr.className = `task-row ${t.isParent ? 'parent-row' : ''}`;
      tr.setAttribute('data-task-id', t.id);

      const indentPx = (t.level || 0) * 16;

      // 1. WBS
      const tdWbs = document.createElement('td');
      tdWbs.className = 'text-center';
      tdWbs.innerHTML = `<span class="wbs-pill">${t.wbs}</span>`;
      tr.appendChild(tdWbs);

      // 2. Name with indent & collapse arrow
      const tdName = document.createElement('td');
      const nameCell = document.createElement('div');
      nameCell.className = 'task-name-cell';
      nameCell.style.paddingLeft = `${indentPx}px`;

      if (t.isParent) {
        const collapseBtn = document.createElement('button');
        collapseBtn.className = `collapse-btn ${t.collapsed ? 'collapsed' : ''}`;
        collapseBtn.textContent = t.collapsed ? '▶' : '▼';
        collapseBtn.title = t.collapsed ? '展開子項目' : '收合子項目';
        collapseBtn.addEventListener('click', () => {
          const original = this.state.tasks.find((x) => x.id === t.id);
          if (original) {
            original.collapsed = !original.collapsed;
            this.render();
          }
        });
        nameCell.appendChild(collapseBtn);
      } else {
        const spacer = document.createElement('span');
        spacer.style.width = '18px';
        spacer.style.display = 'inline-block';
        spacer.style.flexShrink = '0';
        nameCell.appendChild(spacer);
      }

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'task-name-input';
      nameInput.value = t.name;
      nameInput.addEventListener('change', () => {
        const orig = this.state.tasks.find((x) => x.id === t.id);
        if (orig) {
          orig.name = nameInput.value.trim() || '未命名任務';
          this.markDirty();
        }
      });
      nameCell.appendChild(nameInput);
      tdName.appendChild(nameCell);
      tr.appendChild(tdName);

      // 3. Planned Start
      const tdPStart = document.createElement('td');
      tdPStart.className = 'text-center';
      if (t.isReadOnly) {
        tdPStart.innerHTML = `<span class="date-readonly" title="父項目依子項目自動計算最早開始日">${t.plannedStart || '-'} <span class="lock-icon">🔒</span></span>`;
      } else {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'date-input';
        input.value = t.plannedStart;
        input.addEventListener('change', () => {
          const orig = this.state.tasks.find((x) => x.id === t.id);
          if (orig) {
            orig.plannedStart = input.value;
            this.markDirty();
          }
        });
        tdPStart.appendChild(input);
      }
      tr.appendChild(tdPStart);

      // 4. Planned End
      const tdPEnd = document.createElement('td');
      tdPEnd.className = 'text-center';
      if (t.isReadOnly) {
        tdPEnd.innerHTML = `<span class="date-readonly" title="父項目依子項目自動計算最晚結束日">${t.plannedEnd || '-'} <span class="lock-icon">🔒</span></span>`;
      } else {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'date-input';
        input.value = t.plannedEnd;
        input.addEventListener('change', () => {
          const orig = this.state.tasks.find((x) => x.id === t.id);
          if (orig) {
            orig.plannedEnd = input.value;
            this.markDirty();
          }
        });
        tdPEnd.appendChild(input);
      }
      tr.appendChild(tdPEnd);

      // 5. Work Days
      const tdWork = document.createElement('td');
      tdWork.className = 'text-center';
      tdWork.style.fontWeight = '600';
      tdWork.style.fontSize = '12px';
      tdWork.textContent = String(t.plannedWorkingDays);
      tr.appendChild(tdWork);

      // 6. Actual Start
      const tdAStart = document.createElement('td');
      tdAStart.className = 'text-center';
      if (t.isReadOnly) {
        tdAStart.innerHTML = `<span class="date-readonly">${t.actualStart || '-'}</span>`;
      } else {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'date-input';
        input.value = t.actualStart || '';
        input.addEventListener('change', () => {
          const orig = this.state.tasks.find((x) => x.id === t.id);
          if (orig) {
            orig.actualStart = input.value;
            this.markDirty();
          }
        });
        tdAStart.appendChild(input);
      }
      tr.appendChild(tdAStart);

      // 7. Actual End
      const tdAEnd = document.createElement('td');
      tdAEnd.className = 'text-center';
      if (t.isReadOnly) {
        tdAEnd.innerHTML = `<span class="date-readonly">${t.actualEnd || '-'}</span>`;
      } else {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'date-input';
        input.value = t.actualEnd || '';
        input.addEventListener('change', () => {
          const orig = this.state.tasks.find((x) => x.id === t.id);
          if (orig) {
            orig.actualEnd = input.value;
            this.markDirty();
          }
        });
        tdAEnd.appendChild(input);
      }
      tr.appendChild(tdAEnd);

      // 8. Progress (%)
      const tdProg = document.createElement('td');
      tdProg.className = 'text-center';
      if (t.isReadOnly) {
        tdProg.innerHTML = `<span style="font-weight: 700; color: #2563eb; font-size: 12px;" title="子項目工作天加權計算">${t.progress}%</span>`;
      } else {
        const progGroup = document.createElement('div');
        progGroup.className = 'progress-input-group';
        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.min = '0';
        numInput.max = '100';
        numInput.className = 'progress-num';
        numInput.value = String(t.progress);
        numInput.addEventListener('change', () => {
          const val = Math.min(100, Math.max(0, parseInt(numInput.value, 10) || 0));
          const orig = this.state.tasks.find((x) => x.id === t.id);
          if (orig) {
            orig.progress = val;
            this.markDirty();
          }
        });
        progGroup.appendChild(numInput);
        progGroup.appendChild(document.createTextNode('%'));
        tdProg.appendChild(progGroup);
      }
      tr.appendChild(tdProg);

      // 9. Actions (Indent, Outdent, Delete)
      const tdActions = document.createElement('td');
      tdActions.className = 'text-center action-cell';
      const actionGroup = document.createElement('div');
      actionGroup.className = 'task-actions';

      const btnIndent = document.createElement('button');
      btnIndent.className = 'action-btn';
      btnIndent.textContent = '▶';
      btnIndent.title = '向右縮排（降級為子項目）';
      btnIndent.addEventListener('click', () => this.handleIndentTask(t.id));

      const btnOutdent = document.createElement('button');
      btnOutdent.className = 'action-btn';
      btnOutdent.textContent = '◀';
      btnOutdent.title = '向左縮排（升級）';
      btnOutdent.addEventListener('click', () => this.handleOutdentTask(t.id));

      const btnDel = document.createElement('button');
      btnDel.className = 'action-btn btn-delete';
      btnDel.textContent = '✕';
      btnDel.title = '刪除此任務';
      btnDel.addEventListener('click', () => this.handleDeleteTask(t.id));

      actionGroup.appendChild(btnIndent);
      actionGroup.appendChild(btnOutdent);
      actionGroup.appendChild(btnDel);
      tdActions.appendChild(actionGroup);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    panel.appendChild(table);
    return panel;
  }

  private createTimelinePanel(
    tasks: ComputedTask[],
    timeline: ReturnType<typeof computeTimelineRange>
  ): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'gantt-timeline-panel';
    panel.id = 'gantt-timeline-panel';

    const totalWidthPx = timeline.totalDays * this.dayWidth;
    const canvas = document.createElement('div');
    canvas.className = 'timeline-canvas-container';
    canvas.style.width = `${totalWidthPx}px`;

    // 1. Two-Tier Header
    const headerContainer = document.createElement('div');
    headerContainer.className = 'timeline-header-container';

    // Tier 1: Months
    const monthTier = document.createElement('div');
    monthTier.className = 'timeline-month-tier';
    for (const m of timeline.months) {
      const mCell = document.createElement('div');
      mCell.className = 'timeline-month-cell';
      mCell.style.width = `${m.daysCount * this.dayWidth}px`;
      mCell.textContent = m.yearMonth;
      monthTier.appendChild(mCell);
    }
    headerContainer.appendChild(monthTier);

    // Tier 2: Days
    const dayTier = document.createElement('div');
    dayTier.className = 'timeline-day-tier';

    let todayLeftPx: number | null = null;
    const minTimeMs = parseDateUTC(timeline.startDate);

    timeline.days.forEach((d, idx) => {
      const dCell = document.createElement('div');
      dCell.className = 'timeline-day-cell';
      dCell.style.width = `${this.dayWidth}px`;
      dCell.style.minWidth = `${this.dayWidth}px`;
      dCell.style.maxWidth = `${this.dayWidth}px`;

      if (d.isWeekend) dCell.classList.add('weekend');
      if (d.isHoliday) dCell.classList.add('holiday');
      if (d.isMakeup) dCell.classList.add('makeup');
      if (d.isToday) {
        dCell.classList.add('today');
        todayLeftPx = idx * this.dayWidth + this.dayWidth / 2;
      }

      dCell.innerHTML = `
        <span class="day-number">${d.dayNumber}</span>
        <span class="day-week">${d.dayOfWeekText}</span>
      `;

      const tipText = `<strong>${d.dateStr} (${d.dayOfWeekText})</strong>${
        d.holidayName ? `<br><span style="color:#ef4444">${d.holidayName}</span>` : ''
      }${d.isMakeup ? '<br><span style="color:#f59e0b">補行上班日</span>' : ''}${
        d.isToday ? '<br><span style="color:#ea580c">★ 今天</span>' : ''
      }`;

      dCell.addEventListener('mouseenter', (e) => this.showTooltip(tipText, e.clientX, e.clientY));
      dCell.addEventListener('mouseleave', () => this.hideTooltip());

      dayTier.appendChild(dCell);
    });
    headerContainer.appendChild(dayTier);
    canvas.appendChild(headerContainer);

    // 2. Background Grid
    const bgGrid = document.createElement('div');
    bgGrid.className = 'timeline-background-grid';
    for (const d of timeline.days) {
      const col = document.createElement('div');
      col.className = 'grid-day-col';
      col.style.width = `${this.dayWidth}px`;
      col.style.minWidth = `${this.dayWidth}px`;
      col.style.maxWidth = `${this.dayWidth}px`;
      if (d.isWeekend) col.classList.add('weekend');
      if (d.isHoliday) col.classList.add('holiday');
      if (d.isMakeup) col.classList.add('makeup');
      bgGrid.appendChild(col);
    }
    canvas.appendChild(bgGrid);

    // 3. Today Vertical Indicator Line
    if (todayLeftPx !== null) {
      const todayLine = document.createElement('div');
      todayLine.className = 'today-line';
      todayLine.id = 'timeline-today-line';
      todayLine.style.left = `${todayLeftPx}px`;
      todayLine.innerHTML = `<div class="today-pin">今天</div>`;
      canvas.appendChild(todayLine);
    }

    // 4. Timeline Rows with Dual Gantt Bars
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'timeline-rows-container';

    for (const t of tasks) {
      const row = document.createElement('div');
      row.className = `timeline-row ${t.isParent ? 'parent-row' : ''}`;
      row.setAttribute('data-timeline-row-id', t.id);

      const wrapper = document.createElement('div');
      wrapper.className = 'gantt-bars-wrapper';

      const calcBarGeometry = (startStr: string, endStr: string) => {
        if (!startStr || !endStr) return null;
        const sMs = parseDateUTC(startStr);
        const eMs = parseDateUTC(endStr);
        if (!sMs || !eMs || eMs < sMs) return null;
        const dayIdx = Math.round((sMs - minTimeMs) / 86400000);
        const spanDays = Math.round((eMs - sMs) / 86400000) + 1;
        const x = dayIdx * this.dayWidth + 2;
        const w = Math.max(10, spanDays * this.dayWidth - 4);
        return { x, w, sMs, eMs };
      };

      if (t.isParent) {
        // Parent summary bracket bar
        const geom = calcBarGeometry(t.plannedStart, t.plannedEnd);
        if (geom) {
          const bar = document.createElement('div');
          bar.className = 'gantt-bar gantt-bar-parent';
          bar.style.left = `${geom.x}px`;
          bar.style.width = `${geom.w}px`;
          bar.innerHTML = `
            <div class="bar-fill" style="width: ${t.progress}%;"></div>
            <span class="bar-label">${this.escapeHtml(t.wbs)} ${this.escapeHtml(t.name)} (${t.progress}%)</span>
          `;

          const tip = `
            <strong>【父項目彙總】${t.wbs} ${this.escapeHtml(t.name)}</strong><br>
            預計時程：${t.plannedStart} ~ ${t.plannedEnd}<br>
            合計工作天：${t.plannedWorkingDays} 天（日曆天：${t.plannedCalendarDays}）<br>
            子項目加權進度：${t.progress}%
          `;
          bar.addEventListener('mouseenter', (e) => this.showTooltip(tip, e.clientX, e.clientY));
          bar.addEventListener('mouseleave', () => this.hideTooltip());

          wrapper.appendChild(bar);
        }
      } else {
        // Dual Bars: Planned (Upper) and Actual (Lower)
        // 1. Planned Bar
        const pGeom = calcBarGeometry(t.plannedStart, t.plannedEnd);
        if (pGeom) {
          const pBar = document.createElement('div');
          pBar.className = 'gantt-bar gantt-bar-planned';
          pBar.style.left = `${pGeom.x}px`;
          pBar.style.width = `${pGeom.w}px`;
          pBar.innerHTML = `
            <div class="bar-fill" style="width: ${t.progress}%;"></div>
            <span class="bar-label">預計: ${t.plannedStart.slice(5)} ~ ${t.plannedEnd.slice(5)}</span>
          `;

          const tip = `
            <strong>【預計時程】${t.wbs} ${this.escapeHtml(t.name)}</strong><br>
            區間：${t.plannedStart} 至 ${t.plannedEnd}<br>
            工作天：${t.plannedWorkingDays} 天 ｜ 日曆天：${t.plannedCalendarDays} 天<br>
            目前進度：${t.progress}%
          `;
          pBar.addEventListener('mouseenter', (e) => this.showTooltip(tip, e.clientX, e.clientY));
          pBar.addEventListener('mouseleave', () => this.hideTooltip());

          wrapper.appendChild(pBar);
        }

        // 2. Actual Bar
        const aGeom = calcBarGeometry(t.actualStart || '', t.actualEnd || '');
        if (aGeom) {
          const aBar = document.createElement('div');
          aBar.className = 'gantt-bar gantt-bar-actual';
          // Check if delayed compared to plannedEnd
          if (t.plannedEnd && aGeom.eMs > parseDateUTC(t.plannedEnd)) {
            aBar.classList.add('delayed');
          }
          aBar.style.left = `${aGeom.x}px`;
          aBar.style.width = `${aGeom.w}px`;
          aBar.innerHTML = `
            <div class="bar-fill" style="width: ${t.progress}%;"></div>
            <span class="bar-label">實際: ${t.actualStart?.slice(5)} ~ ${t.actualEnd?.slice(5)} (${t.progress}%)</span>
          `;

          const tip = `
            <strong>【實際執行】${t.wbs} ${this.escapeHtml(t.name)}</strong><br>
            執行區間：${t.actualStart} 至 ${t.actualEnd}<br>
            實際工作天：${t.actualWorkingDays} 天<br>
            完成進度：${t.progress}%
          `;
          aBar.addEventListener('mouseenter', (e) => this.showTooltip(tip, e.clientX, e.clientY));
          aBar.addEventListener('mouseleave', () => this.hideTooltip());

          wrapper.appendChild(aBar);
        }
      }

      row.appendChild(wrapper);
      rowsContainer.appendChild(row);
    }

    canvas.appendChild(rowsContainer);
    panel.appendChild(canvas);
    return panel;
  }

  /**
   * Synchronize height between table row and timeline row
   */
  private syncRowHeights(): void {
    const tableRows = this.container.querySelectorAll<HTMLElement>('.task-row');
    tableRows.forEach((tRow) => {
      const id = tRow.getAttribute('data-task-id');
      const timeRow = this.container.querySelector<HTMLElement>(`[data-timeline-row-id="${id}"]`);
      if (timeRow) {
        const height = Math.max(52, tRow.offsetHeight);
        timeRow.style.height = `${height}px`;
      }
    });
  }

  /**
   * Auto-sync using ResizeObserver when text wraps or cell height changes
   */
  private setupHeightAutoSync(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const id = el.getAttribute('data-task-id');
        if (id) {
          const timeRow = this.container.querySelector<HTMLElement>(`[data-timeline-row-id="${id}"]`);
          if (timeRow) {
            const h = Math.max(52, el.offsetHeight);
            timeRow.style.height = `${h}px`;
          }
        }
      }
    });

    const tableRows = this.container.querySelectorAll<HTMLElement>('.task-row');
    tableRows.forEach((row) => this.resizeObserver?.observe(row));
  }

  private scrollToToday(): void {
    const todayLine = this.container.querySelector<HTMLElement>('#timeline-today-line');
    const panel = this.container.querySelector<HTMLElement>('#gantt-timeline-panel');
    if (todayLine && panel) {
      const left = parseInt(todayLine.style.left, 10) || 0;
      panel.scrollTo({ left: Math.max(0, left - 280), behavior: 'smooth' });
    }
  }

  // --- Actions ---

  private handleAddTask(): void {
    const today = formatDateUTC(Date.now());
    const nextWeek = formatDateUTC(Date.now() + 7 * 86400000);

    const newTask: Task = {
      id: `task_${Date.now()}`,
      name: '新專案工作項目',
      level: 0,
      plannedStart: today,
      plannedEnd: nextWeek,
      progress: 0,
    };

    this.state.tasks.push(newTask);
    this.markDirty();
  }

  private handleIndentTask(taskId: string): void {
    const idx = this.state.tasks.findIndex((t) => t.id === taskId);
    if (idx > 0) {
      const prev = this.state.tasks[idx - 1];
      if ((this.state.tasks[idx].level || 0) <= (prev.level || 0)) {
        this.state.tasks[idx].level = (this.state.tasks[idx].level || 0) + 1;
        this.markDirty();
      }
    }
  }

  private handleOutdentTask(taskId: string): void {
    const idx = this.state.tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0 && (this.state.tasks[idx].level || 0) > 0) {
      this.state.tasks[idx].level = (this.state.tasks[idx].level || 0) - 1;
      this.markDirty();
    }
  }

  private handleDeleteTask(taskId: string): void {
    if (confirm('確定要刪除此工作項目嗎？若有子項目亦將受到影響。')) {
      this.state.tasks = this.state.tasks.filter((t) => t.id !== taskId);
      this.markDirty();
    }
  }

  private handleSaveNick(): void {
    this.state.lastModified = new Date().toISOString();
    const content = generateNickFormat(this.state);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (this.state.projectName || 'gantt_project').replace(/[/\\?%*:|"<>]/g, '_');
    a.download = `${safeName}_${formatDateUTC(Date.now())}.nick`;
    a.click();
    URL.revokeObjectURL(url);

    this.isDirty = false;
    this.render();
  }

  private handleImportFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = parseNickFormat(text);
        this.state = parsed;
        this.isDirty = false;
        this.render();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`讀取專案失敗: ${msg}`);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  // --- Modals ---

  private renderHolidayModal(): void {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">📅 國定假日與補班日設定</h3>
          <button class="modal-close-btn" id="modal-close-x">✕</button>
        </div>
        <div class="modal-body">
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
            <h4 style="font-size: 13px; font-weight: 700; color: #1e3a8a; margin-bottom: 6px;">台灣政府行政院人事總處開放行事曆 (TaiwanCalendar)</h4>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <select id="sel-gov-year" style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
                <option value="2025">2025 年度</option>
                <option value="2026" selected>2026 年度</option>
                <option value="2027">2027 年度</option>
              </select>
              <button class="btn btn-primary btn-sm" id="btn-fetch-taiwan">⚡ 一鍵抓取政府開放行事曆</button>
              <span id="fetch-feedback" style="font-size: 12px; color: #475569;"></span>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">手動新增特定日期</h4>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <input type="date" id="input-hol-date" class="date-input" style="width: 140px;" />
              <input type="text" id="input-hol-name" placeholder="假日名稱（例如：廠慶、公司活動）" style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; flex: 1;" />
              <select id="input-hol-type" style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
                <option value="holiday">國定假日（放假不計工時）</option>
                <option value="makeup">補班日（週末視同上班日）</option>
              </select>
              <button class="btn btn-secondary btn-sm" id="btn-add-manual-hol">新增</button>
            </div>
          </div>

          <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">目前設定清單（共 ${this.state.holidays.length} 筆）</h4>
          <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; position: sticky; top: 0;">
                <tr>
                  <th style="padding: 6px 10px; text-align: left;">日期</th>
                  <th style="padding: 6px 10px; text-align: left;">名稱</th>
                  <th style="padding: 6px 10px; text-align: left;">屬性</th>
                  <th style="padding: 6px 10px; text-align: center;">操作</th>
                </tr>
              </thead>
              <tbody>
                ${this.state.holidays
                  .map(
                    (h, i) => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 10px; font-family: monospace;">${h.date}</td>
                    <td style="padding: 6px 10px;">${this.escapeHtml(h.name)}</td>
                    <td style="padding: 6px 10px;">
                      ${
                        h.isMakeup
                          ? `<span style="color: #b45309; font-weight: 600;">週末補班日</span>`
                          : `<span style="color: #dc2626; font-weight: 600;">國定假日</span>`
                      }
                    </td>
                    <td style="padding: 6px 10px; text-align: center;">
                      <button class="action-btn btn-delete" data-del-index="${i}">✕</button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="btn-close-hol-modal">完成並關閉</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
      this.activeModal = null;
      this.render();
    };

    modal.querySelector('#modal-close-x')?.addEventListener('click', closeModal);
    modal.querySelector('#btn-close-hol-modal')?.addEventListener('click', closeModal);

    // Delete holiday
    modal.querySelectorAll<HTMLButtonElement>('[data-del-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-del-index') || '0', 10);
        this.state.holidays.splice(idx, 1);
        this.markDirty();
        modal.remove();
        this.renderHolidayModal();
      });
    });

    // Add manual holiday
    modal.querySelector('#btn-add-manual-hol')?.addEventListener('click', () => {
      const dateInp = modal.querySelector<HTMLInputElement>('#input-hol-date');
      const nameInp = modal.querySelector<HTMLInputElement>('#input-hol-name');
      const typeInp = modal.querySelector<HTMLSelectElement>('#input-hol-type');

      const date = dateInp?.value;
      const name = nameInp?.value.trim() || '自訂休假日';
      const isMakeup = typeInp?.value === 'makeup';

      if (!date) {
        alert('請選擇日期');
        return;
      }

      this.state.holidays.push({ date, name, isMakeup });
      this.markDirty();
      modal.remove();
      this.renderHolidayModal();
    });

    // Fetch Government Calendar
    modal.querySelector('#btn-fetch-taiwan')?.addEventListener('click', async () => {
      const year = parseInt(modal.querySelector<HTMLSelectElement>('#sel-gov-year')?.value || '2026', 10);
      const feedback = modal.querySelector<HTMLElement>('#fetch-feedback');
      if (feedback) feedback.textContent = '同步連線中...';

      const result = await fetchTaiwanHolidays(year);
      const existingDates = new Set(this.state.holidays.map((h) => h.date));
      let added = 0;

      for (const h of result.holidays) {
        if (!existingDates.has(h.date)) {
          this.state.holidays.push(h);
          existingDates.add(h.date);
          added++;
        }
      }

      if (feedback) {
        feedback.textContent = `成功匯入 ${added} 筆假日資料（來源：${result.source}）`;
      }
      this.markDirty();
      setTimeout(() => {
        modal.remove();
        this.renderHolidayModal();
      }, 900);
    });
  }

  private renderMermaidModal(tasks: ComputedTask[]): void {
    const code = generateMermaidCode(tasks, this.state.projectName);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-dialog modal-xl">
        <div class="modal-header">
          <h3 class="modal-title">📊 Mermaid.js 甘特圖預覽與專案說明區塊</h3>
          <button class="modal-close-btn" id="modal-close-x">✕</button>
        </div>
        <div class="modal-body">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 18px; border-radius: 8px; margin-bottom: 16px;">
            <h4 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">📋 專案說明與範疇 (Project Documentation)</h4>
            <p style="font-size: 13px; color: #334155; margin-bottom: 8px;"><strong>專案名稱：</strong>${this.escapeHtml(this.state.projectName)}</p>
            <p style="font-size: 13px; color: #475569; line-height: 1.6;">
              ${this.escapeHtml(this.state.projectDescription || '本專案甘特圖採用 Mermaid.js 繪製標準時程，支援 GitHub、GitLab、Notion 及 Obsidian 語法。任務時程與父子項目彙總均由工作日與 WBS 演算法同步驗算。')}
            </p>
          </div>

          <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">Mermaid.js 即時視覺化繪製結果：</h4>
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin-bottom: 16px; overflow-x: auto; min-height: 220px;">
            <div id="mermaid-render-output" style="display: flex; justify-content: center;"></div>
          </div>

          <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 6px;">Mermaid 語法原始碼：</h4>
          <textarea id="mermaid-syntax-code" style="width: 100%; height: 110px; font-family: monospace; font-size: 12px; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc;" readonly>${code}</textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-copy-mermaid">📋 複製 Mermaid 語法</button>
          <button class="btn btn-primary" id="btn-close-mermaid">關閉</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
      this.activeModal = null;
    };

    modal.querySelector('#modal-close-x')?.addEventListener('click', closeModal);
    modal.querySelector('#btn-close-mermaid')?.addEventListener('click', closeModal);

    modal.querySelector('#btn-copy-mermaid')?.addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        alert('已成功複製 Mermaid 甘特圖語法至剪貼簿！');
      });
    });

    // Render Mermaid diagram
    const target = modal.querySelector<HTMLElement>('#mermaid-render-output');
    if (target) {
      try {
        const uniqueId = `mermaid_diag_${Date.now()}`;
        mermaid.render(uniqueId, code).then(({ svg }) => {
          target.innerHTML = svg;
        }).catch((err) => {
          target.innerHTML = `<p style="color: #ef4444; font-size: 12px;">Mermaid 渲染訊息: ${err.message}</p>`;
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        target.innerHTML = `<p style="color: #ef4444; font-size: 12px;">Mermaid 繪製異常: ${msg}</p>`;
      }
    }
  }

  private renderExportHtmlModal(): void {
    const htmlContent = generateStandaloneHTML(this.state);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-dialog modal-xl">
        <div class="modal-header">
          <h3 class="modal-title">📦 匯出單一獨立 .html 檔案（自包含隨開即用）</h3>
          <button class="modal-close-btn" id="modal-close-x">✕</button>
        </div>
        <div class="modal-body">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; border-radius: 8px; margin-bottom: 14px;">
            <p style="font-size: 13px; color: #166534; font-weight: 600;">
              ✓ 已將 HTML、CSS、Mermaid.js 與原生 JavaScript 整合在單一個完整的 .html 檔案中，完全無須額外伺服器或建置工具，雙擊即可在任何電腦瀏覽器直接執行。
            </p>
          </div>
          <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 6px;">獨立 HTML 預覽（可複製）：</h4>
          <textarea id="standalone-html-text" style="width: 100%; height: 260px; font-family: monospace; font-size: 11px; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc;" readonly>${this.escapeHtml(htmlContent)}</textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-copy-html">📋 複製 HTML 原始碼</button>
          <button class="btn btn-success" id="btn-download-html">📥 下載 .html 檔案</button>
          <button class="btn btn-primary" id="btn-close-export">關閉</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
      this.activeModal = null;
    };

    modal.querySelector('#modal-close-x')?.addEventListener('click', closeModal);
    modal.querySelector('#btn-close-export')?.addEventListener('click', closeModal);

    modal.querySelector('#btn-copy-html')?.addEventListener('click', () => {
      navigator.clipboard.writeText(htmlContent).then(() => {
        alert('已成功複製單一獨立 HTML 檔案原始碼！可直接貼上存成 .html 執行。');
      });
    });

    modal.querySelector('#btn-download-html')?.addEventListener('click', () => {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.state.projectName || 'gantt'}_standalone.html`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // --- Utilities ---

  private createButton(text: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `btn ${className}`;
    btn.innerHTML = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
