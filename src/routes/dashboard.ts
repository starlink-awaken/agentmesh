import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Mesh Gateway</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',monospace;background:#0d1117;color:#c9d1d9;min-height:100vh}
.header{background:#161b22;border-bottom:1px solid #30363d;padding:16px 24px;display:flex;align-items:center;gap:12px}
.header h1{font-size:18px;color:#58a6ff}.header .sub{color:#8b949e;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;padding:24px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
.card h2{font-size:13px;color:#8b949e;text-transform:uppercase;margin-bottom:12px;letter-spacing:.5px}
.stat-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #21262d;font-size:13px}
.stat-val{color:#58a6ff;font-weight:600}.stat-good{color:#3fb950}.stat-warn{color:#d29922}.stat-bad{color:#f85149}
.agent-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px}
.agent-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.dot-online{background:#3fb950}.dot-offline{background:#484f58}
.bar{height:4px;border-radius:2px;background:#21262d;margin-top:8px;overflow:hidden}
.bar-fill{height:100%;border-radius:2px;transition:width .5s}
.refresh{color:#8b949e;font-size:11px;text-align:right;margin-top:8px}
.task-row{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;border-bottom:1px solid #21262d}
</style>
</head>
<body>
<div class="header">
  <div style="font-size:24px">⬡</div>
  <div><h1>Agent Mesh Gateway</h1><div class="sub">Multi-Agent Scheduler & Router</div></div>
</div>
<div class="grid">
  <div class="card"><h2>Gateway Status</h2>
    <div class="stat-row"><span>Status</span><span class="stat-good" id="gw-status">-</span></div>
    <div class="stat-row"><span>Uptime</span><span class="stat-val" id="gw-uptime">-</span></div>
    <div class="stat-row"><span>Agents Online</span><span class="stat-val" id="gw-agents">-</span></div>
    <div class="stat-row"><span>Model Providers</span><span class="stat-val" id="gw-models">-</span></div>
  </div>
  <div class="card"><h2>Tasks</h2>
    <div class="stat-row"><span>Pending</span><span class="stat-warn" id="t-pending">-</span></div>
    <div class="stat-row"><span>Running</span><span class="stat-val" id="t-running">-</span></div>
    <div class="stat-row"><span>Completed</span><span class="stat-good" id="t-completed">-</span></div>
    <div class="stat-row"><span>Failed</span><span class="stat-bad" id="t-failed">-</span></div>
    <div class="bar"><div class="bar-fill" id="t-bar" style="width:0;background:#3fb950"></div></div>
  </div>
  <div class="card"><h2>Agents</h2><div id="agent-list"></div></div>
  <div class="card"><h2>Circuit Breakers</h2><div id="cb-list"></div></div>
  <div class="card"><h2>Recent Tasks</h2><div id="recent-tasks"></div></div>
  <div class="card"><h2>Provider Health</h2><div id="provider-health"></div></div>
</div>
<div class="refresh" id="refresh-time"></div>
<script>
async function refresh() {
  try {
    const r = await fetch('/v1/health/detailed');
    const d = await r.json();
    document.getElementById('gw-status').textContent = d.status || '-';
    document.getElementById('gw-uptime').textContent = (d.uptime_seconds || 0) + 's';
    document.getElementById('gw-agents').textContent = (d.agents?.online||0) + '/' + (d.agents?.total||0);
    document.getElementById('gw-models').textContent = d.models?.total || 0;
    const t = d.tasks||{};
    document.getElementById('t-pending').textContent = t.pending||0;
    document.getElementById('t-running').textContent = t.running||0;
    document.getElementById('t-completed').textContent = t.completed||0;
    document.getElementById('t-failed').textContent = t.failed||0;
    const total = (t.completed||0)+(t.failed||0)+(t.pending||0)+(t.running||0)||1;
    document.getElementById('t-bar').style.width = ((t.completed||0)/total*100)+'%';

    const cb = d.circuit_breakers||{};
    const cbList = Object.entries(cb).map(([k,v]) =>
      '<div class="stat-row"><span>'+k+'</span><span class="'+(v.state==='CLOSED'?'stat-good':'stat-bad')+'">'+v.state+' ('+(v.failures||0)+')</span></div>'
    ).join('') || '<div class="stat-row"><span>-</span><span class="stat-val">none</span></div>';
    document.getElementById('cb-list').innerHTML = cbList;

    const agents = d.config?.model_providers||[];
    document.getElementById('provider-health').innerHTML = agents.map(p =>
      '<div class="agent-row"><div class="agent-dot dot-online"></div>'+p+'</div>'
    ).join('') || '<div class="stat-row">none</div>';

    try {
      const tr = await fetch('/v1/tasks');
      const tasks = await tr.json();
      document.getElementById('recent-tasks').innerHTML = tasks.slice(0,8).map(t =>
        '<div class="task-row">' +
        '<span>'+(t.status==='completed'?'✅':t.status==='running'?'🔄':t.status==='failed'?'❌':'🕐')+'</span>'+
        '<span style="flex:1">'+t.id.slice(0,8)+'</span>'+
        '<span style="color:#8b949e">'+t.status+'</span>'+
        '</div>'
      ).join('') || '<div class="stat-row">no tasks</div>';
    } catch(e) {}

    const atr = await fetch('/v1/agents');
    const agts = await atr.json();
    document.getElementById('agent-list').innerHTML = agts.map(a =>
      '<div class="agent-row">'+
      '<div class="agent-dot '+(a.status==='online'?'dot-online':'dot-offline')+'"></div>'+
      '<span style="flex:1">'+a.name+'</span>'+
      '<span style="color:#8b949e">'+(a.capabilities||[]).slice(0,2).join(', ')+'</span>'+
      '</div>'
    ).join('');

    document.getElementById('refresh-time').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch(e) { document.getElementById('gw-status').textContent = 'offline'; document.getElementById('gw-status').className = 'stat-val stat-bad'; }
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.send(DASHBOARD_HTML);
  });
}
