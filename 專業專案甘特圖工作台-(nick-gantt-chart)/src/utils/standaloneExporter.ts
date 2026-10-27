import { GanttProjectState, generateMermaidCode, computeGanttHierarchy } from './ganttLogic';

/**
 * Generates a clean standalone HTML template for offline execution
 */
export function generateStandaloneHTML(state: GanttProjectState): string {
  const jsonState = JSON.stringify(state).replace(/<\/script>/gi, '<\\/script>');
  const computed = computeGanttHierarchy(state.tasks, state.holidays);
  const mermaidCode = generateMermaidCode(computed, state.projectName);

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${state.projectName || '專案甘特圖工作台'}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    :root {
      --primary: #2563eb; --planned: #4f46e5; --actual: #16a34a; --parent: #1e293b;
      --weekend: #f1f5f9; --holiday: #fee2e2; --makeup: #fef3c7; --today: #f97316;
      --cell-w: 36px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #fff; border-bottom: 1px solid #cbd5e1; gap: 10px; flex-wrap: wrap; }
    .btn { padding: 6px 12px; font-size: 13px; font-weight: 500; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
    .btn-primary { background: var(--primary); color: #fff; border-color: var(--primary); }
    .infobar { display: flex; gap: 16px; padding: 8px 20px; background: #f1f5f9; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .main { display: flex; height: calc(100vh - 100px); overflow: hidden; background: #fff; }
    .table-panel { width: 620px; flex-shrink: 0; border-right: 2px solid #cbd5e1; overflow: auto; }
    .timeline-panel { flex: 1; overflow: auto; position: relative; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px; text-align: left; }
    th { background: #f8fafc; position: sticky; top: 0; z-index: 10; }
    .parent-row { background: #f8fafc; font-weight: bold; }
    .wbs-tag { background: #e2e8f0; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
    .bar { position: absolute; height: 16px; border-radius: 4px; font-size: 10px; display: flex; align-items: center; color: #fff; overflow: hidden; }
    .bar-planned { top: 6px; background: #e0e7ff; border: 1px solid #6366f1; color: #1e1b4b; }
    .bar-actual { bottom: 6px; background: #dcfce7; border: 1px solid #22c55e; color: #064e3b; }
    .bar-fill { height: 100%; }
    .bar-planned .bar-fill { background: var(--planned); }
    .bar-actual .bar-fill { background: var(--actual); }
    .bar-parent { top: 12px; height: 20px; background: var(--parent); }
    .time-row { position: relative; height: 48px; border-bottom: 1px solid #e2e8f0; }
    .day-cell { width: var(--cell-w); min-width: var(--cell-w); display: inline-flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid #e2e8f0; height: 32px; font-size: 10px; }
    .weekend { background: var(--weekend); }
    .holiday { background: var(--holiday); color: #dc2626; font-weight: bold; }
    .makeup { background: var(--makeup); color: #d97706; font-weight: bold; }
    .today-line { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--today); z-index: 20; pointer-events: none; }
    @media print {
      @page { size: A3 landscape; margin: 8mm; }
      .toolbar, .btn { display: none !important; }
      .main { height: auto !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h2 id="proj-title">${state.projectName || '專案甘特圖'}</h2>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="window.print()">🖨️ A3 列印</button>
      <button class="btn" onclick="saveNick()">💾 儲存 .nick</button>
      <button class="btn" onclick="showMermaid()">📊 Mermaid 圖表</button>
    </div>
  </div>
  <div class="infobar">
    <div><strong>任務數：</strong>${computed.length}</div>
    <div><strong>時程基準：</strong>UTC 安全計算 (排除週末與假日)</div>
  </div>
  <div class="main">
    <div class="table-panel">
      <table>
        <thead>
          <tr>
            <th style="width:50px">WBS</th>
            <th>任務名稱</th>
            <th style="width:85px">預計開始</th>
            <th style="width:85px">預計結束</th>
            <th style="width:45px">工天</th>
            <th style="width:45px">進度</th>
          </tr>
        </thead>
        <tbody>
          ${computed.map(t => `
            <tr class="${t.isParent ? 'parent-row' : ''}">
              <td><span class="wbs-tag">${t.wbs}</span></td>
              <td style="padding-left:${(t.level || 0) * 16 + 6}px">${t.name}</td>
              <td>${t.plannedStart || '-'}</td>
              <td>${t.plannedEnd || '-'}</td>
              <td>${t.plannedWorkingDays}</td>
              <td>${t.progress}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="timeline-panel" id="timeline-container">
      <div style="padding: 10px; font-size: 13px; color: #64748b;">
        請在支援 JS 的瀏覽器環境檢視完整動態時間軸。
      </div>
    </div>
  </div>

  <div id="mermaid-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:999;">
    <div style="background:#fff;padding:20px;border-radius:12px;width:90%;max-width:800px;max-height:85vh;overflow:auto;">
      <h3>📊 Mermaid.js 甘特圖</h3>
      <div id="mermaid-target" style="margin:15px 0;"></div>
      <button class="btn btn-primary" onclick="document.getElementById('mermaid-modal').style.display='none'">關閉</button>
    </div>
  </div>

  <script>
    var projectData = ${jsonState};
    var mermaidSyntax = ${JSON.stringify(mermaidCode)};

    function saveNick() {
      var blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (projectData.projectName || 'project') + '.nick';
      a.click();
    }

    function showMermaid() {
      var modal = document.getElementById('mermaid-modal');
      modal.style.display = 'flex';
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false });
        window.mermaid.render('mermaid-svg-chart', mermaidSyntax).then(function(res) {
          document.getElementById('mermaid-target').innerHTML = res.svg;
        });
      }
    }
  </script>
</body>
</html>`;
}
