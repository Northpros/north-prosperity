import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

// ============================================================
// NORTH PROSPERITY RETIREMENT PLANNER — v2.1
// Dark mode, DCA Pro aesthetic, localStorage persistence
// Exact calculation parity with Phase2b HTML (CAGR fix applied)
// v2.1: 3-phase CAGR everywhere, modern fonts, layout fixes
// ============================================================

// ── Formatting ────────────────────────────────────────────────
const fmt = v => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0}).format(v||0);
const fmtK = v => { v=v||0; return Math.abs(v)>=1e9?`$${(v/1e9).toFixed(1)}B`:Math.abs(v)>=1e6?`$${(v/1e6).toFixed(1)}M`:Math.abs(v)>=1e3?`$${(v/1e3).toFixed(0)}k`:fmt(v); };
const fmtN = (v,d=2) => new Intl.NumberFormat("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v||0);
const fmtPct = v => `${(v||0).toFixed(1)}%`;

// ── Theme ─────────────────────────────────────────────────────
const themes = {
  dark: {
    bg:"#07071a", card:"#0d0d1f", border:"#1a1a3a", border2:"#2a2a4a",
    inputBg:"#1a1a2e", text:"#e0e0ff", textMid:"#888", textDim:"#555",
    accent:"#6C8EFF", gold:"#d4af37", green:"#34d399", red:"#ef4444",
    purple:"#a78bfa", cyan:"#06b6d4", label:"#888",
    rowAlt:"#0a0a18", rowHover:"#12122a",
    headerBg:"#0d0d1f", summaryBg:"#0f0f24",
  },
  light: {
    bg:"#f0f2f8", card:"#ffffff", border:"#d0d4e8", border2:"#c0c8e0",
    inputBg:"#f8f9ff", text:"#1a1a3a", textMid:"#556", textDim:"#778",
    accent:"#4a6ef5", gold:"#b8941f", green:"#059669", red:"#dc2626",
    purple:"#7c3aed", cyan:"#0891b2", label:"#778",
    rowAlt:"#f8f9ff", rowHover:"#eef1ff",
    headerBg:"#ffffff", summaryBg:"#f0f4ff",
  }
};
const CHART_COLORS = ["#6C8EFF","#d4af37","#34d399","#a78bfa","#06b6d4","#ec4899","#f59e0b","#ef4444","#84cc16","#f472b6"];

// ── CAGR Presets ──────────────────────────────────────────────
const CAGR_PRESETS = {
  "aggressive": { label:"\u{1F680} Aggressive Growth", desc:"High-growth stocks (TSLA, MSTR)", cagr:25, d1:1.5, d2:0.7, d3:0.2 },
  "growth":     { label:"\u{1F4C8} Growth", desc:"Tech/growth stocks (NVDA, AMZN)", cagr:18, d1:0.8, d2:0.4, d3:0.15 },
  "moderate":   { label:"\u2696\uFE0F Moderate", desc:"Blue chips (AAPL, MSFT)", cagr:12, d1:0.5, d2:0.3, d3:0.1 },
  "conservative":{ label:"\u{1F6E1}\uFE0F Conservative", desc:"Index funds (SPY, VOO)", cagr:10, d1:0.3, d2:0.2, d3:0.1 },
  "crypto":     { label:"\u20BF Crypto", desc:"Bitcoin, Ethereum", cagr:28, d1:2.5, d2:0.7, d3:0.12 },
  "income":     { label:"\u{1F4B0} Income/Dividend", desc:"REITs, dividend ETFs", cagr:7, d1:0.2, d2:0.1, d3:0.05 },
};

// ── Default Data ──────────────────────────────────────────────
const mkId = () => Date.now() + Math.random();
const DEFAULT_PLAN = {
  params: { personName:"", ageAtStart:60, inflationRate:3, startYear:2030, projectionYears:30 },
  divestAssets: [
    {id:1,name:"Asset 1",note:"",shares:0,pricePerShare:0,cagr:10,cagrDecline1:0.5,cagrDecline2:0.3,cagrDecline3:0.1,autoCalc:true,enabled:false},
    {id:2,name:"Asset 2",note:"",shares:0,pricePerShare:0,cagr:10,cagrDecline1:0.5,cagrDecline2:0.3,cagrDecline3:0.1,autoCalc:true,enabled:false},
  ],
  fixedIncome: [
    {id:1,name:"Pension",amount:0,startYear:2030,indexing:0,enabled:false},
    {id:2,name:"Social Security",amount:0,startYear:2030,indexing:2,enabled:false},
  ],
  investmentIncome: [
    {id:1,name:"401k",note:"",shares:0,pricePerShare:0,cagr:7,cagrDecline1:0.3,cagrDecline2:0.2,cagrDecline3:0.1,dividendPercent:0,includeDividend:false,autoCalc:true,enabled:false},
  ],
  otherIncome: [
    {id:1,name:"Business Income",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline:0.1,annualIncome:0,includeIncome:false,enabled:false},
  ],
  fixedAssets: [
    {id:1,name:"Primary Residence",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline1:0.1,cagrDecline2:0.05,cagrDecline3:0.02,enabled:false},
  ],
  bigTicketStocks: [{id:1,ticker:"",shares:0,price:0,enabled:false}],
  bigTicketItem: "",
  notes: "",
};

// ── CALCULATION ENGINE (Phase2b — 3-phase CAGR everywhere) ──
function runProjection(plan) {
  const p = plan.params;
  const inf = p.inflationRate / 100;
  const sy = p.startYear, py = p.projectionYears;
  const ea = plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const ef = plan.fixedIncome.filter(s=>s.enabled&&s.amount>0);
  const ei = plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  const efa = plan.fixedAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const eo = plan.otherIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  if(!ea.length&&!ef.length&&!ei.length&&!eo.length) return [];

  // 3-phase CAGR helper — returns array of multipliers starting at 1
  const build3Phase = (baseRate, d1, d2, d3) => {
    const sc = baseRate/100;
    const dd1=(d1||0)/100, dd2=(d2||0)/100, dd3=(d3||0)/100;
    const p2s=sc-5*dd1, p3s=p2s-15*dd2;
    const mult = [1];
    for(let y=1;y<py;y++){
      let yc; if(y<=5) yc=sc-y*dd1; else if(y<=20) yc=p2s-(y-5)*dd2; else yc=p3s-(y-20)*dd3;
      yc=Math.max(yc,0); mult.push(mult[y-1]*(1+yc));
    }
    return mult;
  };

  // CONSERVATIVE phase transition model for divest assets
  const dp = ea.map(a=>{
    const mult = build3Phase(a.cagr, a.cagrDecline1, a.cagrDecline2, a.cagrDecline3);
    return mult.map(m=>Math.round(a.pricePerShare*m));
  });

  // 3-phase for investment income (was absolute decline, now 3-phase)
  const ip = ei.map(s=>{
    const d1=s.cagrDecline1!==undefined?s.cagrDecline1:(s.cagrDecline||0.3);
    const d2=s.cagrDecline2!==undefined?s.cagrDecline2:((s.cagrDecline||0.3)*0.6);
    const d3=s.cagrDecline3!==undefined?s.cagrDecline3:((s.cagrDecline||0.3)*0.3);
    const mult = build3Phase(s.cagr, d1, d2, d3);
    return mult.map(m=>Math.round(s.pricePerShare*m));
  });

  // 3-phase for fixed assets (was absolute decline, now 3-phase)
  const fap = efa.map(a=>{
    const d1=a.cagrDecline1!==undefined?a.cagrDecline1:(a.cagrDecline||0.1);
    const d2=a.cagrDecline2!==undefined?a.cagrDecline2:((a.cagrDecline||0.1)*0.5);
    const d3=a.cagrDecline3!==undefined?a.cagrDecline3:((a.cagrDecline||0.1)*0.2);
    const mult = build3Phase(a.cagr, d1, d2, d3);
    return mult.map(m=>Math.round(a.pricePerShare*m));
  });

  const op = eo.map(s=>{
    const b=s.cagr/100,d=(s.cagrDecline||0)/100,pr=[Math.round(s.pricePerShare)];
    for(let y=1;y<py;y++){let yc=b-d*y;yc=Math.max(yc,0);pr.push(Math.round(pr[y-1]*(1+yc)));}return pr;
  });

  const aw = ea.map((a,i)=>{
    if(!a.autoCalc)return 0; let sr=0;
    for(let y=0;y<py;y++){sr+=Math.pow(1+inf,y)/dp[i][y];}return a.shares/sr;
  });
  const iw = ei.map((s,i)=>{
    if(!s.autoCalc)return 0; let sr=0;
    for(let y=0;y<py;y++){sr+=Math.pow(1+inf,y)/ip[i][y];}return s.shares/sr;
  });

  const ds = ea.map((a,i)=>({rem:a.shares,bw:Math.round(aw[i])}));
  const is2 = ei.map((s,i)=>({rem:s.shares,bw:Math.round(iw[i])}));
  const results = [];

  for(let y=0;y<py;y++){
    let fi=0;
    ef.forEach(s=>{if(sy+y>=s.startYear){const ya=sy+y-s.startYear;fi+=s.amount*Math.pow(1+s.indexing/100,ya);}});
    let ii=0,di=0; const idata=[];
    is2.forEach((st,idx)=>{
      const s=ei[idx],pr=ip[idx][y],cv=st.rem*pr;
      let dv=0;if(s.includeDividend&&s.dividendPercent>0){dv=cv*(s.dividendPercent/100);di+=dv;}
      let ss=0,w=0;
      if(s.autoCalc&&st.rem>0&&pr>0){const t=Math.round(st.bw*Math.pow(1+inf,y));const ex=t/pr;ss=Math.min(Math.round(ex*1e6)/1e6,st.rem);w=Math.round(ss*pr);ii+=w;}
      is2[idx].rem=Math.max(Math.round((st.rem-ss)*1e6)/1e6,0);
      idata.push({name:s.name,shares:is2[idx].rem,price:pr,value:Math.round(is2[idx].rem*pr),withdrawal:w,sharesSold:ss,dividendIncome:Math.round(dv)});
    });
    const yd={year:sy+y,age:p.ageAtStart+y,fixedIncome:Math.round(fi),investmentIncome:Math.round(ii),dividendIncome:Math.round(di),
      totalIncome:Math.round(fi+ii+di),totalValue:0,assets:[],investmentIncomeSources:idata,fixedAssetValues:[],otherIncome:0,otherIncomeValues:[]};
    ds.forEach((st,idx)=>{
      const a=ea[idx],pr=dp[idx][y],v=st.rem*pr;
      const t=Math.round(st.bw*Math.pow(1+inf,y));
      let ss=0;if(st.rem>0&&pr>0){const ex=t/pr;ss=Math.min(Math.round(ex*1e6)/1e6,st.rem);}
      const aw2=Math.round(ss*pr);
      ds[idx].rem=Math.max(Math.round((st.rem-ss)*1e6)/1e6,0);
      yd.assets.push({name:a.name,shares:ds[idx].rem,price:pr,value:Math.round(v),withdrawal:aw2,sharesSold:ss});
      yd.totalIncome+=aw2;yd.totalValue+=Math.round(v);
    });
    is2.forEach((st,idx)=>{yd.totalValue+=Math.round(st.rem*ip[idx][y]);});
    efa.forEach((a,idx)=>{const cv=Math.round(a.shares*fap[idx][y]);yd.fixedAssetValues.push({name:a.name,value:cv});yd.totalValue+=cv;});
    let oi=0;const odata=[];
    eo.forEach((s,idx)=>{
      const pr=op[idx][y],cv=Math.round(s.shares*pr);
      let ai=0;if(s.includeIncome&&s.annualIncome>0){ai=s.annualIncome;oi+=ai;}
      odata.push({name:s.name,value:cv,annualIncome:ai});yd.totalValue+=cv;
    });
    yd.otherIncome=Math.round(oi);yd.otherIncomeValues=odata;yd.totalIncome+=Math.round(oi);
    yd.totalIncome=Math.round(yd.totalIncome);yd.totalValue=Math.round(yd.totalValue);
    results.push(yd);
  }
  return results;
}

// ── localStorage ──────────────────────────────────────────────
const STORAGE_KEY = "north_prosperity_v2";
const load = () => { try{const s=localStorage.getItem(STORAGE_KEY);return s?JSON.parse(s):null;}catch{return null;} };
const save = (plan) => { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(plan));}catch(e){console.error(e);} };

// ── Yahoo Finance link ────────────────────────────────────────
const yahooUrl = (ticker) => `https://finance.yahoo.com/quote/${encodeURIComponent(ticker?.replace(/\s/g,""))}`;
const YahooLink = ({ticker, T}) => ticker ? (
  <a href={yahooUrl(ticker)} target="_blank" rel="noopener noreferrer"
    style={{fontSize:10,color:T.accent,textDecoration:"none",opacity:0.7,whiteSpace:"nowrap",alignSelf:"end",paddingBottom:5}}
    title={`View ${ticker} on Yahoo Finance`}>{"\u{1F4CA}"} Yahoo</a>
) : null;

// ── Font constants ───────────────────────────────────────────
const FONT_DISPLAY = "'Playfair Display',Georgia,serif";
const FONT_BODY = "'Lato','Helvetica Neue',sans-serif";
const FONT_MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";
const FONT_LABEL = "'Inter','Segoe UI',sans-serif";

// ── Content width lock ───────────────────────────────────────
const CONTENT_MAX = 1440;

// ============================================================
// MAIN APP
// ============================================================
export default function RetirementPlanner() {
  const [plan, setPlan] = useState(()=>load()||JSON.parse(JSON.stringify(DEFAULT_PLAN)));
  const [tab, setTab] = useState("planning");
  const [darkMode, setDarkMode] = useState(true);
  const [saveStatus, setSaveStatus] = useState("saved");
  const saveTimer = useRef(null);
  const T = darkMode ? themes.dark : themes.light;

  const triggerSave = useCallback((np)=>{
    setSaveStatus("saving");
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{save(np);setSaveStatus("saved");},600);
  },[]);

  const update = useCallback((fn)=>{
    setPlan(prev=>{const next=fn(JSON.parse(JSON.stringify(prev)));triggerSave(next);return next;});
  },[triggerSave]);

  const results = useMemo(()=>runProjection(plan),[plan]);
  const y1=results[0]||{}, yL=results[results.length-1]||{};
  const peakIncome=results.length?Math.max(...results.map(r=>r.totalIncome)):0;
  const peakValue=results.length?Math.max(...results.map(r=>r.totalValue)):0;

  const exportPlan = () => {
    const blob=new Blob([JSON.stringify(plan,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`${plan.params.personName||"retirement-plan"}.json`.replace(/[^a-zA-Z0-9.-]/g,"_");
    a.click();URL.revokeObjectURL(a.href);
  };
  const importPlan = () => {
    const input=document.createElement("input");input.type="file";input.accept=".json";
    input.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.params&&d.divestAssets){setPlan(d);save(d);}else alert("Invalid file.");}catch{alert("Could not read file.");}};r.readAsText(f);};
    input.click();
  };
  const resetPlan = () => {if(window.confirm("Reset all data? This cannot be undone.")){const f=JSON.parse(JSON.stringify(DEFAULT_PLAN));setPlan(f);save(f);}};

  const tabs = [
    {id:"planning",label:"Planning & Income",icon:"\u2699\uFE0F"},
    {id:"divest",label:"Assets to Divest",icon:"\u{1F4B8}"},
    {id:"fixed",label:"Fixed Assets",icon:"\u{1F3E0}"},
    {id:"projections",label:"Projections",icon:"\u{1F4CA}"},
    {id:"withdrawals",label:"Withdrawal Plan",icon:"\u{1F4CB}"},
    {id:"charts",label:"Charts",icon:"\u{1F4C8}"},
    {id:"additional",label:"Additional",icon:"\u{1F3AF}"},
  ];

  return (
    <div style={{fontFamily:FONT_BODY,background:T.bg,minHeight:"100vh",padding:"12px 16px",color:T.text,transition:"background 0.3s,color 0.3s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Lato:wght@300;400;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:#6C8EFF40;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:${T.bg};}
        ::-webkit-scrollbar-thumb{background:${T.border2};border-radius:3px;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
        input[type=number]{-moz-appearance:textfield;}
        input:focus,select:focus{outline:none;border-color:${T.accent}!important;}
        .np-outer{max-width:${CONTENT_MAX}px;width:100%;margin:0 auto;display:flex;flex-direction:column;}
        .np-outer>*{width:100%!important;max-width:100%!important;min-width:0!important;}
      `}</style>

      <div className="np-outer">
        {/* HEADER — taller, larger fonts */}
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"32px 34px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14,position:"relative",overflow:"hidden"}}>
          {/* Subtle gold accent line at top */}
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${T.gold},transparent)`}}/>
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            <svg viewBox="0 0 200 200" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="95" fill="none" stroke={T.gold} strokeWidth="2" opacity="0.5"/>
              <circle cx="100" cy="100" r="85" fill="none" stroke={T.gold} strokeWidth="0.5" opacity="0.3"/>
              <polygon points="100,12 108,82 100,78 92,82" fill={T.gold} stroke={T.gold} strokeWidth="0.5"/>
              <polygon points="100,188 92,118 100,122 108,118" fill={T.accent} stroke={T.accent} strokeWidth="0.5" opacity="0.4"/>
              <polygon points="12,100 82,92 78,100 82,108" fill={T.accent} stroke={T.accent} strokeWidth="0.5" opacity="0.4"/>
              <polygon points="188,100 118,108 122,100 118,92" fill={T.accent} stroke={T.accent} strokeWidth="0.5" opacity="0.4"/>
              <circle cx="100" cy="100" r="28" fill={darkMode?"#0d0d1f":"#fff"} stroke={T.gold} strokeWidth="2.5"/>
              <circle cx="100" cy="100" r="24" fill={darkMode?"#07071a":"#f8f9fa"} stroke={T.gold} strokeWidth="0.5" opacity="0.5"/>
              <text x="100" y="102" fontFamily={FONT_DISPLAY} fontSize="36" fontWeight="900" fill={T.gold} textAnchor="middle" dominantBaseline="central">N</text>
              <text x="100" y="8" fontFamily={FONT_MONO} fontSize="9" fontWeight="700" fill={T.gold} textAnchor="middle" opacity="0.6">N</text>
              <text x="194" y="104" fontFamily={FONT_MONO} fontSize="9" fontWeight="400" fill={T.textDim} textAnchor="middle">E</text>
              <text x="100" y="198" fontFamily={FONT_MONO} fontSize="9" fontWeight="400" fill={T.textDim} textAnchor="middle">S</text>
              <text x="6" y="104" fontFamily={FONT_MONO} fontSize="9" fontWeight="400" fill={T.textDim} textAnchor="middle">W</text>
            </svg>
            <div>
              <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap"}}>
                <span style={{fontFamily:FONT_DISPLAY,fontSize:36,fontWeight:900,color:T.gold,lineHeight:1.1}}>North Prosperity</span>
                <span style={{fontFamily:FONT_LABEL,fontSize:18,fontWeight:500,color:T.textMid,letterSpacing:0.5}}>Retirement Planner</span>
              </div>
              {plan.params.personName && <span style={{fontFamily:FONT_LABEL,fontSize:14,fontWeight:500,color:T.accent,marginTop:4,display:"block"}}>{plan.params.personName}</span>}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <SaveDot status={saveStatus} T={T}/>
            <SmBtn onClick={()=>setDarkMode(!darkMode)} label={darkMode?"\u2600\uFE0F Light":"\u{1F319} Dark"} T={T}/>
            <SmBtn onClick={importPlan} label={"\u{1F4C2} Import"} T={T}/>
            <SmBtn onClick={exportPlan} label={"\u{1F4BE} Export"} T={T}/>
            <SmBtn onClick={resetPlan} label={"\u{1F504} Reset"} T={T} danger/>
          </div>
        </div>

        {/* SUMMARY — taller cards, bigger text */}
        {results.length>0 && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:14}}>
            <SumCard label="Year 1 Income" value={fmt(y1.totalIncome)} color={T.accent} T={T}/>
            <SumCard label="Peak Income" value={fmt(peakIncome)} color={T.gold} T={T}/>
            <SumCard label="Year 1 Portfolio" value={fmtK(y1.totalValue)} color={T.green} T={T}/>
            <SumCard label="Peak Portfolio" value={fmtK(peakValue)} color={T.purple} T={T}/>
            <SumCard label="Final Income" value={fmt(yL.totalIncome)} color={T.cyan} T={T}/>
            <SumCard label="Final Portfolio" value={fmtK(yL.totalValue)} color={T.accent} T={T}/>
          </div>
        )}

        {/* TABS */}
        <div style={{display:"flex",gap:2,marginBottom:14,flexWrap:"wrap",borderBottom:`1px solid ${T.border}`}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"11px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:tab===t.id?600:500,
              fontFamily:FONT_LABEL,background:"transparent",
              color:tab===t.id?T.accent:T.textMid,
              borderBottom:tab===t.id?`2px solid ${T.accent}`:"2px solid transparent",
              transition:"all 0.15s",whiteSpace:"nowrap",letterSpacing:0.2,
            }}>{t.icon} {t.label}</button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{width:"100%",overflow:"hidden"}}>
        {tab==="planning" && <PlanningTab plan={plan} update={update} T={T}/>}
        {tab==="divest" && <DivestTab plan={plan} update={update} T={T}/>}
        {tab==="fixed" && <FixedAssetsTab plan={plan} update={update} T={T}/>}
        {tab==="projections" && <ProjectionsTab plan={plan} results={results} T={T}/>}
        {tab==="withdrawals" && <WithdrawalTab plan={plan} results={results} T={T}/>}
        {tab==="charts" && <ChartsTab plan={plan} results={results} T={T}/>}
        {tab==="additional" && <AdditionalTab plan={plan} update={update} T={T}/>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: PLANNING
// ============================================================
function PlanningTab({plan, update, T}) {
  const p = plan.params;
  const up = (k,v)=>update(d=>{d.params[k]=v;return d;});
  const [showInvPresets, setShowInvPresets] = useState(null);
  const applyInvPreset = (i,key)=>{const pr=CAGR_PRESETS[key];update(d=>{d.investmentIncome[i].cagr=pr.cagr;d.investmentIncome[i].cagrDecline1=pr.d1;d.investmentIncome[i].cagrDecline2=pr.d2;d.investmentIncome[i].cagrDecline3=pr.d3;return d;});setShowInvPresets(null);};
  return <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Planning Parameters" T={T}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10}}>
        <Field label="Person / Couple" value={p.personName} onChange={v=>up("personName",v)} T={T}/>
        <Field label="Age at Start" value={p.ageAtStart} type="number" onChange={v=>up("ageAtStart",+v||60)} T={T}/>
        <Field label="Inflation %" value={p.inflationRate} type="number" step="0.5" onChange={v=>up("inflationRate",+v||0)} T={T}/>
        <Field label="Start Year" value={p.startYear} type="number" onChange={v=>up("startYear",+v||2030)} T={T}/>
        <Field label="Projection Years" value={p.projectionYears} type="number" onChange={v=>up("projectionYears",Math.min(+v||30,60))} T={T}/>
      </div>
    </Card>
    <Card title="Fixed Sources of Income" badge="Pension \u2022 Social Security" T={T}
      action={plan.fixedIncome.length<10?()=>update(d=>{d.fixedIncome.push({id:mkId(),name:"New Source",amount:0,startYear:p.startYear,indexing:0,enabled:false});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Pensions, Social Security, CPP, OAS, annuities. Set start year to defer income.</Hint>
      {plan.fixedIncome.map((s,i)=><ItemRow key={s.id} enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.fixedIncome[i].enabled=!d.fixedIncome[i].enabled;return d;})} onRemove={()=>update(d=>{d.fixedIncome.splice(i,1);return d;})}>
        <MF label="Name" value={s.name} w="1.5fr" onChange={v=>update(d=>{d.fixedIncome[i].name=v;return d;})} T={T}/>
        <MF label="Annual $" value={s.amount} type="number" w="1fr" onChange={v=>update(d=>{d.fixedIncome[i].amount=+v||0;return d;})} T={T}/>
        <MF label="Start Year" value={s.startYear} type="number" w="0.7fr" onChange={v=>update(d=>{d.fixedIncome[i].startYear=+v||2030;return d;})} T={T}/>
        <MF label="Index%" value={s.indexing} type="number" step="0.5" w="0.5fr" onChange={v=>update(d=>{d.fixedIncome[i].indexing=+v||0;return d;})} T={T}/>
      </ItemRow>)}
    </Card>
    {/* Registered Investment Income — NOW 3-phase CAGR decline */}
    <Card title="Registered Investment Income" badge="TFSA, RRSP, 401k, IRA" T={T}
      action={plan.investmentIncome.length<10?()=>update(d=>{d.investmentIncome.push({id:mkId(),name:"New Investment",note:"",shares:0,pricePerShare:0,cagr:7,cagrDecline1:0.3,cagrDecline2:0.2,cagrDecline3:0.1,dividendPercent:0,includeDividend:false,autoCalc:true,enabled:false});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Investment accounts with withdrawals and/or dividends. Three-phase CAGR decline: Yr 1-5, Yr 6-20, Yr 21+</Hint>
      {plan.investmentIncome.map((s,i)=><div key={s.id}>
        <ItemRow enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.investmentIncome[i].enabled=!d.investmentIncome[i].enabled;return d;})} onRemove={()=>update(d=>{d.investmentIncome.splice(i,1);return d;})}>
          <MF label="Name" value={s.name} w="1.2fr" onChange={v=>update(d=>{d.investmentIncome[i].name=v;return d;})} T={T}/>
          <MF label="Shares" value={s.shares} type="number" w="0.6fr" onChange={v=>update(d=>{d.investmentIncome[i].shares=+v||0;return d;})} T={T}/>
          <MF label="Price" value={s.pricePerShare} type="number" w="0.7fr" onChange={v=>update(d=>{d.investmentIncome[i].pricePerShare=+v||0;return d;})} T={T}/>
          <MF label="CAGR%" value={s.cagr} type="number" step="0.5" w="0.45fr" onChange={v=>update(d=>{d.investmentIncome[i].cagr=+v||0;return d;})} T={T}/>
          <MF label="1-5%" value={s.cagrDecline1!==undefined?s.cagrDecline1:(s.cagrDecline||0.3)} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.investmentIncome[i].cagrDecline1=+v||0;return d;})} T={T}/>
          <MF label="6-20%" value={s.cagrDecline2!==undefined?s.cagrDecline2:((s.cagrDecline||0.3)*0.6)} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.investmentIncome[i].cagrDecline2=+v||0;return d;})} T={T}/>
          <MF label="21+%" value={s.cagrDecline3!==undefined?s.cagrDecline3:((s.cagrDecline||0.3)*0.3)} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.investmentIncome[i].cagrDecline3=+v||0;return d;})} T={T}/>
          <MF label="Div%" value={s.dividendPercent} type="number" step="0.5" w="0.45fr" onChange={v=>update(d=>{d.investmentIncome[i].dividendPercent=+v||0;return d;})} T={T}/>
          <Chk label="Div" checked={s.includeDividend} onChange={()=>update(d=>{d.investmentIncome[i].includeDividend=!d.investmentIncome[i].includeDividend;return d;})} T={T}/>
          <Chk label="Sell" checked={s.autoCalc} onChange={()=>update(d=>{d.investmentIncome[i].autoCalc=!d.investmentIncome[i].autoCalc;return d;})} T={T}/>
          <div style={{display:"flex",flexDirection:"column",gap:2,alignSelf:"end",paddingBottom:4}}>
            <YahooLink ticker={s.name} T={T}/>
            <button onClick={()=>setShowInvPresets(showInvPresets===i?null:i)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:FONT_LABEL}}>Preset</button>
          </div>
        </ItemRow>
        {showInvPresets===i&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:6,padding:"6px 28px 10px",background:T.bg,borderRadius:8,margin:"-2px 0 6px"}}>
          {Object.entries(CAGR_PRESETS).map(([k,pr])=><button key={k} onClick={()=>applyInvPreset(i,k)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left"}}>
            <div style={{fontSize:11,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{pr.label}</div>
            <div style={{fontSize:9,color:T.textMid,fontFamily:FONT_LABEL}}>{pr.desc}</div>
            <div style={{fontSize:9,color:T.accent,fontFamily:FONT_MONO}}>{pr.cagr}% | {pr.d1}/{pr.d2}/{pr.d3}</div>
          </button>)}
        </div>}
      </div>)}
    </Card>
    <Card title="Other Sources of Income" badge="Business, Rental" T={T}
      action={plan.otherIncome.length<10?()=>update(d=>{d.otherIncome.push({id:mkId(),name:"New Source",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline:0.1,annualIncome:0,includeIncome:false,enabled:false});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Business income, rental properties, royalties. Appreciate in value + optional annual income.</Hint>
      {plan.otherIncome.map((s,i)=><ItemRow key={s.id} enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.otherIncome[i].enabled=!d.otherIncome[i].enabled;return d;})} onRemove={()=>update(d=>{d.otherIncome.splice(i,1);return d;})}>
        <MF label="Name" value={s.name} w="1.2fr" onChange={v=>update(d=>{d.otherIncome[i].name=v;return d;})} T={T}/>
        <MF label="Units" value={s.shares} type="number" w="0.5fr" onChange={v=>update(d=>{d.otherIncome[i].shares=+v||0;return d;})} T={T}/>
        <MF label="Price" value={s.pricePerShare} type="number" w="0.7fr" onChange={v=>update(d=>{d.otherIncome[i].pricePerShare=+v||0;return d;})} T={T}/>
        <MF label="CAGR%" value={s.cagr} type="number" step="0.5" w="0.45fr" onChange={v=>update(d=>{d.otherIncome[i].cagr=+v||0;return d;})} T={T}/>
        <MF label="Decl%" value={s.cagrDecline} type="number" step="0.1" w="0.45fr" onChange={v=>update(d=>{d.otherIncome[i].cagrDecline=+v||0;return d;})} T={T}/>
        <MF label="Annual$" value={s.annualIncome} type="number" w="0.7fr" onChange={v=>update(d=>{d.otherIncome[i].annualIncome=+v||0;return d;})} T={T}/>
        <Chk label="Inc" checked={s.includeIncome} onChange={()=>update(d=>{d.otherIncome[i].includeIncome=!d.otherIncome[i].includeIncome;return d;})} T={T}/>
      </ItemRow>)}
    </Card>
    <CagrExamplesBox T={T}/>
  </div>;
}

// ============================================================
// TAB: DIVEST
// ============================================================
function DivestTab({plan, update, T}) {
  const [showPresets, setShowPresets] = useState(null);
  const applyPreset = (i, key) => {const p=CAGR_PRESETS[key];update(d=>{d.divestAssets[i].cagr=p.cagr;d.divestAssets[i].cagrDecline1=p.d1;d.divestAssets[i].cagrDecline2=p.d2;d.divestAssets[i].cagrDecline3=p.d3;return d;});setShowPresets(null);};
  return <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Investment Assets to Divest" badge="Max 20" T={T}
      action={plan.divestAssets.length<20?()=>update(d=>{d.divestAssets.push({id:mkId(),name:`Asset ${d.divestAssets.length+1}`,note:"",shares:0,pricePerShare:0,cagr:10,cagrDecline1:0.5,cagrDecline2:0.3,cagrDecline3:0.1,autoCalc:true,enabled:false});return d;}):null} actionLabel="+ Add Asset">
      <Hint T={T}>Assets sold over time using analytical withdrawal. Three-phase CAGR decline: Yr 1-5, Yr 6-20, Yr 21+</Hint>
      {plan.divestAssets.map((a,i)=><div key={a.id}>
        <ItemRow enabled={a.enabled} T={T} onToggle={()=>update(d=>{d.divestAssets[i].enabled=!d.divestAssets[i].enabled;return d;})} onRemove={()=>update(d=>{d.divestAssets.splice(i,1);return d;})}>
          <MF label="Ticker" value={a.name} w="1fr" onChange={v=>update(d=>{d.divestAssets[i].name=v;return d;})} T={T}/>
          <MF label="Shares" value={a.shares} type="number" w="0.6fr" onChange={v=>update(d=>{d.divestAssets[i].shares=+v||0;return d;})} T={T}/>
          <MF label="Price" value={a.pricePerShare} type="number" w="0.7fr" onChange={v=>update(d=>{d.divestAssets[i].pricePerShare=+v||0;return d;})} T={T}/>
          <MF label="CAGR%" value={a.cagr} type="number" step="1" w="0.45fr" onChange={v=>update(d=>{d.divestAssets[i].cagr=+v||0;return d;})} T={T}/>
          <MF label="1-5%" value={a.cagrDecline1} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.divestAssets[i].cagrDecline1=+v||0;return d;})} T={T}/>
          <MF label="6-20%" value={a.cagrDecline2} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.divestAssets[i].cagrDecline2=+v||0;return d;})} T={T}/>
          <MF label="21+%" value={a.cagrDecline3} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.divestAssets[i].cagrDecline3=+v||0;return d;})} T={T}/>
          <Chk label="Auto" checked={a.autoCalc} onChange={()=>update(d=>{d.divestAssets[i].autoCalc=!d.divestAssets[i].autoCalc;return d;})} T={T}/>
          <div style={{display:"flex",flexDirection:"column",gap:2,alignSelf:"end",paddingBottom:4}}>
            <YahooLink ticker={a.name} T={T}/>
            <button onClick={()=>setShowPresets(showPresets===i?null:i)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:FONT_LABEL}}>Preset</button>
          </div>
          {a.enabled&&a.shares>0&&a.pricePerShare>0&&<div style={{fontSize:11,color:T.gold,fontWeight:600,whiteSpace:"nowrap",alignSelf:"end",paddingBottom:5,fontFamily:FONT_MONO}}>{fmt(a.shares*a.pricePerShare)}</div>}
        </ItemRow>
        {showPresets===i&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:6,padding:"6px 28px 10px",background:T.bg,borderRadius:8,margin:"-2px 0 6px"}}>
          {Object.entries(CAGR_PRESETS).map(([k,p])=><button key={k} onClick={()=>applyPreset(i,k)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left"}}>
            <div style={{fontSize:11,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{p.label}</div>
            <div style={{fontSize:9,color:T.textMid,fontFamily:FONT_LABEL}}>{p.desc}</div>
            <div style={{fontSize:9,color:T.accent,fontFamily:FONT_MONO}}>{p.cagr}% | {p.d1}/{p.d2}/{p.d3}</div>
          </button>)}
        </div>}
      </div>)}
      {plan.divestAssets.filter(a=>a.enabled&&a.shares>0).length>0&&<div style={{background:T.summaryBg,borderRadius:10,padding:"12px 18px",marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`}}>
        <span style={{fontWeight:600,color:T.text,fontSize:13,fontFamily:FONT_LABEL}}>Total Divest Portfolio</span>
        <span style={{fontFamily:FONT_DISPLAY,fontSize:20,fontWeight:700,color:T.gold}}>{fmt(plan.divestAssets.filter(a=>a.enabled).reduce((t,a)=>t+a.shares*a.pricePerShare,0))}</span>
      </div>}
    </Card>

    {/* CAGR DECLINE EXAMPLES */}
    <CagrExamplesBox T={T}/>
  </div>;
}

// ============================================================
// CAGR DECLINE EXAMPLES BOX
// ============================================================
function CagrExamplesBox({T}) {
  const [open, setOpen] = useState(false);
  const examples = [
    {
      label:"\u{1F4C8} Growth Stocks",desc:"e.g., NVDA, AMZN, META",
      cagr:18, d1:0.8, d2:0.4, d3:0.15,
      explain:"Starts at 18% CAGR. Years 1\u20135: declines 0.8%/yr \u2192 ~14% by year 5. Years 6\u201320: declines 0.4%/yr \u2192 ~8% by year 20. Years 21+: declines 0.15%/yr, settling near 6\u20137%."
    },
    {
      label:"\u2696\uFE0F Moderate Stocks",desc:"e.g., AAPL, MSFT, JNJ",
      cagr:12, d1:0.5, d2:0.3, d3:0.1,
      explain:"Starts at 12% CAGR. Years 1\u20135: declines 0.5%/yr \u2192 ~9.5% by year 5. Years 6\u201320: declines 0.3%/yr \u2192 ~5% by year 20. Years 21+: declines 0.1%/yr, settling near 4%."
    },
    {
      label:"\u{1F6E1}\uFE0F Conservative / Index",desc:"e.g., SPY, VOO, VTI",
      cagr:10, d1:0.3, d2:0.2, d3:0.1,
      explain:"Starts at 10% CAGR. Years 1\u20135: declines 0.3%/yr \u2192 ~8.5% by year 5. Years 6\u201320: declines 0.2%/yr \u2192 ~5.5% by year 20. Years 21+: declines 0.1%/yr, settling near 4\u20135%."
    },
  ];
  return <Card title="CAGR Decline Examples" T={T}>
    <div style={{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onClick={()=>setOpen(!open)}>
      <Hint T={T}>How does the 3-phase CAGR decline work? Click to {open?"hide":"see"} examples for common stock types.</Hint>
      <span style={{fontSize:16,color:T.accent,transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",flexShrink:0}}>{"\u25BC"}</span>
    </div>
    {open&&<div style={{display:"flex",flexDirection:"column",gap:10,marginTop:6}}>
      <div style={{fontSize:12,color:T.textMid,fontFamily:FONT_LABEL,lineHeight:1.6,padding:"0 4px"}}>
        The 3-phase model assumes high early growth that gradually matures \u2014 mimicking how companies evolve from high-growth to stable phases. The three decline rates (1-5%, 6-20%, 21+%) control how quickly CAGR drops in each period. The CAGR never goes below 0%.
      </div>
      {examples.map((ex,i)=><div key={i} style={{background:T.inputBg,borderRadius:10,padding:"14px 18px",border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
          <div>
            <span style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{ex.label}</span>
            <span style={{fontSize:11,color:T.textMid,marginLeft:8,fontFamily:FONT_LABEL}}>{ex.desc}</span>
          </div>
          <div style={{fontFamily:FONT_MONO,fontSize:12,color:T.accent,background:`${T.accent}10`,padding:"3px 10px",borderRadius:6}}>
            {ex.cagr}% \u2192 {ex.d1} / {ex.d2} / {ex.d3}
          </div>
        </div>
        <div style={{fontSize:11.5,color:T.text,fontFamily:FONT_LABEL,lineHeight:1.7,opacity:0.85}}>{ex.explain}</div>
      </div>)}
      <div style={{fontSize:11,color:T.textDim,fontFamily:FONT_LABEL,padding:"4px 4px 0",lineHeight:1.5}}>
        {"\u{1F4A1}"} <strong>Tip:</strong> Use the Preset button on each asset for quick setup. Conservative declines suit index funds; steeper declines suit individual growth stocks that may mature or face competition over decades.
      </div>
    </div>}
  </Card>;
}

// ============================================================
// TAB: FIXED ASSETS — NOW 3-phase CAGR decline
// ============================================================
function FixedAssetsTab({plan, update, T}) {
  const [showPresets, setShowPresets] = useState(null);
  const applyPreset = (i,key)=>{const p=CAGR_PRESETS[key];update(d=>{d.fixedAssets[i].cagr=p.cagr;d.fixedAssets[i].cagrDecline1=p.d1;d.fixedAssets[i].cagrDecline2=p.d2;d.fixedAssets[i].cagrDecline3=p.d3;return d;});setShowPresets(null);};
  return <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Fixed Assets (Non-Income)" badge="Real Estate, Precious Metals, Collectibles, Hard Assets" T={T}
      action={plan.fixedAssets.length<10?()=>update(d=>{d.fixedAssets.push({id:mkId(),name:"New Asset",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline1:0.1,cagrDecline2:0.05,cagrDecline3:0.02,enabled:false});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Assets that grow in value but don't generate income. Three-phase CAGR decline: Yr 1-5, Yr 6-20, Yr 21+</Hint>
      {plan.fixedAssets.map((a,i)=><div key={a.id}>
        <ItemRow enabled={a.enabled} T={T} onToggle={()=>update(d=>{d.fixedAssets[i].enabled=!d.fixedAssets[i].enabled;return d;})} onRemove={()=>update(d=>{d.fixedAssets.splice(i,1);return d;})}>
          <MF label="Name" value={a.name} w="1.5fr" onChange={v=>update(d=>{d.fixedAssets[i].name=v;return d;})} T={T}/>
          <MF label="Units" value={a.shares} type="number" w="0.5fr" onChange={v=>update(d=>{d.fixedAssets[i].shares=+v||0;return d;})} T={T}/>
          <MF label="Price" value={a.pricePerShare} type="number" w="1fr" onChange={v=>update(d=>{d.fixedAssets[i].pricePerShare=+v||0;return d;})} T={T}/>
          <MF label="CAGR%" value={a.cagr} type="number" step="0.5" w="0.45fr" onChange={v=>update(d=>{d.fixedAssets[i].cagr=+v||0;return d;})} T={T}/>
          <MF label="1-5%" value={a.cagrDecline1!==undefined?a.cagrDecline1:(a.cagrDecline||0.1)} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.fixedAssets[i].cagrDecline1=+v||0;return d;})} T={T}/>
          <MF label="6-20%" value={a.cagrDecline2!==undefined?a.cagrDecline2:((a.cagrDecline||0.1)*0.5)} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.fixedAssets[i].cagrDecline2=+v||0;return d;})} T={T}/>
          <MF label="21+%" value={a.cagrDecline3!==undefined?a.cagrDecline3:((a.cagrDecline||0.1)*0.2)} type="number" step="0.1" w="0.4fr" onChange={v=>update(d=>{d.fixedAssets[i].cagrDecline3=+v||0;return d;})} T={T}/>
          {a.enabled&&a.pricePerShare>0&&<div style={{fontSize:11,color:T.green,fontWeight:600,whiteSpace:"nowrap",alignSelf:"end",paddingBottom:5,fontFamily:FONT_MONO}}>{fmt(a.shares*a.pricePerShare)}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:2,alignSelf:"end",paddingBottom:4}}>
            <button onClick={()=>setShowPresets(showPresets===i?null:i)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:FONT_LABEL}}>Preset</button>
          </div>
        </ItemRow>
        {showPresets===i&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:6,padding:"6px 28px 10px",background:T.bg,borderRadius:8,margin:"-2px 0 6px"}}>
          {Object.entries(CAGR_PRESETS).map(([k,p])=><button key={k} onClick={()=>applyPreset(i,k)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left"}}>
            <div style={{fontSize:11,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{p.label}</div>
            <div style={{fontSize:9,color:T.textMid,fontFamily:FONT_LABEL}}>{p.desc}</div>
            <div style={{fontSize:9,color:T.accent,fontFamily:FONT_MONO}}>{p.cagr}% | {p.d1}/{p.d2}/{p.d3}</div>
          </button>)}
        </div>}
      </div>)}
    </Card>
    <CagrExamplesBox T={T}/>
  </div>;
}

// ============================================================
// TAB: PROJECTIONS (frozen year column)
// ============================================================
function ProjectionsTab({plan, results, T}) {
  const ea=plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const ei=plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  if(!results.length) return <div style={{width:"100%"}}><Card title="Projections" T={T}><Empty T={T}/></Card></div>;
  const th={padding:"7px 6px",textAlign:"right",fontSize:10,fontWeight:600,color:"#ccc",whiteSpace:"nowrap",fontFamily:FONT_MONO};
  const td={padding:"5px 6px",textAlign:"right",fontSize:11,whiteSpace:"nowrap",fontFamily:FONT_MONO,color:T.text};
  return <div style={{width:"100%"}}><Card title="Year-by-Year Projections" T={T}>
    <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"75vh",width:"100%"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
        <thead style={{position:"sticky",top:0,zIndex:2}}>
          <tr style={{background:"#1a1a3a"}}>
            <th style={{...th,position:"sticky",left:0,zIndex:3,background:"#1a1a3a",textAlign:"left"}}>Year</th>
            <th style={th}>Age</th><th style={{...th,color:T.gold}}>Total Income</th><th style={{...th,color:T.green}}>Portfolio</th>
            <th style={th}>Fixed</th><th style={th}>Inv.Inc</th><th style={th}>Div</th><th style={th}>Other</th>
            {ea.map(a=><th key={a.id} colSpan={3} style={{...th,background:"#222244"}}>{a.name}</th>)}
            {ei.map(s=><th key={s.id} colSpan={2} style={{...th,background:"#1a2a3a"}}>{s.name}</th>)}
          </tr>
          {(ea.length>0||ei.length>0)&&<tr style={{background:T.card}}>
            <th style={{...th,position:"sticky",left:0,zIndex:3,background:T.card,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/>
            <th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/>
            {ea.map(a=><React.Fragment key={a.id}><th style={{...th,fontSize:8,color:T.textDim}}>W/D</th><th style={{...th,fontSize:8,color:T.textDim}}>Shrs</th><th style={{...th,fontSize:8,color:T.textDim}}>Px</th></React.Fragment>)}
            {ei.map(s=><React.Fragment key={s.id}><th style={{...th,fontSize:8,color:T.textDim}}>W/D</th><th style={{...th,fontSize:8,color:T.textDim}}>Div</th></React.Fragment>)}
          </tr>}
        </thead>
        <tbody>{results.map((r,i)=><tr key={i} style={{background:i%2?T.rowAlt:"transparent",borderBottom:`1px solid ${T.border}`}}>
          <td style={{...td,position:"sticky",left:0,zIndex:1,background:i%2?T.rowAlt:T.card,fontWeight:600,textAlign:"left"}}>{r.year}</td>
          <td style={td}>{r.age}</td><td style={{...td,fontWeight:700,color:T.gold}}>{fmt(r.totalIncome)}</td><td style={{...td,fontWeight:700,color:T.green}}>{fmtK(r.totalValue)}</td>
          <td style={td}>{fmt(r.fixedIncome)}</td><td style={td}>{fmt(r.investmentIncome)}</td><td style={td}>{fmt(r.dividendIncome)}</td><td style={td}>{fmt(r.otherIncome)}</td>
          {r.assets.map((a,j)=><React.Fragment key={j}><td style={td}>{fmt(a.withdrawal)}</td><td style={{...td,color:T.textDim}}>{fmtN(a.shares,1)}</td><td style={{...td,color:T.textDim}}>{fmt(a.price)}</td></React.Fragment>)}
          {(r.investmentIncomeSources||[]).map((s,j)=><React.Fragment key={j}><td style={td}>{fmt(s.withdrawal)}</td><td style={{...td,color:T.green}}>{fmt(s.dividendIncome)}</td></React.Fragment>)}
        </tr>)}</tbody>
      </table>
    </div>
  </Card></div>;
}

// ============================================================
// TAB: WITHDRAWAL PLAN
// ============================================================
function WithdrawalTab({plan, results, T}) {
  const ea=plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const ei=plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  if(!results.length||(!ea.length&&!ei.length)) return <div style={{width:"100%"}}><Card title="Withdrawal Plan" T={T}><Empty T={T} msg="Enable divest assets or registered investment income to see withdrawal schedule."/></Card></div>;
  const th={padding:"8px 8px",textAlign:"right",fontSize:11,fontWeight:600,color:"#ccc",whiteSpace:"nowrap",fontFamily:FONT_MONO};
  const td={padding:"6px 8px",textAlign:"right",fontSize:12,whiteSpace:"nowrap",fontFamily:FONT_MONO,color:T.text};
  return <div style={{width:"100%"}}><Card title="Annual Withdrawal Plan" T={T}>
    <Hint T={T}>Shares to sell each year and income generated from each asset and registered investment account.</Hint>
    <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"75vh",width:"100%"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead style={{position:"sticky",top:0,zIndex:2}}>
          <tr style={{background:"#1a1a3a"}}>
            <th style={{...th,position:"sticky",left:0,zIndex:3,background:"#1a1a3a",textAlign:"left"}}>Year</th>
            <th style={th}>Age</th><th style={{...th,color:T.gold}}>Total W/D</th>
            {ea.map(a=><React.Fragment key={a.id}><th style={{...th,background:"#222244"}}>{a.name} Sell</th><th style={{...th,background:"#222244"}}>{a.name} Inc</th><th style={{...th,background:"#1a1a3a"}}>{a.name} Left</th></React.Fragment>)}
            {ei.map(s=><React.Fragment key={s.id}><th style={{...th,background:"#1a2a3a"}}>{s.name} Sell</th><th style={{...th,background:"#1a2a3a"}}>{s.name} Div</th><th style={{...th,background:"#1a2a3a"}}>{s.name} Left</th></React.Fragment>)}
          </tr>
        </thead>
        <tbody>{results.map((r,i)=>{
          const tw=(r.assets.reduce((t,a)=>t+a.withdrawal,0))+(r.investmentIncomeSources||[]).reduce((t,s)=>t+s.withdrawal+s.dividendIncome,0);
          return<tr key={i} style={{background:i%2?T.rowAlt:"transparent",borderBottom:`1px solid ${T.border}`}}>
            <td style={{...td,position:"sticky",left:0,zIndex:1,background:i%2?T.rowAlt:T.card,fontWeight:600,textAlign:"left"}}>{r.year}</td>
            <td style={td}>{r.age}</td><td style={{...td,fontWeight:700,color:T.gold}}>{fmt(tw)}</td>
            {r.assets.map((a,j)=><React.Fragment key={j}><td style={{...td,color:T.accent}}>{fmtN(a.sharesSold,4)}</td><td style={{...td,color:T.green}}>{fmt(a.withdrawal)}</td><td style={{...td,color:T.textDim}}>{fmtN(a.shares,2)}</td></React.Fragment>)}
            {(r.investmentIncomeSources||[]).map((s,j)=><React.Fragment key={j}><td style={{...td,color:T.cyan}}>{fmtN(s.sharesSold,4)}</td><td style={{...td,color:T.green}}>{fmt(s.dividendIncome)}</td><td style={{...td,color:T.textDim}}>{fmtN(s.shares,2)}</td></React.Fragment>)}
          </tr>;})}</tbody>
      </table>
    </div>
  </Card></div>;
}

// ============================================================
// TAB: CHARTS (dropdown selector like InvestAnswers)
// ============================================================
const CHART_VIEWS=[
  {id:"portfolio",label:"Total Portfolio Value"},
  {id:"income",label:"Annual Income (Stacked)"},
  {id:"appreciation",label:"Growth vs Spending"},
  {id:"withdrawals",label:"Withdrawals by Asset"},
  {id:"shares",label:"Remaining Shares"},
  {id:"fixedAssets",label:"Fixed Assets Value"},
];

function ChartsTab({plan, results, T}) {
  const [view,setView]=useState("portfolio");
  const ea=plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const efa=plan.fixedAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  if(!results.length) return <div style={{width:"100%"}}><Card title="Charts" T={T}><Empty T={T}/></Card></div>;
  const desc={portfolio:"Total portfolio value over time.",income:"Stacked income breakdown from all sources.",appreciation:"Portfolio appreciation vs total withdrawals each year.",withdrawals:"Annual withdrawal amount from each divest asset.",shares:"Remaining share count as assets are sold down.",fixedAssets:"Fixed asset appreciation over the projection."};
  const CTooltip=({active,payload,label})=>{if(!active||!payload?.length)return null;return<div style={{background:"#0d0d1f",border:"1px solid #2a2a4a",borderRadius:8,padding:"10px 14px",fontSize:11,fontFamily:FONT_MONO}}><div style={{color:"#888",marginBottom:4}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,marginBottom:2}}>{p.name}: {typeof p.value==="number"&&p.value>100?fmtK(p.value):fmtN(p.value,2)}</div>)}</div>;};

  const renderChart=()=>{
    if(view==="portfolio"){
      const data=results.map(r=>({year:r.year,Portfolio:r.totalValue}));
      return<ResponsiveContainer><AreaChart data={data}><defs><linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.accent} stopOpacity={0.3}/><stop offset="100%" stopColor={T.accent} stopOpacity={0}/></linearGradient></defs>
        <XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Area type="monotone" dataKey="Portfolio" stroke={T.accent} fill="url(#gP)" strokeWidth={2.5}/></AreaChart></ResponsiveContainer>;
    }
    if(view==="income"){
      const data=results.map(r=>({year:r.year,Fixed:r.fixedIncome,Withdrawals:r.assets?.reduce((t,a)=>t+a.withdrawal,0)||0,Dividends:r.dividendIncome,Other:r.otherIncome}));
      return<ResponsiveContainer><ComposedChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        <Bar dataKey="Fixed" stackId="a" fill={T.accent}/><Bar dataKey="Withdrawals" stackId="a" fill={T.gold}/><Bar dataKey="Dividends" stackId="a" fill={T.green}/><Bar dataKey="Other" stackId="a" fill={T.purple} radius={[3,3,0,0]}/></ComposedChart></ResponsiveContainer>;
    }
    if(view==="appreciation"){
      const data=results.map((r,i)=>{const pv=i>0?results[i-1].totalValue:r.totalValue;return{year:r.year,Appreciation:Math.max(r.totalValue-pv+r.totalIncome,0),Spending:r.totalIncome};});
      return<ResponsiveContainer><ComposedChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        <Bar dataKey="Appreciation" fill={T.accent}/><Line dataKey="Spending" stroke={T.gold} strokeWidth={2} dot={false} strokeDasharray="6 3"/></ComposedChart></ResponsiveContainer>;
    }
    if(view==="withdrawals"){
      const data=results.map(r=>{const o={year:r.year};r.assets.forEach(a=>{o[a.name]=a.withdrawal;});return o;});
      return<ResponsiveContainer><LineChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        {ea.map((a,i)=><Line key={a.id} type="monotone" dataKey={a.name} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>;
    }
    if(view==="shares"){
      const data=results.map(r=>{const o={year:r.year};r.assets.forEach(a=>{o[a.name]=a.shares;});return o;});
      return<ResponsiveContainer><LineChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        {ea.map((a,i)=><Line key={a.id} type="monotone" dataKey={a.name} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>;
    }
    if(view==="fixedAssets"){
      if(!efa.length) return<div style={{textAlign:"center",padding:60,color:T.textDim}}>No fixed assets enabled.</div>;
      const data=results.map(r=>{const o={year:r.year};(r.fixedAssetValues||[]).forEach(a=>{o[a.name]=a.value;});return o;});
      return<ResponsiveContainer><LineChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        {efa.map((a,i)=><Line key={a.id} type="monotone" dataKey={a.name} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>;
    }
  };

  return<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden",width:"100%"}}>
    <div style={{padding:"16px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
      <div><h2 style={{fontFamily:FONT_DISPLAY,fontSize:18,color:T.text,margin:0}}>Portfolio Projections</h2><p style={{fontSize:11,color:T.textDim,margin:"4px 0 0",fontFamily:FONT_LABEL}}>{desc[view]}</p></div>
      <div>
        <label style={{fontSize:9,color:T.label,fontFamily:FONT_LABEL,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:3}}>Chart View</label>
        <select value={view} onChange={e=>setView(e.target.value)} style={{
          background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:8,padding:"8px 30px 8px 12px",
          color:T.text,fontSize:13,fontFamily:FONT_LABEL,cursor:"pointer",appearance:"none",minWidth:220,
          backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23888' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
          backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",
        }}>{CHART_VIEWS.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select>
      </div>
    </div>
    <div style={{padding:"0 12px 16px",height:440}}>{renderChart()}</div>
  </div>;
}

// ============================================================
// TAB: ADDITIONAL
// ============================================================
function AdditionalTab({plan, update, T}) {
  const total=plan.bigTicketStocks.filter(s=>s.enabled).reduce((t,s)=>t+s.shares*s.price,0);
  return<div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Notes & Plans" T={T}>
      <textarea value={plan.notes||""} onChange={e=>update(d=>{d.notes=e.target.value;return d;})} placeholder="Emergency fund, healthcare, estate planning, tax strategies..."
        style={{width:"100%",minHeight:140,padding:14,background:T.inputBg,border:`1px solid ${T.border}`,borderRadius:8,fontFamily:FONT_LABEL,fontSize:13,color:T.text,resize:"vertical",outline:"none"}}/>
    </Card>
    <Card title="Big Ticket Calculator" T={T} action={plan.bigTicketStocks.length<10?()=>update(d=>{d.bigTicketStocks.push({id:mkId(),ticker:"",shares:0,price:0,enabled:false});return d;}):null} actionLabel="+ Add">
      <Field label="Saving for?" value={plan.bigTicketItem||""} onChange={v=>update(d=>{d.bigTicketItem=v;return d;})} T={T} placeholder="e.g., House down payment"/>
      <div style={{marginTop:10}}>{plan.bigTicketStocks.map((s,i)=><ItemRow key={s.id} enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.bigTicketStocks[i].enabled=!d.bigTicketStocks[i].enabled;return d;})} onRemove={()=>update(d=>{d.bigTicketStocks.splice(i,1);return d;})}>
        <MF label="Ticker" value={s.ticker} w="1fr" onChange={v=>update(d=>{d.bigTicketStocks[i].ticker=v;return d;})} T={T}/>
        <MF label="Shares" value={s.shares} type="number" w="0.7fr" onChange={v=>update(d=>{d.bigTicketStocks[i].shares=+v||0;return d;})} T={T}/>
        <MF label="Price" value={s.price} type="number" w="0.7fr" onChange={v=>update(d=>{d.bigTicketStocks[i].price=+v||0;return d;})} T={T}/>
        <YahooLink ticker={s.ticker} T={T}/>
        {s.enabled&&s.shares>0&&s.price>0&&<div style={{fontSize:11,color:T.green,fontWeight:600,alignSelf:"end",paddingBottom:5,fontFamily:FONT_MONO}}>{fmt(s.shares*s.price)}</div>}
      </ItemRow>)}</div>
      {total>0&&<div style={{background:T.summaryBg,border:`1px solid ${T.gold}20`,borderRadius:10,padding:18,marginTop:10,textAlign:"center"}}>
        <div style={{fontSize:10,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:4,fontFamily:FONT_LABEL}}>Total Available</div>
        <div style={{fontFamily:FONT_DISPLAY,fontSize:26,fontWeight:700,color:T.gold}}>{fmt(total)}</div>
      </div>}
      <div style={{background:T.inputBg,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 18px",marginTop:10}}>
        <div style={{fontSize:11,fontWeight:700,color:T.accent,fontFamily:FONT_LABEL,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>What is being sold to fund big ticket items?</div>
        <div style={{fontSize:12,color:T.textMid,fontFamily:FONT_LABEL,lineHeight:1.7}}>
          The Big Ticket Calculator shows the <strong style={{color:T.text}}>current market value</strong> of stocks you could liquidate for a major purchase.
          When selling, consider: <strong style={{color:T.text}}>capital gains tax</strong> on appreciated positions,
          the <strong style={{color:T.text}}>opportunity cost</strong> of removing assets from your growth portfolio,
          and whether selling from <strong style={{color:T.text}}>registered accounts</strong> (RRSP/401k/TFSA/IRA) triggers additional withholding tax.
          Cross-reference with your Assets to Divest and Registered Investment Income tabs to understand the full impact on your retirement projections.
        </div>
      </div>
    </Card>
  </div>;
}

// ============================================================
// SHARED COMPONENTS — modern fonts throughout
// ============================================================
function Card({title,badge,children,action,actionLabel,T,noPad}){return<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:noPad?0:"16px 20px",overflow:"hidden",width:"100%"}}>
  {title&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><h2 style={{fontFamily:FONT_DISPLAY,fontSize:17,color:T.text,margin:0}}>{title}</h2>
    {badge&&<span style={{fontSize:9,color:T.textMid,background:`${T.accent}10`,padding:"2px 8px",borderRadius:10,fontFamily:FONT_LABEL}}>{badge}</span>}</div>
    {action&&<button onClick={action} style={{padding:"5px 12px",background:T.accent,color:"#fff",border:"none",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:FONT_LABEL}}>{actionLabel}</button>}
  </div>}{children}</div>;}

function ItemRow({children,enabled,onToggle,onRemove,T}){return<div style={{display:"flex",gap:6,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:8,border:`1px solid ${enabled?T.accent+"20":T.border}`,background:enabled?T.inputBg+"80":"transparent",opacity:enabled?1:0.5,transition:"all 0.15s",flexWrap:"wrap"}}>
  <button onClick={onToggle} style={{width:18,height:18,borderRadius:3,border:`2px solid ${enabled?T.green:T.border2}`,background:enabled?T.green:"transparent",color:"#fff",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:16,padding:0}}>{enabled?"\u2713":""}</button>
  <div style={{display:"flex",gap:6,flex:1,flexWrap:"wrap",alignItems:"flex-start"}}>{children}</div>
  <button onClick={onRemove} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:14,padding:2,marginTop:14,flexShrink:0}}>{"\u00D7"}</button></div>;}

function Field({label,value,onChange,type="text",step,placeholder,T}){return<div><label style={{fontSize:10,color:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:3,fontFamily:FONT_LABEL}}>{label}</label>
  <input type={type} value={value} step={step} placeholder={placeholder} onChange={e=>onChange(e.target.value)} onFocus={e=>e.target.select()} style={{width:"100%",padding:"7px 10px",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:6,fontSize:13,color:T.text,fontFamily:FONT_LABEL}}/></div>;}

function MF({label,value,onChange,type="text",step,w="1fr",T}){return<div style={{minWidth:50,flex:w}}><label style={{fontSize:9,color:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,display:"block",marginBottom:2,fontFamily:FONT_LABEL}}>{label}</label>
  <input type={type} value={value} step={step} onChange={e=>onChange(e.target.value)} onFocus={e=>e.target.select()} style={{width:"100%",padding:"4px 6px",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:4,fontSize:12,color:T.text,fontFamily:FONT_LABEL}}/></div>;}

function Chk({label,checked,onChange,T}){return<div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:32}}><label style={{fontSize:9,color:T.label,fontWeight:600,letterSpacing:0.3,marginBottom:2,fontFamily:FONT_LABEL}}>{label}</label>
  <input type="checkbox" checked={checked} onChange={onChange} style={{width:14,height:14,cursor:"pointer",accentColor:T.accent}}/></div>;}

function SumCard({label,value,color,T}){return<div style={{background:T.card,borderRadius:10,padding:"14px 16px",textAlign:"center",border:`1px solid ${T.border}`,borderLeft:`3px solid ${color}`,minHeight:72}}>
  <div style={{fontSize:10,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:5,fontFamily:FONT_LABEL}}>{label}</div>
  <div style={{fontSize:20,fontWeight:700,color,fontFamily:FONT_DISPLAY,lineHeight:1.2}}>{value}</div></div>;}

function Hint({children,T}){return<p style={{color:T.textDim,fontSize:12,marginBottom:10,fontFamily:FONT_LABEL,lineHeight:1.4}}>{children}</p>;}
function Empty({T,msg}){return<p style={{color:T.textDim,textAlign:"center",padding:50,fontSize:13,fontFamily:FONT_LABEL}}>{msg||"Enable at least one asset or income source."}</p>;}
function SaveDot({status,T}){const c=status==="saving"?T.gold:T.green;return<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:c,fontFamily:FONT_LABEL}}><span style={{width:5,height:5,borderRadius:"50%",background:c}}/>{status==="saving"?"Saving...":"Saved"}</div>;}
function SmBtn({onClick,label,T,danger}){return<button onClick={onClick} style={{padding:"5px 12px",background:danger?T.red+"15":T.inputBg,color:danger?T.red:T.textMid,border:`1px solid ${danger?T.red+"30":T.border2}`,borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:500,fontFamily:FONT_LABEL,whiteSpace:"nowrap"}}>{label}</button>;}
