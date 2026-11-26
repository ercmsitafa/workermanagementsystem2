import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, BriefcaseBusiness, CalendarCheck, ChartNoAxesCombined, Download,
  Check, ChevronDown, CircleHelp, Clock3, Command, FileBarChart, LayoutDashboard,
  LogOut, Menu, Moon, Plus, Search, Settings, ShieldCheck, Sun, Users, Wallet,
  X, RefreshCw, ArrowUpRight, Building2, SlidersHorizontal, Sparkles, Eye, Pencil, UserRound
} from 'lucide-react';
import { apiRequest, downloadFile, getToken, signIn, signOut } from './api';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, key: 'overview' },
  { label: 'Workers', icon: Users, key: 'workers' },
  { label: 'Departments', icon: Building2, key: 'departments' },
  { label: 'Attendance', icon: CalendarCheck, key: 'attendance' },
  { label: 'Salaries', icon: Wallet, key: 'salaries' },
  { label: 'Reports', icon: FileBarChart, key: 'reports' }
];

const money = value => new Intl.NumberFormat('en-RW', {
  style: 'currency', currency: 'RWF', maximumFractionDigits: 0
}).format(Number(value || 0));

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onLogin(username, password); }
    catch (err) { setError(err.message || 'Unable to sign in'); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <div className="login-art">
      <div className="brand-mark"><BriefcaseBusiness size={23}/></div>
      <span className="eyebrow">WORKFORCE MANAGEMENT</span>
      <h1>People make<br/><em>the progress.</em></h1>
      <p>One clear workspace to manage your people, attendance and performance.</p>
      <div className="login-art-footer"><ShieldCheck size={16}/> Secure workforce workspace</div>
    </div>
    <form className="login-card" onSubmit={submit}>
      <span className="eyebrow">WELCOME BACK</span><h2>Sign in to your workspace</h2>
      <p className="muted">Enter your account details to continue.</p>
      <label>Username or email<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Your username" required/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" required/></label>
      {error && <div className="inline-error">{error}</div>}
      <button className="primary-btn full-btn" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowUpRight size={17}/></button>
      <p className="login-note">Use an account already registered in your Worker Management API.</p>
    </form>
  </main>;
}

function StatCard({ title, value, note, icon: Icon, tone }) {
  return <article className="stat-card">
    <div className="stat-top"><span>{title}</span><span className={'stat-icon '+tone}><Icon size={19}/></span></div>
    <strong>{value}</strong><small>{note}</small>
  </article>;
}

function App() {
  const [token, setToken] = useState(getToken());
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [workerTotal, setWorkerTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [positionFilter, setPositionFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [profileWorker, setProfileWorker] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('wms_theme') !== 'light');
  const [notice, setNotice] = useState('');
  const [settingsState, setSettingsState] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [form, setForm] = useState({ first_name:'', last_name:'', email:'', phone:'', position:'', salary:'', status:'active' });

  async function loadUser() {
    const result = await apiRequest('/auth/me');
    setUser(result.data);
  }
  async function loadSettings() {
    setSettingsLoading(true);
    try {
      await apiRequest('/settings/init', { method:'POST' });
      const result = await apiRequest('/settings');
      setSettingsState(result.data || {});
      setAutoRefresh(Boolean(result.data?.auto_refresh));
    } finally { setSettingsLoading(false); }
  }
  async function saveSettings(values) {
    const entries = Object.entries(values);
    for (const [key, value] of entries) {
      const type = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
      await apiRequest('/settings', { method:'PUT', body:JSON.stringify({ key, value, type }) });
    }
    setSettingsState(values);
    setAutoRefresh(Boolean(values.auto_refresh));
    setNotice('Settings saved successfully.');
  }
  async function loadDashboard() {
    const result = await apiRequest('/dashboard');
    setDashboard(result.data);
  }
  async function loadWorkers() {
    const params = new URLSearchParams({ page:'1', limit:'100', search:query, sortBy, sortOrder });
    if (positionFilter.trim()) params.set('position',positionFilter.trim());
    if (status !== 'all') params.set('status', status);
    const result = await apiRequest('/workers?'+params.toString());
    setWorkers(result.data?.workers || []);
    setWorkerTotal(Number(result.data?.pagination?.total || 0));
  }
  async function refresh() {
    if (!getToken()) return;
    setLoading(true); setError('');
    try {
      await loadUser();
      await Promise.all([loadDashboard(), loadWorkers()]);
    } catch (err) { setError(err.message || 'Could not load data'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (token) refresh(); }, [token]);
  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => loadWorkers().catch(err=>setError(err.message)), 250);
      return () => clearTimeout(timer);
    }
  }, [query, status, positionFilter, sortBy, sortOrder]);
  useEffect(() => {
    if (token && page === 'settings' && user?.role === 'admin') loadSettings().catch(err=>setNotice(err.message));
  }, [page, token, user?.role]);
  useEffect(() => {
    if (!token || !autoRefresh) return;
    const timer = setInterval(() => refresh(), 60000);
    return () => clearInterval(timer);
  }, [token, autoRefresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('wms_theme', dark ? 'dark' : 'light');
  }, [dark]);

  async function handleLogin(username, password) {
    const data = await signIn(username, password);
    setUser(data.user); setToken(data.token);
  }
  function handleLogout() { signOut(); setToken(null); setUser(null); setDashboard(null); }
  async function exportWorkers() {
    setExportBusy(true);
    try { await downloadFile('/export/workers/excel', 'workers.xlsx'); setNotice('Worker export downloaded.'); }
    catch (err) { setNotice(err.message || 'Export failed'); }
    finally { setExportBusy(false); }
  }
  async function exportSummary() {
    setExportBusy(true);
    try { await downloadFile('/export/report/pdf?type=summary', 'workforce-summary.pdf'); setNotice('PDF report downloaded.'); }
    catch (err) { setNotice(err.message || 'Export failed'); }
    finally { setExportBusy(false); }
  }
  async function openWorkerProfile(worker) {
    setProfileLoading(true); setProfileWorker({ ...worker, loading:true });
    try { const result = await apiRequest('/workers/'+worker.id); setProfileWorker(result.data); }
    catch (err) { setNotice(err.message || 'Could not load worker profile'); setProfileWorker(null); }
    finally { setProfileLoading(false); }
  }
  async function saveWorkerEdit(event) {
    event.preventDefault();
    try {
      await apiRequest('/workers/'+editingWorker.id, { method:'PUT', body:JSON.stringify({
        first_name:editingWorker.first_name, last_name:editingWorker.last_name,
        email:editingWorker.email, phone:editingWorker.phone, address:editingWorker.address,
        position:editingWorker.position, salary:Number(editingWorker.salary||0), status:editingWorker.status
      })});
      setEditingWorker(null); setNotice('Worker profile updated.');
      await Promise.all([loadWorkers(),loadDashboard()]);
    } catch(err) { setNotice(err.message||'Unable to update worker'); }
  }
  async function createWorker(event) {
    event.preventDefault();
    try {
      await apiRequest('/workers', { method:'POST', body:JSON.stringify({
        ...form, salary:Number(form.salary || 0)
      })});
      setShowAdd(false);
      setForm({ first_name:'', last_name:'', email:'', phone:'', position:'', salary:'', status:'active' });
      setNotice('Worker added successfully');
      await Promise.all([loadWorkers(), loadDashboard()]);
    } catch (err) { setNotice(err.message); }
  }

  const visibleWorkers = useMemo(() => workers, [workers]);
  const stats = dashboard?.workers || {};
  const attendance = dashboard?.today_attendance || {};
  const attendancePct = Number(dashboard?.attendance_rate?.rate || 0);
  const title = navigation.find(item=>item.key===page)?.label || 'Settings';

  if (!token) return <Login onLogin={handleLogin}/>;

  return <div className="app-shell">
    <aside className={'sidebar '+(mobileNav?'sidebar-open':'')}>
      <div className="sidebar-brand"><div className="brand-mark"><BriefcaseBusiness size={21}/></div><div><b>Workforce</b><small>MANAGEMENT SYSTEM</small></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{navigation.map(item=><button key={item.key} className={'nav-link '+(page===item.key?'active':'')} onClick={()=>{setPage(item.key);setMobileNav(false);}}><item.icon size={18}/><span>{item.label}</span>{item.key==='workers'&&<small>{workerTotal}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><Sparkles size={17}/><b>Stay in control</b><p>Keep your workforce information up to date.</p></div>
        <button className={'nav-link '+(page==='settings'?'active':'')} onClick={()=>setPage('settings')}><Settings size={18}/>Settings</button>
        <div className="profile-row"><div className="avatar">{(user?.username||'U').slice(0,1).toUpperCase()}</div><div className="profile-info"><b>{user?.username||'User'}</b><small>{user?.role||'Member'}</small></div><button className="icon-btn" title="Sign out" onClick={handleLogout}><LogOut size={17}/></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn menu-btn" onClick={()=>setMobileNav(true)}><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <b>{title}</b></div></div>
        <div className="topbar-actions"><div className="api-status"><span/> API workspace</div><button className="icon-btn" title="Toggle theme" onClick={()=>setDark(v=>!v)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-btn" title="Refresh data" onClick={refresh}><RefreshCw size={17} className={loading?'spin':''}/></button><div className="top-avatar">{(user?.username||'U').slice(0,1).toUpperCase()}</div></div>
      </header>

      <section className="page-content">
        <div className="page-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>{page==='overview'?'Good to see you, '+(user?.username||'there') : title}</h1><p>{page==='overview'?'Here is what is happening across your workforce today.':'Manage and review your workforce information.'}</p></div><div className="heading-actions"><span className="date-chip"><Clock3 size={15}/>{new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</span>{page==='workers'&&<button className="primary-btn" onClick={()=>setShowAdd(true)}><Plus size={17}/> Add worker</button>}</div></div>

        {error&&<div className="error-banner"><span>{error}</span><button onClick={refresh}>Try again</button></div>}
        {notice&&<div className="notice-banner">{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}

        {page==='overview'&&<>
          <div className="stats-grid">
            <StatCard title="Total workers" value={stats.total??'—'} note={(stats.active??0)+' active team members'} icon={Users} tone="blue"/>
            <StatCard title="Present today" value={attendance.present??'—'} note={(attendance.absent??0)+' absent · '+(attendance.leave??0)+' on leave'} icon={CalendarCheck} tone="green"/>
            <StatCard title="Attendance rate" value={attendancePct+'%'} note="Based on recent 30-day records" icon={ChartNoAxesCombined} tone="purple"/>
            <StatCard title="Average salary" value={stats.avg_salary!=null?money(stats.avg_salary):'—'} note="Across recorded workers" icon={Wallet} tone="orange"/>
          </div>
          <div className="dashboard-grid">
            <article className="panel attendance-panel"><div className="panel-heading"><div><h3>Attendance overview</h3><p>Latest 7-day attendance records</p></div><span className="soft-tag">Weekly</span></div>
              <div className="attendance-summary"><div className="donut" style={{'--progress':attendancePct+'%'}}><div><b>{attendancePct}%</b><small>Present</small></div></div><div className="legend"><span><i className="dot green-dot"/>Present <b>{attendance.present??0}</b></span><span><i className="dot red-dot"/>Absent <b>{attendance.absent??0}</b></span><span><i className="dot yellow-dot"/>On leave <b>{attendance.leave??0}</b></span></div></div>
              <div className="mini-bars">{(dashboard?.weekly_attendance||[]).map((day,i)=><div className="bar-column" key={i}><div className="bar-track"><div className="bar-fill" style={{height:Math.max(5,Number(day.total?day.present/day.total*100:0))+'%'}}/></div><small>{new Date(day.date).toLocaleDateString(undefined,{weekday:'short'})}</small></div>)}{!dashboard?.weekly_attendance?.length&&<p className="empty-hint">Weekly attendance will appear when records are available.</p>}</div>
            </article>
            <article className="panel departments-panel"><div className="panel-heading"><div><h3>Department distribution</h3><p>Active workers by department</p></div><Building2 size={19}/></div>
              {(dashboard?.departments||[]).slice(0,6).map((d,i)=>{const max=Math.max(1,...(dashboard?.departments||[]).map(x=>Number(x.worker_count||0)));return <div className="department-row" key={d.name}><div><span>{d.name}</span><b>{d.worker_count}</b></div><div className="progress-track"><i style={{width:(Number(d.worker_count||0)/max*100)+'%'}}/></div></div>})}
              {!dashboard?.departments?.length&&<p className="empty-hint">Department information will appear here.</p>}
            </article>
          </div>
          <article className="panel recent-panel"><div className="panel-heading"><div><h3>Recently added workers</h3><p>Your latest team members</p></div><button className="text-btn" onClick={()=>setPage('workers')}>View all <ArrowUpRight size={15}/></button></div><WorkerTable rows={(dashboard?.recent_workers||[])} compact onView={openWorkerProfile}/></article>
        </>}

        {page==='workers'&&<article className="panel workers-panel"><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Search name, email or phone…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</div><div className="filter-control"><SlidersHorizontal size={16}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div><input className="position-filter" placeholder="Filter position" value={positionFilter} onChange={e=>setPositionFilter(e.target.value}/><select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="created_at">Newest</option><option value="first_name">First name</option><option value="last_name">Last name</option><option value="salary">Salary</option><option value="date_hired">Hire date</option></select><button className="secondary-btn sort-direction" onClick={()=>setSortOrder(o=>o==='ASC'?'DESC':'ASC')}>{sortOrder==='ASC'?'Ascending ↑':'Descending ↓'}</button><span className="results-count">{workerTotal} workers</span><button className="secondary-btn export-btn" onClick={exportWorkers} disabled={exportBusy}><Download size={15}/>{exportBusy?'Preparing…':'Export Excel'}</button></div><WorkerTable rows={visibleWorkers} onView={openWorkerProfile} onEdit={worker=>setEditingWorker({...worker,salary:worker.salary??0})}/></article>}

        {page==='departments'&&<article className="panel"><div className="panel-heading"><div><h3>Departments</h3><p>Workforce distribution across your organization</p></div></div><div className="department-cards">{(dashboard?.departments||[]).map(d=><div className="department-card" key={d.name}><Building2/><b>{d.name}</b><strong>{d.worker_count}</strong><small>Active workers</small></div>)}</div>{!dashboard?.departments?.length&&<p className="empty-hint">No department data available yet.</p>}</article>}

        {page==='attendance'&&<article className="panel"><div className="panel-heading"><div><h3>Attendance summary</h3><p>Today's attendance from your connected API</p></div><CalendarCheck/></div><div className="stats-grid inner-stats"><StatCard title="Present" value={attendance.present??'—'} note="Marked present" icon={Check} tone="green"/><StatCard title="Absent" value={attendance.absent??'—'} note="Marked absent" icon={X} tone="orange"/><StatCard title="On leave" value={attendance.leave??'—'} note="Approved leave" icon={Clock3} tone="purple"/></div><p className="muted">Attendance entries can be viewed and managed through the existing API. This dashboard currently displays the summary endpoint.</p></article>}

        {page==='salaries'&&<article className="panel"><div className="panel-heading"><div><h3>Salary overview</h3><p>Current month totals from dashboard records</p></div><Wallet/></div><div className="stats-grid inner-stats"><StatCard title="Base salary" value={dashboard?.salaries?.total_base!=null?money(dashboard.salaries.total_base):'—'} note="Monthly base total" icon={Wallet} tone="blue"/><StatCard title="Deductions" value={dashboard?.salaries?.total_deductions!=null?money(dashboard.salaries.total_deductions):'—'} note="Recorded deductions" icon={Activity} tone="orange"/><StatCard title="Net salary" value={dashboard?.salaries?.total_net!=null?money(dashboard.salaries.total_net):'—'} note="Monthly net total" icon={BriefcaseBusiness} tone="green"/></div></article>}

        {page==='reports'&&<article className="panel"><div className="panel-heading"><div><h3>Workforce reports</h3><p>Summary of available dashboard metrics</p></div><FileBarChart/></div><div className="report-actions"><button className="secondary-btn" onClick={exportWorkers} disabled={exportBusy}><Download size={16}/> Export workers (Excel)</button><button className="primary-btn" onClick={exportSummary} disabled={exportBusy}><Download size={16}/> Export summary (PDF)</button></div><div className="report-list"><div><span>Registered workers</span><b>{stats.total??'—'}</b></div><div><span>Active workers</span><b>{stats.active??'—'}</b></div><div><span>Attendance rate</span><b>{attendancePct}%</b></div><div><span>Average salary</span><b>{stats.avg_salary!=null?money(stats.avg_salary):'—'}</b></div></div><p className="muted">Detailed report exports can be connected to the existing export endpoints in the next integration pass.</p></article>}

        {page==='settings'&&<SettingsPage dark={dark} setDark={setDark} user={user} settings={settingsState} setSettings={setSettingsState} settingsLoading={settingsLoading} saveSettings={saveSettings} loadSettings={loadSettings} autoRefresh={autoRefresh} setAutoRefresh={setAutoRefresh}/ >}
        <footer className="page-footer"><span>Workforce Management System</span><span>Built to help your team work smarter.</span></footer>
      </section>
    </main>

    {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    {editingWorker&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditingWorker(null);}}><form className="modal-card" onSubmit={saveWorkerEdit}><div className="modal-heading"><div><span className="eyebrow">EMPLOYEE MANAGEMENT</span><h2>Edit worker</h2></div><button type="button" className="icon-btn" onClick={()=>setEditingWorker(null)}><X/></button></div><div className="form-grid">{[['first_name','First name'],['last_name','Last name'],['email','Email address'],['phone','Phone number'],['address','Address'],['position','Job position'],['salary','Salary (RWF)']].map(([key,label])=><label key={key}>{label}<input required={['first_name','last_name','email'].includes(key)} type={key==='email'?'email':key==='salary'?'number':'text'} min={key==='salary'?'0':undefined} value={editingWorker[key]??''} onChange={e=>setEditingWorker({...editingWorker,[key]:e.target.value})}/></label>)}</div><label>Status<select value={editingWorker.status||'active'} onChange={e=>setEditingWorker({...editingWorker,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setEditingWorker(null)}>Cancel</button><button className="primary-btn"><Check size={16}/> Save changes</button></div></form></div>}
    {profileWorker&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setProfileWorker(null);}}><section className="modal-card profile-modal"><div className="modal-heading"><div><span className="eyebrow">EMPLOYEE PROFILE</span><h2>{profileWorker.first_name} {profileWorker.last_name}</h2></div><button className="icon-btn" onClick={()=>setProfileWorker(null)}><X/></button></div><div className="profile-hero"><div className="worker-avatar large-avatar"><UserRound/></div><div><h3>{profileWorker.first_name} {profileWorker.last_name}</h3><p>{profileWorker.position||'Position not set'} · {profileWorker.department_name||'Unassigned department'}</p><span className={'status-pill '+(profileWorker.status||'active')}><i/>{profileWorker.status||'active'}</span></div></div>{profileLoading?<p className="muted">Loading profile…</p>:<><div className="profile-details-grid">{[['Email',profileWorker.email],['Phone',profileWorker.phone],['Address',profileWorker.address],['Salary',money(profileWorker.salary)],['Date hired',profileWorker.date_hired?new Date(profileWorker.date_hired).toLocaleDateString():'—'],['Worker ID',profileWorker.id]].map(([label,value])=><div key={label}><small>{label}</small><b>{value||'—'}</b></div>)}</div><h4>Recent attendance</h4>{profileWorker.recent_attendance?.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th></tr></thead><tbody>{profileWorker.recent_attendance.map((a,i)=><tr key={a.id||i}><td>{a.date||'—'}</td><td>{a.status||'—'}</td><td>{a.check_in||'—'}</td><td>{a.check_out||'—'}</td></tr>)}</tbody></table></div>:<p className="empty-hint">No attendance records found.</p>}<h4>Salary history</h4>{profileWorker.salary_history?.length?<div className="table-wrap"><table><thead><tr><th>Month</th><th>Base</th><th>Net</th></tr></thead><tbody>{profileWorker.salary_history.map((s,i)=><tr key={s.id||i}><td>{s.month||'—'}</td><td>{money(s.base_salary??s.salary)}</td><td>{money(s.net_salary??s.net)}</td></tr>)}</tbody></table></div>:<p className="empty-hint">No salary history found.</p>}</>}</section></div>}
    {showAdd&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false);}}><form className="modal-card" onSubmit={createWorker}><div className="modal-heading"><div><span className="eyebrow">TEAM MANAGEMENT</span><h2>Add a worker</h2></div><button type="button" className="icon-btn" onClick={()=>setShowAdd(false)}><X/></button></div><div className="form-grid">{[['first_name','First name'],['last_name','Last name'],['email','Email address'],['phone','Phone number'],['position','Job position'],['salary','Salary (RWF)']].map(([key,label])=><label key={key}>{label}<input required={['first_name','last_name','email'].includes(key)} type={key==='email'?'email':key==='salary'?'number':'text'} min={key==='salary'?'0':undefined} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={label}/></label>)}</div><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowAdd(false)}>Cancel</button><button className="primary-btn"><Plus size={16}/> Save worker</button></div></form></div>}
  </div>;
}

function SettingsPage({ dark, setDark, user, settings, setSettings, settingsLoading, saveSettings, loadSettings, autoRefresh, setAutoRefresh }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const isAdmin = user?.role === 'admin';
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault(); setSaving(true);
    try { await saveSettings(draft); }
    catch (error) { alert(error.message || 'Could not save settings'); }
    finally { setSaving(false); }
  }
  return <article className="panel settings-panel">
    <div className="panel-heading"><div><h3>System control center</h3><p>Organization profile, operational rules, appearance and live workspace preferences.</p></div><Settings/></div>
    <div className="setting-row"><div><b>Dark appearance</b><small>Applies immediately across the workspace.</small></div><button className={'toggle '+(dark?'on':'')} onClick={()=>setDark(v=>!v)} aria-label="Toggle dark appearance"><i/></button></div>
    <div className="setting-row"><div><b>Automatic dashboard refresh</b><small>Refresh statistics every minute while the session is open.</small></div><button className={'toggle '+(autoRefresh?'on':'')} onClick={()=>setAutoRefresh(v=>{const next=!v;setDraft(prev=>({...prev,auto_refresh:next}));return next;}} aria-label="Toggle automatic refresh"><i/></button></div>
    <div className="setting-row"><div><b>Account & access</b><small>{user?.email||user?.username||'Authenticated user'} · {user?.role||'member'}</small></div><ShieldCheck className="success-icon"/></div>
    {isAdmin ? <form className="admin-settings-form" onSubmit={submit}>
      <div className="settings-section"><div><h4>Organization profile</h4><p>Brand and contact details used across the system.</p></div><div className="settings-grid">
        <label>Organization name<input value={draft.company_name||''} onChange={e=>change('company_name',e.target.value)} placeholder="Company name"/></label>
        <label>Contact email<input type="email" value={draft.company_email||''} onChange={e=>change('company_email',e.target.value)} placeholder="hr@company.com"/></label>
        <label>Contact phone<input value={draft.company_phone||''} onChange={e=>change('company_phone',e.target.value)} placeholder="+250…"/></label>
        <label>Location / address<input value={draft.company_address||''} onChange={e=>change('company_address',e.target.value)} placeholder="Organization address"/></label>
      </div></div>
      <div className="settings-section"><div><h4>Work rules</h4><p>Set baseline values used by HR workflows.</p></div><div className="settings-grid">
        <label>Daily working hours<input type="number" min="1" max="24" value={draft.working_hours??8} onChange={e=>change('working_hours',Number(e.target.value))}/></label>
        <label>Annual leave days<input type="number" min="0" max="365" value={draft.leave_annual_default??15} onChange={e=>change('leave_annual_default',Number(e.target.value))}/></label>
        <label>Sick leave days<input type="number" min="0" max="365" value={draft.leave_sick_default??10} onChange={e=>change('leave_sick_default',Number(e.target.value))}/></label>
        <label>Currency<select value={draft.currency||'RWF'} onChange={e=>change('currency',e.target.value)}><option>RWF</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
        <label>Date format<select value={draft.date_format||'YYYY-MM-DD'} onChange={e=>change('date_format',e.target.value)}><option>YYYY-MM-DD</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option></select></label>
        <label>Max leave balance<input type="number" min="0" value={draft.max_leave_balance??30} onChange={e=>change('max_leave_balance',Number(e.target.value))}/></label>
      </div></div>
      <div className="settings-section"><div><h4>Policies & notifications</h4><p>Control workflow options and operational safety.</p></div>{[['weekend_work','Allow weekend work'],['attendance_auto_mark','Automatic attendance marking'],['require_approval_leave','Require leave approval'],['allow_worker_self_registration','Allow worker self-registration'],['maintenance_mode','Maintenance mode']].map(([key,label])=><div className="setting-row compact-setting" key={key}><div><b>{label}</b><small>{key==='maintenance_mode'?'Restrict normal usage during planned maintenance.':'Configure this system workflow option.'}</small></div><button type="button" className={'toggle '+(Boolean(draft[key])?'on':'')} onClick={()=>change(key,!Boolean(draft[key]))} aria-label={label}><i/></button></div>)}</div>
      <div className="settings-actions"><button type="button" className="secondary-btn" onClick={()=>loadSettings()} disabled={settingsLoading}>Reset to saved <RefreshCw size={15}/></button><button className="primary-btn" disabled={saving||settingsLoading}>{saving?'Saving…':'Save system settings'} <Check size={16}/></button></div>
    </form> : <div className="empty-state"><ShieldCheck/><b>Administrator permissions required</b><span>Only administrators can change organization-wide settings.</span></div>}
  </article>;
}

function WorkerTable({ rows, compact=false, onView, onEdit }) {
  if (!rows?.length) return <div className="empty-state"><Users size={28}/><b>No worker records to show</b><span>When workers are available, they will appear here.</span></div>;
  return <div className="table-wrap"><table><thead><tr><th>Worker</th><th>Position</th><th>Department</th><th>Status</th>{!compact&&<th>Email</th>}<th>Actions</th></tr></thead><tbody>{rows.map((w,i)=><tr key={w.id||i}><td><div className="worker-cell"><div className="worker-avatar">{(w.first_name||'?').slice(0,1)}{(w.last_name||'').slice(0,1)}</div><div><b>{w.first_name} {w.last_name}</b><small>{w.email||'—'}</small></div></div></td><td>{w.position||'—'}</td><td>{w.department_name||'Unassigned'}</td><td><span className={'status-pill '+((w.status||'active').toLowerCase())}><i/>{w.status||'active'}</span></td>{!compact&&<td>{w.email||'—'}</td>}<td><div className="table-actions"><button title="View profile" onClick={()=>onView?.(w)}><Eye size={15}/></button>{!compact&&<button title="Edit worker" onClick={()=>onEdit?.(w)}><Pencil size={15}/></button>}</div></td></tr>)}</tbody></table></div>;
}

export default App;
