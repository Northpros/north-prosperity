import React, { useState } from 'react'
import { Activity, BarChart2, Briefcase, Settings as SettingsIcon, TrendingUp } from 'lucide-react'
import Dashboard from './pages/Dashboard.jsx'
import Backtest  from './pages/Backtest.jsx'
import Portfolio from './pages/Portfolio.jsx'
import Settings  from './pages/Settings.jsx'

const TABS = [
  { id:'dashboard', label:'Dashboard', icon:<Activity size={14}/> },
  { id:'backtest',  label:'Backtest',  icon:<BarChart2 size={14}/> },
  { id:'portfolio', label:'Portfolio', icon:<Briefcase size={14}/> },
  { id:'settings',  label:'Settings',  icon:<SettingsIcon size={14}/> },
]

const DEFAULT_SETTINGS = {
  atrPeriod: 10,
  factor:    3.0,
  multMode:  'linear',
}

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ta_settings') || '{}') } }
  catch { return DEFAULT_SETTINGS }
}

export default function App() {
  const [tab,              setTab]              = useState('dashboard')
  const [portfolioPrefill, setPortfolioPrefill] = useState(null)
  const [settings,         setSettings]         = useState(loadSettings)

  const handleSaveSettings = (s) => {
    setSettings(s)
    localStorage.setItem('ta_settings', JSON.stringify(s))
  }

  const handleAddToPortfolio = (data) => {
    setPortfolioPrefill(data)
    setTab('portfolio')
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-base)' }}>
      <div style={{
        position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
        backgroundImage:'radial-gradient(circle at 20% 50%, rgba(0,229,200,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,229,200,0.02) 0%, transparent 40%)',
      }} />

      <div style={{ position:'relative', zIndex:1, maxWidth:1200, margin:'0 auto', padding:'0 20px 60px' }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <header style={{ padding:'20px 0 0', marginBottom:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:16 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                <div style={{ width:32, height:32, borderRadius:8,
                  background:'linear-gradient(135deg, var(--accent) 0%, #0098a0 100%)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <TrendingUp size={16} color="#000" strokeWidth={2.5} />
                </div>
                <h1 style={{ fontFamily:'var(--font-sans)', fontSize:20, fontWeight:700,
                  letterSpacing:'-0.02em', color:'var(--text-primary)' }}>
                  Trend Alpha <span style={{ color:'var(--accent)' }}>Pro</span>
                </h1>
              </div>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>
                Supertrend + SMA50/200 · Long & Short · {settings.multMode === 'linear' ? 'Linear' : 'Exponential'} Multiplier · ATR{settings.atrPeriod} × {settings.factor}
              </p>
            </div>
            <LiveClock />
          </div>

          <nav style={{ marginTop:20, display:'flex', gap:2, background:'var(--bg-surface)',
            padding:4, borderRadius:'var(--radius-md)', border:'1px solid var(--border)', width:'fit-content' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'7px 16px', fontSize:13, fontFamily:'var(--font-sans)',
                fontWeight: tab===t.id ? 600 : 400,
                color: tab===t.id ? '#000' : 'var(--text-secondary)',
                background: tab===t.id ? 'var(--accent)' : 'transparent',
                border:'none', borderRadius:7, cursor:'pointer', transition:'all 0.15s',
              }}>
                {t.icon}{t.label}
              </button>
            ))}
          </nav>
        </header>

        <main>
          {tab==='dashboard' && <Dashboard onAddToPortfolio={handleAddToPortfolio} settings={settings} />}
          {tab==='backtest'  && <Backtest  settings={settings} />}
          {tab==='portfolio' && <Portfolio prefillPosition={portfolioPrefill} settings={settings} />}
          {tab==='settings'  && <Settings  settings={settings} onSave={handleSaveSettings} />}
        </main>
      </div>
    </div>
  )
}

function LiveClock() {
  const [time, setTime] = React.useState(new Date())
  React.useEffect(() => { const id=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(id) }, [])
  return (
    <div style={{ textAlign:'right' }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:18, fontWeight:500, color:'var(--text-primary)', letterSpacing:'0.04em' }}>
        {time.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)' }}>
        {time.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}
      </div>
    </div>
  )
}
