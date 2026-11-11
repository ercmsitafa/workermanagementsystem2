import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, BriefcaseBusiness, CalendarCheck, ChartNoAxesCombined,
  Check, ChevronDown, CircleHelp, Clock3, Command, FileBarChart, LayoutDashboard,
  LogOut, Menu, Moon, Plus, Search, Settings, ShieldCheck, Sun, Users, Wallet,
  X, RefreshCw, ArrowUpRight, Building2, SlidersHorizontal, Sparkles
} from 'lucide-react';
import { apiRequest, getToken, signIn, signOut } from './api';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('wms_theme') !== 'light');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ first_name:'', last_name:'', email:'', phone:'', position:'', salary:'', status:'active' });

  async function loadUser() {
    const result = await apiRequest('/auth/me');
    setUser(result.data);
  }
  async function loadDashboard() {
    const result = await apiRequest('/dashboard');
    setDashboard(result.data);
  }
  async function loadWorkers() {
    const params = new URLSearchParams({ page:'1', limit:'100', search:query });
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
  }, [query, status]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('wms_theme', dark ? 'dark' : 'light');
  }, [dark]);

  async function handleLogin(username, password) {
    const data = await signIn(username, password);
    setUser(data.user); setToken(data.token);
  }
  function handleLogout() { signOut(); setToken(null); setUser(null); setDashboard(null); }
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
          <article className="panel recent-panel"><div className="panel-heading"><div><h3>Recently added workers</h3><p>Your latest team members</p></div><button className="text-btn" onClick={()=>setPage('workers')}>View all <ArrowUpRight size={15}/></button></div><WorkerTable rows={(dashboard?.recent_workers||[])} compact/></article>
        </>}

        {page==='workers'&&<article className="panel workers-panel"><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Search name, email or phone…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</div><div className="filter-control"><SlidersHorizontal size={16}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div><span className="results-count">{workerTotal} workers</span></div><WorkerTable rows={visibleWorkers}/></article>}

        {page==='departments'&&<article className="panel"><div className="panel-heading"><div><h3>Departments</h3><p>Workforce distribution across your organization</p></div></div><div className="department-cards">{(dashboard?.departments||[]).map(d=><div className="department-card" key={d.name}><Building2/><b>{d.name}</b><strong>{d.worker_count}</strong><small>Active workers</small></div>)}</div>{!dashboard?.departments?.length&&<p className="empty-hint">No department data available yet.</p>}</article>}

        {page==='attendance'&&<article className="panel"><div className="panel-heading"><div><h3>Attendance summary</h3><p>Today's attendance from your connected API</p></div><CalendarCheck/></div><div className="stats-grid inner-stats"><StatCard title="Present" value={attendance.present??'—'} note="Marked present" icon={Check} tone="green"/><StatCard title="Absent" value={attendance.absent??'—'} note="Marked absent" icon={X} tone="orange"/><StatCard title="On leave" value={attendance.leave??'—'} note="Approved leave" icon={Clock3} tone="purple"/></div><p className="muted">Attendance entries can be viewed and managed through the existing API. This dashboard currently displays the summary endpoint.</p></article>}

        {page==='salaries'&&<article className="panel"><div className="panel-heading"><div><h3>Salary overview</h3><p>Current month totals from dashboard records</p></div><Wallet/></div><div className="stats-grid inner-stats"><StatCard title="Base salary" value={dashboard?.salaries?.total_base!=null?money(dashboard.salaries.total_base):'—'} note="Monthly base total" icon={Wallet} tone="blue"/><StatCard title="Deductions" value={dashboard?.salaries?.total_deductions!=null?money(dashboard.salaries.total_deductions):'—'} note="Recorded deductions" icon={Activity} tone="orange"/><StatCard title="Net salary" value={dashboard?.salaries?.total_net!=null?money(dashboard.salaries.total_net):'—'} note="Monthly net total" icon={BriefcaseBusiness} tone="green"/></div></article>}

        {page==='reports'&&<article className="panel"><div className="panel-heading"><div><h3>Workforce reports</h3><p>Summary of available dashboard metrics</p></div><FileBarChart/></div><div className="report-list"><div><span>Registered workers</span><b>{stats.total??'—'}</b></div><div><span>Active workers</span><b>{stats.active??'—'}</b></div><div><span>Attendance rate</span><b>{attendancePct}%</b></div><div><span>Average salary</span><b>{stats.avg_salary!=null?money(stats.avg_salary):'—'}</b></div></div><p className="muted">Detailed report exports can be connected to the existing export endpoints in the next integration pass.</p></article>}

        {page==='settings'&&<article className="panel settings-panel"><div className="panel-heading"><div><h3>Workspace preferences</h3><p>Personalize how the dashboard looks and behaves.</p></div><Settings/></div><div className="setting-row"><div><b>Dark appearance</b><small>Use the darker dashboard theme.</small></div><button className={'toggle '+(dark?'on':'')} onClick={()=>setDark(v=>!v)} aria-label="Toggle dark appearance"><i/></button></div><div className="setting-row"><div><b>Automatic refresh</b><small>Refresh dashboard data manually using the refresh button.</small></div><span className="soft-tag">Manual</span></div><div className="setting-row"><div><b>Signed in as</b><small>{user?.email||user?.username||'Authenticated user'} · {user?.role||'member'}</small></div><ShieldCheck className="success-icon"/></div><div className="setting-row"><div><b>API connection</b><small>Dashboard data is loaded from your existing backend.</small></div><span className="soft-tag">Connected when data loads</span></div></article>}
        <footer className="page-footer"><span>Workforce Management System</span><span>Built to help your team work smarter.</span></footer>
      </section>
    </main>

    {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    {showAdd&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false);}}><form className="modal-card" onSubmit={createWorker}><div className="modal-heading"><div><span className="eyebrow">TEAM MANAGEMENT</span><h2>Add a worker</h2></div><button type="button" className="icon-btn" onClick={()=>setShowAdd(false)}><X/></button></div><div className="form-grid">{[['first_name','First name'],['last_name','Last name'],['email','Email address'],['phone','Phone number'],['position','Job position'],['salary','Salary (RWF)']].map(([key,label])=><label key={key}>{label}<input required={['first_name','last_name','email'].includes(key)} type={key==='email'?'email':key==='salary'?'number':'text'} min={key==='salary'?'0':undefined} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={label}/></label>)}</div><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowAdd(false)}>Cancel</button><button className="primary-btn"><Plus size={16}/> Save worker</button></div></form></div>}
  </div>;
}

function WorkerTable({ rows, compact=false }) {
  if (!rows?.length) return <div className="empty-state"><Users size={28}/><b>No worker records to show</b><span>When workers are available, they will appear here.</span></div>;
  return <div className="table-wrap"><table><thead><tr><th>Worker</th><th>Position</th><th>Department</th><th>Status</th>{!compact&&<th>Email</th>}</tr></thead><tbody>{rows.map((w,i)=><tr key={w.id||i}><td><div className="worker-cell"><div className="worker-avatar">{(w.first_name||'?').slice(0,1)}{(w.last_name||'').slice(0,1)}</div><div><b>{w.first_name} {w.last_name}</b><small>{w.email||'—'}</small></div></div></td><td>{w.position||'—'}</td><td>{w.department_name||'Unassigned'}</td><td><span className={'status-pill '+((w.status||'active').toLowerCase())}><i/>{w.status||'active'}</span></td>{!compact&&<td>{w.email||'—'}</td>}</tr>)}</tbody></table></div>;
}

export default App;
