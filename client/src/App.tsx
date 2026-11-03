import { useEffect, useMemo, useState } from "react";
import { Home, RefreshCw, CalendarDays, AlertTriangle, ChevronDown, Zap } from "lucide-react";

type HomeItem = { homeId: string; name: string };
type Automation = { id: string; name: string; weekdays: number[]; start: string; end: string; enabled: boolean };
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, i) => i);
const palette = ["#5b8def", "#20a486", "#a477e8", "#e49a42", "#d86f91", "#4f9caa", "#87934b"];

function minutes(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function App() {
  const [homes, setHomes] = useState<HomeItem[]>([]);
  const [homeId, setHomeId] = useState("");
  const [events, setEvents] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDisabled, setShowDisabled] = useState(true);
  const [selected, setSelected] = useState<Automation | null>(null);

  async function loadHomes() {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/homes"); if (!r.ok) throw new Error((await r.json()).error || "Could not load homes");
      const data: HomeItem[] = await r.json(); setHomes(data);
      const next = data.some(h => h.homeId === homeId) ? homeId : data[0]?.homeId || "";
      setHomeId(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setLoading(false); }
  }
  async function loadEvents(id: string) {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/homes/${encodeURIComponent(id)}/automations`);
      if (!r.ok) throw new Error((await r.json()).error || "Could not load automations");
      setEvents(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); setEvents([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadHomes(); }, []);
  useEffect(() => { if (homeId) void loadEvents(homeId); }, [homeId]);
  const visible = useMemo(() => events.filter(e => showDisabled || e.enabled), [events, showDisabled]);
  const overlaps = useMemo(() => {
    let count = 0;
    for (let d = 0; d < 7; d++) {
      const list = visible.filter(e => e.weekdays.includes(d) && e.enabled).map(e => ({ s: minutes(e.start), t: minutes(e.end) })).sort((a,b) => a.s-b.s);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].s < list[i].t; j++) if (Math.max(list[i].s,list[j].s) < Math.min(list[i].t,list[j].t)) count++;
    }
    return count;
  }, [visible]);

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brandIcon"><Zap size={21}/></div><div><b>Tuya Planner</b><small>Weekly automation overview</small></div></div>
      <div className="actions"><span className="region">EU · Central Europe</span><button className="refresh" onClick={() => void loadEvents(homeId)}><RefreshCw size={15}/> Refresh</button></div>
    </header>
    <section className="intro"><div><div className="eyebrow">SMART HOME CONTROL</div><h1>Automation schedule</h1><p>See your weekly routines, spot overlaps and compare time windows.</p></div><div className="homeSelect"><label><Home size={15}/> SELECT HOME</label><div className="selectWrap"><select value={homeId} onChange={e => setHomeId(e.target.value)}>{homes.map(h => <option key={h.homeId} value={h.homeId}>{h.name}</option>)}</select><ChevronDown size={16}/></div></div></section>
    <section className="stats"><div className="stat"><span>VISIBLE AUTOMATIONS</span><strong>{visible.length}</strong></div><div className="stat"><span>ACTIVE AUTOMATIONS</span><strong>{visible.filter(e=>e.enabled).length}</strong></div><div className="stat warning"><span>OVERLAPPING WINDOWS</span><strong>{overlaps}</strong></div><div className="stat"><span>SELECTED HOME</span><strong className="homeStat">{homes.find(h=>h.homeId===homeId)?.name || "—"}</strong></div></section>
    <section className="calendarCard">
      <div className="calendarHead"><div><h2><CalendarDays size={19}/> Weekly timeline</h2><p>Each block represents a configured automation time window.</p></div><label className="toggle"><input type="checkbox" checked={showDisabled} onChange={e=>setShowDisabled(e.target.checked)}/> Show disabled</label></div>
      {error && <div className="error"><AlertTriangle size={16}/>{error}</div>}
      <div className="legend">{visible.map((e,i)=><span key={e.id}><i style={{background:palette[events.findIndex(x=>x.id===e.id)%palette.length]}}/>{e.name}</span>)}</div>
      <div className="calendarScroll"><div className="calendar" style={{"--rows":24} as React.CSSProperties}>
        <div className="timeAxis"><div className="daySpacer"/>{hours.map(h=><div className="hourLabel" key={h}>{String(h).padStart(2,"0")}:00</div>)}</div>
        {days.map((day,d)=><div className="dayColumn" key={day}><div className="dayHeader">{day}</div><div className="dayBody">{hours.map(h=><div className="hourLine" key={h}/>)}
          {visible.filter(e=>e.weekdays.includes(d)).map(e=>{
            const start=minutes(e.start), end=minutes(e.end) <= start ? minutes(e.end)+1440 : minutes(e.end);
            const top=start/60, height=Math.max((end-start)/60,0.35), idx=events.findIndex(x=>x.id===e.id);
            const leftEvents=visible.filter(x=>x.weekdays.includes(d) && minutes(x.start)<end && (minutes(x.end)<=minutes(x.start)?minutes(x.end)+1440:minutes(x.end))>start);
            const lane=Math.max(0,leftEvents.findIndex(x=>x.id===e.id)), width=100/Math.max(1,leftEvents.length);
            return <button key={e.id} className={`event ${e.enabled?"":"disabled"}`} style={{top:`${top*56}px`,height:`${Math.min(height,24-top)*56}px`,left:`calc(${lane*width}% + 2px)`,width:`calc(${width}% - 4px)`,background:palette[idx%palette.length]}} onClick={()=>setSelected(e)} title={`${e.name}: ${e.start}–${e.end}`}><b>{e.name}</b><small>{e.start}–{e.end}</small></button>
          })}
        </div></div>)}
      </div></div>
      <div className="footnote">Times shown in your local timezone (Asia/Jerusalem). Time windows are not necessarily the actual runtime of device actions.</div>
    </section>
    {selected && <div className="modalBackdrop" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="eyebrow">AUTOMATION DETAILS</div><h3>{selected.name}</h3><p>{selected.start}</p><p>Days: {selected.weekdays.map(d=>days[d]).join(", ")}</p><p>Status: {selected.enabled?"Enabled":"Disabled"}</p></div></div>}
    <footer>Tuya Weekly Planner <span>Starter UI · Demo data</span></footer>
    {loading && <div className="loading">Loading…</div>}
  </main>;
}
export default App;
