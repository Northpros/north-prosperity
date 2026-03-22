import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

// ============================================================
// NORTH PROSPERITY RETIREMENT PLANNER — v2.3 Phase 2
// Phase 1: Tax engine + sub-row UI, cap gains, cost basis
// Phase 2: Revised summary cards (6, new order/colors),
//   notional gain tax ⓘ bubble, Year 1 Net only when tax active,
//   2 new charts (Gross vs Net Income, Annual Tax Paid)
// ============================================================

// ── Formatting ────────────────────────────────────────────────
const CURRENCIES=[
  {code:"USD",label:"USD — US Dollar"},
  {code:"CAD",label:"CAD — Canadian Dollar"},
  {code:"EUR",label:"EUR — Euro"},
  {code:"GBP",label:"GBP — British Pound"},
  {code:"AUD",label:"AUD — Australian Dollar"},
  {code:"NZD",label:"NZD — New Zealand Dollar"},
  {code:"CHF",label:"CHF — Swiss Franc"},
  {code:"MXN",label:"MXN — Mexican Peso"},
];
const CURRENCY_CODES=CURRENCIES.map(c=>c.code);
const fmt=(v,cur="USD")=>{const c=CURRENCY_CODES.includes(cur)?cur:"USD";return new Intl.NumberFormat("en-US",{style:"currency",currency:c,minimumFractionDigits:0,maximumFractionDigits:0}).format(v||0);};
const fmtK=(v,cur="USD")=>{v=v||0;const c=CURRENCY_CODES.includes(cur)?cur:"USD";try{const sym=new Intl.NumberFormat("en-US",{style:"currency",currency:c,minimumFractionDigits:0,maximumFractionDigits:0}).formatToParts(1).find(p=>p.type==="currency")?.value||"$";return Math.abs(v)>=1e9?`${sym}${(v/1e9).toFixed(1)}B`:Math.abs(v)>=1e6?`${sym}${(v/1e6).toFixed(1)}M`:Math.abs(v)>=1e3?`${sym}${(v/1e3).toFixed(0)}k`:fmt(v,c);}catch{return fmt(v,c);}};
const fmtN=(v,d=2)=>new Intl.NumberFormat("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v||0);
const fmtPct=v=>`${(v||0).toFixed(1)}%`;
const toBase=(v,cur,base,rates)=>{if(!rates||cur===base)return v;const r=typeof rates==="object"?rates:{CAD:rates};const usdV=cur==="USD"?v:(r[cur]?v/r[cur]:v);return base==="USD"?usdV:(r[base]?usdV*r[base]:usdV);};

// ── Theme ─────────────────────────────────────────────────────
const themes = {
  dark: {
    bg:"#07071a", card:"#0d0d1f", border:"#1a1a3a", border2:"#2a2a4a",
    inputBg:"#1a1a2e", text:"#e0e0ff", textMid:"#888", textDim:"#555",
    accent:"#6C8EFF", gold:"#d4af37", green:"#34d399", red:"#ef4444",
    purple:"#a78bfa", cyan:"#06b6d4", label:"#888",
    rowAlt:"#0a0a18", rowHover:"#12122a",
    headerBg:"#0d0d1f", summaryBg:"#0f0f24",
    amber:"#f59e0b",
  },
  light: {
    bg:"#f0f2f8", card:"#ffffff", border:"#d0d4e8", border2:"#c0c8e0",
    inputBg:"#f8f9ff", text:"#1a1a3a", textMid:"#556", textDim:"#778",
    accent:"#4a6ef5", gold:"#b8941f", green:"#059669", red:"#dc2626",
    purple:"#7c3aed", cyan:"#0891b2", label:"#778",
    rowAlt:"#f8f9ff", rowHover:"#eef1ff",
    headerBg:"#ffffff", summaryBg:"#f0f4ff",
    amber:"#d97706",
  }
};
const CHART_COLORS = ["#6C8EFF","#d4af37","#34d399","#a78bfa","#06b6d4","#ec4899","#f59e0b","#ef4444","#84cc16","#f472b6"];

// ── CAGR Presets ──────────────────────────────────────────────
const CAGR_PRESETS = {
  "hyper":       { label:"🔥 Hyper Growth",     desc:"Disruptive companies (early TSLA, early NVDA)", cagr:30, d1:2.8, d2:1.0, d3:0.2 },
  "aggressive":  { label:"🚀 Aggressive Growth", desc:"High-growth stocks (TSLA, MSTR)", cagr:25, d1:1.5, d2:0.7, d3:0.2 },
  "growth":      { label:"📈 Growth",            desc:"Tech/growth stocks (NVDA, AMZN)", cagr:18, d1:0.8, d2:0.4, d3:0.15 },
  "moderate":    { label:"⚖️ Moderate",          desc:"Blue chips (AAPL, MSFT)", cagr:12, d1:0.5, d2:0.3, d3:0.1 },
  "conservative":{ label:"🛡️ Conservative",      desc:"Index funds (SPY, VOO)", cagr:10, d1:0.3, d2:0.2, d3:0.1 },
  "ultra":       { label:"💴 Ultra Conservative", desc:"Bonds, GICs, T-Bills", cagr:3, d1:0.1, d2:0.0, d3:0.0 },
  "crypto":      { label:"₿ Crypto",             desc:"Bitcoin, Ethereum", cagr:28, d1:2.5, d2:0.7, d3:0.12 },
  "income":      { label:"💰 Income/Dividend",    desc:"REITs, dividend ETFs", cagr:7, d1:0.2, d2:0.1, d3:0.05 },
};

// ── Default Data ──────────────────────────────────────────────
const mkId = () => Date.now() + Math.random();

// Tax defaults: taxRate=0, applyTax=false, costBasis=0 (for cap gains rows)
const DEFAULT_PLAN = {
  params: { personName:"", ageAtStart:60, inflationRate:3, startYear:2030, projectionYears:30, baseCurrency:"USD" },
  divestAssets: [
    {id:1,name:"Asset 1",note:"",shares:0,pricePerShare:0,cagr:10,cagrDecline1:0.5,cagrDecline2:0.3,cagrDecline3:0.1,dividendPercent:0,includeDividend:false,autoCalc:true,enabled:false,taxRate:0,applyTax:false,costBasis:0},
    {id:2,name:"Asset 2",note:"",shares:0,pricePerShare:0,cagr:10,cagrDecline1:0.5,cagrDecline2:0.3,cagrDecline3:0.1,dividendPercent:0,includeDividend:false,autoCalc:true,enabled:false,taxRate:0,applyTax:false,costBasis:0},
  ],
  fixedIncome: [
    {id:1,name:"Pension",amount:0,startYear:2030,indexing:0,enabled:false,taxRate:0,applyTax:false},
    {id:2,name:"Social Security",amount:0,startYear:2030,indexing:2,enabled:false,taxRate:0,applyTax:false},
  ],
  investmentIncome: [
    {id:1,name:"401k",note:"",shares:0,pricePerShare:0,cagr:7,cagrDecline1:0.3,cagrDecline2:0.2,cagrDecline3:0.1,dividendPercent:0,includeDividend:false,autoCalc:true,enabled:false,taxRate:0,applyTax:false},
  ],
  otherIncome: [
    {id:1,name:"Business Income",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline:0.1,annualIncome:0,includeIncome:false,enabled:false,taxRate:0,applyTax:false},
  ],
  fixedAssets: [
    {id:1,name:"Primary Residence",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline1:0.1,cagrDecline2:0.05,cagrDecline3:0.02,enabled:false,taxRate:0,applyTax:false,costBasis:0},
  ],
  bigTicketStocks: [{id:1,ticker:"",shares:0,price:0,enabled:false,taxRate:0,applyTax:false,costBasis:0}],
  bigTicketItem: "",
  notes: "",
};

// ── CALCULATION ENGINE ──
function runProjection(plan, fxRates={}) {
  const p = plan.params;
  const base = p.baseCurrency||"USD";
  const rates = (fxRates&&typeof fxRates==="object")?fxRates:{};
  const inf = p.inflationRate / 100;
  const sy = p.startYear, py = p.projectionYears;
  const totalYears = Math.ceil(py);
  const fracYear = py % 1;
  const ea = plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const ef = plan.fixedIncome.filter(s=>s.enabled&&s.amount>0);
  const ei = plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  const efa = plan.fixedAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const eo = plan.otherIncome.filter(s=>s.enabled&&((s.shares>0&&s.pricePerShare>0)||(s.includeIncome&&s.annualIncome>0)));
  if(!ea.length&&!ef.length&&!ei.length&&!eo.length&&!efa.length) return [];

  const build3Phase = (baseRate, d1, d2, d3) => {
    const sc = baseRate/100;
    const dd1=(d1||0)/100, dd2=(d2||0)/100, dd3=(d3||0)/100;
    const p2s=sc-5*dd1, p3s=p2s-15*dd2;
    const mult = [1];
    for(let y=1;y<totalYears;y++){
      let yc; if(y<=5) yc=sc-y*dd1; else if(y<=20) yc=p2s-(y-5)*dd2; else yc=p3s-(y-20)*dd3;
      yc=Math.max(yc,0); mult.push(mult[y-1]*(1+yc));
    }
    return mult;
  };

  const dp = ea.map(a=>{
    const mult = build3Phase(a.cagr, a.cagrDecline1, a.cagrDecline2, a.cagrDecline3);
    const bp=toBase(a.pricePerShare,a.currency||base,base,rates);
    return mult.map(m=>Math.round(bp*m));
  });
  const ip = ei.map(s=>{
    const d1=s.cagrDecline1!==undefined?s.cagrDecline1:(s.cagrDecline||0.3);
    const d2=s.cagrDecline2!==undefined?s.cagrDecline2:((s.cagrDecline||0.3)*0.6);
    const d3=s.cagrDecline3!==undefined?s.cagrDecline3:((s.cagrDecline||0.3)*0.3);
    const mult = build3Phase(s.cagr, d1, d2, d3);
    const bp=toBase(s.pricePerShare,s.currency||base,base,rates);
    return mult.map(m=>Math.round(bp*m));
  });
  const fap = efa.map(a=>{
    const d1=a.cagrDecline1!==undefined?a.cagrDecline1:(a.cagrDecline||0.1);
    const d2=a.cagrDecline2!==undefined?a.cagrDecline2:((a.cagrDecline||0.1)*0.5);
    const d3=a.cagrDecline3!==undefined?a.cagrDecline3:((a.cagrDecline||0.1)*0.2);
    const mult = build3Phase(a.cagr, d1, d2, d3);
    const bp=toBase(a.pricePerShare,a.currency||base,base,rates);
    return mult.map(m=>Math.round(bp*m));
  });
  const op = eo.map(s=>{
    const b=s.cagr/100,d=(s.cagrDecline||0)/100,pr=[Math.round(toBase(s.pricePerShare||0,s.currency||base,base,rates))];
    for(let y=1;y<totalYears;y++){let yc=b-d*y;yc=Math.max(yc,0);pr.push(Math.round(pr[y-1]*(1+yc)));}return pr;
  });

  const aw = ea.map((a,i)=>{
    if(!a.autoCalc)return 0; let sr=0;
    for(let y=0;y<totalYears;y++){const yf=(fracYear>0&&y===totalYears-1)?fracYear:1;sr+=yf*Math.pow(1+inf,y)/dp[i][y];}return a.shares/sr;
  });
  const iw = ei.map((s,i)=>{
    if(!s.autoCalc)return 0; let sr=0;
    for(let y=0;y<totalYears;y++){const yf=(fracYear>0&&y===totalYears-1)?fracYear:1;sr+=yf*Math.pow(1+inf,y)/ip[i][y];}return s.shares/sr;
  });

  const ds = ea.map((a,i)=>({rem:a.shares,bw:Math.round(aw[i])}));
  const is2 = ei.map((s,i)=>({rem:s.shares,bw:Math.round(iw[i])}));
  const results = [];

  for(let y=0;y<totalYears;y++){
    const yf = (fracYear>0 && y===totalYears-1) ? fracYear : 1;

    // ── Fixed income ──
    let fi=0, fiTax=0;
    ef.forEach(s=>{
      if(sy+y>=s.startYear){
        const ya=sy+y-s.startYear;
        const gross=toBase(s.amount*Math.pow(1+(s.indexing||0)/100,ya)*yf,s.currency||base,base,rates);
        fi+=gross;
        if(s.applyTax&&(s.taxRate||0)>0) fiTax+=gross*(s.taxRate/100);
      }
    });

    // ── Tax deferred / investment income ──
    let ii=0,di=0,iiTax=0; const idata=[];
    is2.forEach((st,idx)=>{
      const s=ei[idx],pr=ip[idx][y],cv=st.rem*pr;
      let dv=0;
      if(s.includeDividend&&s.dividendPercent>0){dv=cv*(s.dividendPercent/100)*yf;di+=dv;}
      let ss=0,w=0;
      if(s.autoCalc&&st.rem>0&&pr>0){const t=Math.round(st.bw*Math.pow(1+inf,y)*yf);const ex=t/pr;ss=Math.min(Math.round(ex*1e6)/1e6,st.rem);w=Math.round(ss*pr);ii+=w;}
      // Tax deferred: entire withdrawal + dividends taxed at effective rate
      const taxable=w+Math.round(dv);
      const tax=(s.applyTax&&(s.taxRate||0)>0)?Math.round(taxable*(s.taxRate/100)):0;
      iiTax+=tax;
      is2[idx].rem=Math.max(Math.round((st.rem-ss)*1e6)/1e6,0);
      idata.push({
        name:s.name,shares:is2[idx].rem,price:pr,value:Math.round(is2[idx].rem*pr),
        withdrawal:w,sharesSold:ss,dividendIncome:Math.round(dv),
        taxPaid:tax,netWithdrawal:w+Math.round(dv)-tax,applyTax:!!s.applyTax,taxRate:s.taxRate||0
      });
    });

    const yd={
      year:sy+y,age:p.ageAtStart+y,
      fixedIncome:Math.round(fi),fixedIncomeTax:Math.round(fiTax),
      investmentIncome:Math.round(ii),investmentIncomeTax:Math.round(iiTax),
      dividendIncome:Math.round(di),
      totalIncome:Math.round(fi+ii+di),
      totalTax:0,totalValue:0,
      assets:[],investmentIncomeSources:idata,fixedAssetValues:[],
      otherIncome:0,otherIncomeTax:0,otherIncomeValues:[]
    };

    // ── Divest assets ──
    let divestTax=0;
    ds.forEach((st,idx)=>{
      const a=ea[idx],pr=dp[idx][y],v=st.rem*pr;
      const t=Math.round(st.bw*Math.pow(1+inf,y)*yf);
      let ss=0;if(st.rem>0&&pr>0){const ex=t/pr;ss=Math.min(Math.round(ex*1e6)/1e6,st.rem);}
      const grossWD=Math.round(ss*pr);
      ds[idx].rem=Math.max(Math.round((st.rem-ss)*1e6)/1e6,0);
      let adv=0;
      if(a.includeDividend&&a.dividendPercent>0){adv=Math.round(ds[idx].rem*pr*(a.dividendPercent/100)*yf);di+=adv;yd.dividendIncome+=adv;}
      // Cap gains: tax only on gain portion = shares_sold × max(0, price − costBasis) × rate
      // Dividends also taxed at same rate if applyTax
      const cb=toBase(a.costBasis||0,a.currency||base,base,rates);
      const gainPerShare=Math.max(0,pr-cb);
      const capGainsTax=(a.applyTax&&(a.taxRate||0)>0)?Math.round(ss*gainPerShare*(a.taxRate/100)):0;
      const divTax=(a.applyTax&&(a.taxRate||0)>0)?Math.round(adv*(a.taxRate/100)):0;
      const totalAssetTax=capGainsTax+divTax;
      divestTax+=totalAssetTax;
      yd.assets.push({
        name:a.name,shares:ds[idx].rem,price:pr,value:Math.round(v),
        withdrawal:grossWD,sharesSold:ss,dividendIncome:adv,
        taxPaid:totalAssetTax,netWithdrawal:grossWD+adv-totalAssetTax,
        applyTax:!!a.applyTax,taxRate:a.taxRate||0,costBasis:cb
      });
      yd.totalIncome+=grossWD+adv;yd.totalValue+=Math.round(v);
    });

    is2.forEach((st,idx)=>{yd.totalValue+=Math.round(st.rem*ip[idx][y]);});
    efa.forEach((a,idx)=>{const cv=Math.round(a.shares*fap[idx][y]);yd.fixedAssetValues.push({name:a.name,value:cv});yd.totalValue+=cv;});

    // ── Other income ──
    let oi=0,oiTax=0;const odata=[];
    eo.forEach((s,idx)=>{
      const pr=op[idx][y],cv=Math.round((s.shares||0)*pr);
      let ai=0;
      if(s.includeIncome&&s.annualIncome>0){ai=Math.round(toBase(s.annualIncome,s.currency||base,base,rates)*yf);oi+=ai;}
      const tax=(s.applyTax&&(s.taxRate||0)>0)?Math.round(ai*(s.taxRate/100)):0;
      oiTax+=tax;
      odata.push({name:s.name,value:cv,annualIncome:ai,taxPaid:tax,netIncome:ai-tax,applyTax:!!s.applyTax,taxRate:s.taxRate||0});
      yd.totalValue+=cv;
    });
    yd.otherIncome=Math.round(oi);yd.otherIncomeTax=Math.round(oiTax);yd.otherIncomeValues=odata;
    yd.totalIncome+=Math.round(oi);

    // Totals
    yd.totalTax=Math.round(fiTax+iiTax+divestTax+oiTax);
    yd.netIncome=Math.round(yd.totalIncome-yd.totalTax);
    yd.totalIncome=Math.round(yd.totalIncome);
    yd.totalValue=Math.round(yd.totalValue);
    results.push(yd);
  }
  return results;
}

// ── localStorage ──────────────────────────────────────────────
const STORAGE_KEY = "north_prosperity_v2";
const load = () => { try{const s=localStorage.getItem(STORAGE_KEY);return s?JSON.parse(s):null;}catch{return null;} };
const save = (plan) => { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(plan));}catch(e){console.error(e);} };

// ── Migrate old plan data to include tax fields ───────────────
function migratePlan(d) {
  const taxDefaults = {taxRate:0,applyTax:false};
  const capGainsDefaults = {taxRate:0,applyTax:false,costBasis:0};
  d.divestAssets=(d.divestAssets||[]).map(a=>({dividendPercent:0,includeDividend:false,...capGainsDefaults,...a}));
  d.fixedIncome=(d.fixedIncome||[]).map(s=>({...taxDefaults,...s}));
  d.investmentIncome=(d.investmentIncome||[]).map(s=>({
    dividendPercent:0,includeDividend:false,
    cagrDecline1:s.cagrDecline1!==undefined?s.cagrDecline1:0.3,
    cagrDecline2:s.cagrDecline2!==undefined?s.cagrDecline2:0.2,
    cagrDecline3:s.cagrDecline3!==undefined?s.cagrDecline3:0.1,
    ...taxDefaults,...s
  }));
  d.fixedAssets=(d.fixedAssets||[]).map(a=>({
    cagrDecline1:a.cagrDecline1!==undefined?a.cagrDecline1:0.1,
    cagrDecline2:a.cagrDecline2!==undefined?a.cagrDecline2:0.05,
    cagrDecline3:a.cagrDecline3!==undefined?a.cagrDecline3:0.02,
    ...capGainsDefaults,...a
  }));
  d.otherIncome=(d.otherIncome||[]).map(s=>({...taxDefaults,...s}));
  d.bigTicketStocks=(d.bigTicketStocks||[]).map(s=>({...capGainsDefaults,...s}));
  d.notes=d.notes||"";d.bigTicketItem=d.bigTicketItem||"";
  return d;
}

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
// TAX SUB-ROW COMPONENTS
// ============================================================

// Info bubble tooltip — same pattern as CurrencyTag ⓘ
function TaxInfoBubble({type, T}) {
  const [tip, setTip] = useState(null);
  const btnRef = useRef(null);
  const handleInfo = (e) => {
    e.stopPropagation();
    if(tip){setTip(null);return;}
    const r = btnRef.current?.getBoundingClientRect();
    if(r) setTip({top:r.bottom+6, left:Math.min(r.left, window.innerWidth-272)});
  };
  useEffect(()=>{
    if(!tip)return;
    const close=()=>setTip(null);
    document.addEventListener("click",close);
    document.addEventListener("touchstart",close);
    return()=>{document.removeEventListener("click",close);document.removeEventListener("touchstart",close);};
  },[tip]);

  const messages = {
    income: "Enter your estimated effective tax rate for this income source in your jurisdiction. For example: pension or Social Security income is often taxed as ordinary income. This is a manual estimate — no automatic jurisdiction lookup is performed. Consult a tax advisor for your specific situation.",
    deferred: "Tax treatment varies by account type and jurisdiction. TFSA and Roth IRA withdrawals are typically tax-free — leave Apply Tax unchecked. RRSP, RRIF, 401(k), IRA and similar deferred accounts are generally fully taxable on withdrawal — check Apply Tax and enter your estimated marginal or effective rate. Dividends from these accounts are also taxed at this rate when Apply Tax is on.",
    other: "Enter your estimated effective tax rate for this income source. Business income and rental income tax rates vary widely by jurisdiction and structure. This is a manual estimate — consult a tax advisor for your specific situation.",
    capgains: "Enter your estimated effective capital gains tax rate for this asset in your jurisdiction. Tax is calculated only on the gain: (Shares Sold × (Current Price − Cost Basis)) × Tax Rate. If the current price is below your cost basis, no tax applies. Dividends from this asset are also taxed at this rate when Apply Tax is on. This is a manual estimate — consult a tax advisor for your specific situation.",
  };

  return (
    <span ref={btnRef} onClick={handleInfo} onTouchEnd={e=>{e.preventDefault();handleInfo(e);}}
      style={{cursor:"pointer",color:T.accent,fontSize:9,WebkitUserSelect:"none",userSelect:"none",marginLeft:2}}>ⓘ
      {tip&&<div className="np-infobubble" style={{top:tip.top,left:tip.left,background:T.card,color:T.text,border:`1px solid ${T.border2}`,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",zIndex:99999,position:"fixed",width:260,padding:"10px 12px",borderRadius:8,fontSize:11,lineHeight:1.5,fontFamily:FONT_MONO,pointerEvents:"none"}}>
        {messages[type]||messages.income}
      </div>}
    </span>
  );
}

// % Tax toggle button — amber when active, dim when not
function TaxToggleBtn({open, applyTax, onToggle, T}) {
  const active = applyTax;
  return (
    <button onClick={onToggle} style={{
      fontSize:9, fontWeight:600, fontFamily:FONT_LABEL,
      background: active ? `${T.amber}18` : "none",
      color: active ? T.amber : T.textDim,
      border: `1px solid ${active ? T.amber+"50" : T.border2}`,
      borderRadius:4, cursor:"pointer", padding:"2px 6px",
      whiteSpace:"nowrap", alignSelf:"end", marginBottom:4,
      transition:"all 0.15s",
    }}>
      % Tax {open ? "▲" : "▼"}
    </button>
  );
}

// Tax sub-row for income-type assets (fixed income, tax deferred, other income)
function TaxSubRowIncome({taxRate, applyTax, onTaxRate, onApplyTax, type, T}) {
  return (
    <div style={{
      display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
      padding:"8px 12px", marginBottom:4, marginTop:-2,
      background: applyTax ? `${T.amber}08` : T.bg,
      borderRadius:"0 0 8px 8px",
      border:`1px solid ${applyTax ? T.amber+"30" : T.border}`,
      borderTop:"none",
    }}>
      <div style={{display:"flex",flexDirection:"column",minWidth:130}}>
        <label style={{fontSize:9,color:applyTax?T.amber:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,marginBottom:2,fontFamily:FONT_LABEL,display:"flex",alignItems:"center"}}>
          Effective Tax Rate %<TaxInfoBubble type={type} T={T}/>
        </label>
        <input
          type="number" value={taxRate} step="0.5" min="0" max="100"
          onChange={e=>onTaxRate(+e.target.value||0)}
          onFocus={e=>e.target.select()}
          style={{
            width:72, padding:"4px 6px",
            background:T.inputBg, border:`1px solid ${applyTax?T.amber+"60":T.border2}`,
            borderRadius:4, fontSize:12, color:applyTax?T.amber:T.text, fontFamily:FONT_LABEL,
            outline:"none",
          }}
        />
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:70,paddingTop:14}}>
        <label style={{fontSize:9,color:applyTax?T.amber:T.label,fontWeight:600,letterSpacing:0.3,marginBottom:3,fontFamily:FONT_LABEL}}>Apply Tax</label>
        <input type="checkbox" checked={!!applyTax} onChange={onApplyTax}
          style={{width:14,height:14,cursor:"pointer",accentColor:T.amber}}/>
      </div>
      {applyTax&&taxRate>0&&(
        <div style={{fontSize:10,color:T.amber,fontFamily:FONT_MONO,paddingTop:14,opacity:0.8}}>
          {taxRate}% effective rate active
        </div>
      )}
    </div>
  );
}

// Tax sub-row for cap-gains assets (divest, fixed assets, big ticket)
function TaxSubRowCapGains({taxRate, applyTax, costBasis, onTaxRate, onApplyTax, onCostBasis, type, currency, T}) {
  return (
    <div style={{
      display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
      padding:"8px 12px", marginBottom:4, marginTop:-2,
      background: applyTax ? `${T.amber}08` : T.bg,
      borderRadius:"0 0 8px 8px",
      border:`1px solid ${applyTax ? T.amber+"30" : T.border}`,
      borderTop:"none",
    }}>
      <div style={{display:"flex",flexDirection:"column",minWidth:130}}>
        <label style={{fontSize:9,color:applyTax?T.amber:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,marginBottom:2,fontFamily:FONT_LABEL,display:"flex",alignItems:"center"}}>
          Effective Tax Rate %<TaxInfoBubble type={type||"capgains"} T={T}/>
        </label>
        <input
          type="number" value={taxRate} step="0.5" min="0" max="100"
          onChange={e=>onTaxRate(+e.target.value||0)}
          onFocus={e=>e.target.select()}
          style={{
            width:72, padding:"4px 6px",
            background:T.inputBg, border:`1px solid ${applyTax?T.amber+"60":T.border2}`,
            borderRadius:4, fontSize:12, color:applyTax?T.amber:T.text, fontFamily:FONT_LABEL,
            outline:"none",
          }}
        />
      </div>
      <div style={{display:"flex",flexDirection:"column",minWidth:140}}>
        <label style={{fontSize:9,color:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,marginBottom:2,fontFamily:FONT_LABEL}}>
          Cost Basis / Share ({currency||"USD"})
        </label>
        <input
          type="number" value={costBasis} step="0.01" min="0"
          onChange={e=>onCostBasis(+e.target.value||0)}
          onFocus={e=>e.target.select()}
          style={{
            width:110, padding:"4px 6px",
            background:T.inputBg, border:`1px solid ${T.border2}`,
            borderRadius:4, fontSize:12, color:T.text, fontFamily:FONT_LABEL,
            outline:"none",
          }}
        />
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:70,paddingTop:14}}>
        <label style={{fontSize:9,color:applyTax?T.amber:T.label,fontWeight:600,letterSpacing:0.3,marginBottom:3,fontFamily:FONT_LABEL}}>Apply Tax</label>
        <input type="checkbox" checked={!!applyTax} onChange={onApplyTax}
          style={{width:14,height:14,cursor:"pointer",accentColor:T.amber}}/>
      </div>
      {applyTax&&taxRate>0&&costBasis>0&&(
        <div style={{fontSize:10,color:T.amber,fontFamily:FONT_MONO,paddingTop:14,opacity:0.8}}>
          {taxRate}% on gains above {fmt(costBasis,currency||"USD")}/share
        </div>
      )}
    </div>
  );
}

// Notional gain tax ⓘ — inline info bubble
function NotionalGainInfo({T}) {
  const [tip, setTip] = useState(null);
  const btnRef = useRef(null);
  const handleInfo = (e) => {
    e.stopPropagation();
    if(tip){setTip(null);return;}
    const r = btnRef.current?.getBoundingClientRect();
    if(r) setTip({top:r.bottom+6, left:Math.min(r.left, window.innerWidth-272)});
  };
  useEffect(()=>{
    if(!tip)return;
    const close=()=>setTip(null);
    document.addEventListener("click",close);
    document.addEventListener("touchstart",close);
    return()=>{document.removeEventListener("click",close);document.removeEventListener("touchstart",close);};
  },[tip]);
  return (
    <span ref={btnRef} onClick={handleInfo} onTouchEnd={e=>{e.preventDefault();handleInfo(e);}}
      style={{cursor:"pointer",color:T.accent,fontSize:9,WebkitUserSelect:"none",userSelect:"none",marginLeft:3}}>ⓘ
      {tip&&<div style={{top:tip.top,left:tip.left,background:T.card,color:T.text,border:`1px solid ${T.border2}`,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",zIndex:99999,position:"fixed",width:260,padding:"10px 12px",borderRadius:8,fontSize:11,lineHeight:1.5,fontFamily:FONT_MONO,pointerEvents:"none"}}>
        This is the estimated capital gains tax if you sold your entire current position today at the price entered. It is a snapshot only — not a real tax bill. The projection engine charges tax year by year as shares are actually sold, using the projected price at time of sale. This figure will grow over time as the share price appreciates.
      </div>}
    </span>
  );
}
function DisclaimerFooter(){
  const [expanded, setExpanded] = React.useState(false);
  return(
    <div className="np-disclaimer" onClick={()=>setExpanded(e=>!e)} style={{cursor:"pointer"}}>
      <div className="np-disclaimer-text">
        ⚠️ Not financial advice · Educational only · © 2026 North Prosperity
        <span style={{marginLeft:6,color:"#6C8EFF",fontSize:9}}>{expanded?"▲ less":"▼ more"}</span>
      </div>
      {expanded&&<div className="np-disclaimer-full">
        For educational and simulation purposes only · Past performance does not guarantee future results · Always consult a qualified financial advisor · FX conversion uses live rate as a fixed assumption · Tax calculations are estimates only — consult a qualified tax advisor for your jurisdiction
      </div>}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function RetirementPlanner() {
  const [plan, setPlan] = useState(()=>migratePlan(load()||JSON.parse(JSON.stringify(DEFAULT_PLAN))));
  const [tab, setTab] = useState("planning");
  const [darkMode, setDarkMode] = useState(true);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [fxRate, setFxRate] = useState(null);
  const [fxError, setFxError] = useState(false);
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

  const results = useMemo(()=>runProjection(plan,fxRate||{}),[plan,fxRate]);
  const y1=results[0]||{}, yL=results[results.length-1]||{};
  const peakIncome=results.length?Math.max(...results.map(r=>r.totalIncome)):0;
  const peakValue=results.length?Math.max(...results.map(r=>r.totalValue)):0;

  useEffect(()=>{
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r=>r.json()).then(d=>{if(d.rates)setFxRate(d.rates);})
      .catch(()=>setFxError(true));
  },[]);

  const exportPlan = () => {
    const blob=new Blob([JSON.stringify(plan,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`${plan.params.personName||"retirement-plan"}.json`.replace(/[^a-zA-Z0-9.-]/g,"_");
    a.click();URL.revokeObjectURL(a.href);
  };
  const importPlan = () => {
    const input=document.createElement("input");input.type="file";input.accept=".json";
    input.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.params&&d.divestAssets){
      const migrated=migratePlan(d);
      setPlan(migrated);save(migrated);alert(`Loaded: ${migrated.params.personName||"plan"}`);
    }else alert("Invalid file.");}catch{alert("Could not read file.");}};r.readAsText(f);};
    input.click();
  };
  const resetPlan = () => {if(window.confirm("Reset all data? This cannot be undone.")){const f=JSON.parse(JSON.stringify(DEFAULT_PLAN));setPlan(f);save(f);}};

  const tabs = [
    {id:"planning",   label:"1. Planning & Income"},
    {id:"divest",     label:"2. Assets to Divest"},
    {id:"fixed",      label:"3. Fixed Assets"},
    {id:"projections",label:"4. Projections"},
    {id:"withdrawals",label:"5. Withdrawal Plan"},
    {id:"charts",     label:"6. Charts"},
    {id:"additional", label:"7. Additional"},
    {id:"summary",    label:"8. Summary"},
  ];

  return (
    <div style={{fontFamily:FONT_BODY,background:T.bg,minHeight:"100vh",width:"100%",padding:"12px 16px 120px",color:T.text,transition:"background 0.3s,color 0.3s"}}>
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
        @media (max-width:480px){
          .mf-xs{max-width:58px!important;min-width:0!important;}
          .mf-sm{max-width:75px!important;min-width:0!important;}
          .mf-md{max-width:95px!important;min-width:0!important;}
        }
        .np-disclaimer{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#0d0d1f;border-top:1px solid #2a2a4a;padding:5px 12px;}
        .np-disclaimer-text{font-family:'JetBrains Mono','SF Mono',monospace;font-size:10px;color:#555577;line-height:1.5;display:block;}
        .np-disclaimer-full{font-family:'JetBrains Mono','SF Mono',monospace;font-size:10px;color:#555577;line-height:1.5;display:block;margin-top:3px;}
        .np-infobubble{position:fixed;z-index:99999;width:240px;padding:10px 12px;border-radius:8px;font-size:11px;line-height:1.5;pointer-events:none;font-family:'JetBrains Mono','SF Mono',monospace;}
      `}</style>

      <DisclaimerFooter/>

      <div className="np-outer">
        {/* HEADER */}
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"32px 34px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14,position:"relative",overflow:"hidden"}}>
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

        {/* SUMMARY CARDS */}
        {results.length>0 && (()=>{
          const bc=plan.params.baseCurrency||"USD";
          const anyTax=results.some(r=>(r.totalTax||0)>0);
          return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:14}}>
            <SumCard label="Year 1 Gross" value={fmt(y1.totalIncome,bc)} color={T.gold} T={T}/>
            <SumCard
              label="Year 1 Net"
              value={fmt(y1.netIncome??y1.totalIncome,bc)}
              color={anyTax?T.green:T.textDim}
              note={anyTax?null:"no tax configured"}
              T={T}
            />
            <SumCard label="Year 1 Portfolio" value={fmtK(y1.totalValue,bc)} color={T.accent} T={T}/>
            <SumCard label="Peak Portfolio" value={fmtK(peakValue,bc)} color={T.purple} T={T}/>
            <SumCard label="Final Income" value={fmt(yL.totalIncome,bc)} color={T.cyan} T={T}/>
            <SumCard label="Final Portfolio" value={fmtK(yL.totalValue,bc)} color={T.amber} T={T}/>
          </div>
          );
        })()}

        {/* TABS */}
        <div style={{display:"flex",gap:2,marginBottom:14,flexWrap:"wrap",borderBottom:`1px solid ${T.border}`}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"11px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:tab===t.id?600:500,
              fontFamily:FONT_LABEL,background:"transparent",
              color:tab===t.id?T.accent:T.textMid,
              borderBottom:tab===t.id?`2px solid ${T.accent}`:"2px solid transparent",
              transition:"all 0.15s",whiteSpace:"nowrap",letterSpacing:0.2,
            }}>{t.label}</button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{width:"100%",overflow:"clip"}}>
          {tab==="planning" && <PlanningTab plan={plan} update={update} T={T} baseCurrency={plan.params.baseCurrency||"USD"} fxRate={fxRate} fxError={fxError}/>}
          {tab==="divest" && <DivestTab plan={plan} update={update} T={T} baseCurrency={plan.params.baseCurrency||"USD"}/>}
          {tab==="fixed" && <FixedAssetsTab plan={plan} update={update} T={T} baseCurrency={plan.params.baseCurrency||"USD"}/>}
          {tab==="projections" && <ProjectionsTab plan={plan} results={results} T={T} baseCurrency={plan.params.baseCurrency||"USD"}/>}
          {tab==="withdrawals" && <WithdrawalTab plan={plan} results={results} T={T} baseCurrency={plan.params.baseCurrency||"USD"}/>}
          {tab==="charts" && <ChartsTab plan={plan} results={results} T={T} baseCurrency={plan.params.baseCurrency||"USD"}/>}
          {tab==="additional" && <AdditionalTab plan={plan} update={update} T={T} baseCurrency={plan.params.baseCurrency||"USD"} fxRate={fxRate||{}}/>}
          {tab==="summary" && <SummaryTab plan={plan} results={results} T={T} baseCurrency={plan.params.baseCurrency||"USD"}/>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: PLANNING
// ============================================================
function PlanningTab({plan, update, T, baseCurrency="USD", fxRate=null, fxError=false}) {
  const p = plan.params;
  const up = (k,v)=>update(d=>{d.params[k]=v;return d;});
  const [showInvPresets, setShowInvPresets] = useState(null);
  const [showTax, setShowTax] = useState({}); // {fi_0: true, ii_1: true, oi_0: true}
  const applyInvPreset = (i,key)=>{const pr=CAGR_PRESETS[key];update(d=>{d.investmentIncome[i].cagr=pr.cagr;d.investmentIncome[i].cagrDecline1=pr.d1;d.investmentIncome[i].cagrDecline2=pr.d2;d.investmentIncome[i].cagrDecline3=pr.d3;return d;});setShowInvPresets(null);};
  const toggleTax = (key) => setShowTax(prev=>({...prev,[key]:!prev[key]}));

  return <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Planning Parameters" T={T}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10}}>
        <Field label="Person / Couple" value={p.personName} onChange={v=>up("personName",v)} T={T}/>
        <Field label="Age at Start" value={p.ageAtStart} type="number" onChange={v=>up("ageAtStart",+v||60)} T={T}/>
        <Field label="Inflation %" value={p.inflationRate} type="number" step="0.5" onChange={v=>up("inflationRate",+v||0)} T={T}/>
        <Field label="Start Year" value={p.startYear} type="number" onChange={v=>up("startYear",+v||2030)} T={T}/>
        <Field label="Projection Years" value={p.projectionYears} type="number" step="0.25" onChange={v=>up("projectionYears",Math.min(parseFloat(v)||30,60))} T={T}/>
        <div><label style={{fontSize:10,color:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:3,fontFamily:FONT_LABEL}}>Base Currency</label>
        <select value={p.baseCurrency||"USD"} onChange={e=>up("baseCurrency",e.target.value)} style={{width:"100%",padding:"7px 10px",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:6,fontSize:13,color:T.text,fontFamily:FONT_LABEL}}>
          {CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        {fxRate&&<div style={{fontSize:9,color:T.green,fontFamily:FONT_MONO,marginTop:3}}>Live rates loaded ✓</div>}
        {fxError&&<div style={{fontSize:9,color:T.red,fontFamily:FONT_MONO,marginTop:3}}>FX offline — using 1:1</div>}
        </div>
      </div>
    </Card>

    {/* FIXED SOURCES OF INCOME */}
    <Card title="Fixed Sources of Income" badge="Pension (DB), CPP, OAS, Social Security, GIS, Annuity" T={T}
      action={plan.fixedIncome.length<10?()=>update(d=>{d.fixedIncome.push({id:mkId(),name:"New Source",amount:0,startYear:p.startYear,indexing:0,enabled:false,taxRate:0,applyTax:false});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Pensions, Social Security, CPP, OAS, annuities. Set start year to defer income.</Hint>
      {plan.fixedIncome.map((s,i)=>{
        const tk=`fi_${i}`;
        return <div key={s.id}>
          <ItemRow enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.fixedIncome[i].enabled=!d.fixedIncome[i].enabled;return d;})} onRemove={()=>update(d=>{d.fixedIncome.splice(i,1);return d;})}>
            <MF label="Name" value={s.name} w="1.0fr" onChange={v=>update(d=>{d.fixedIncome[i].name=v;return d;})} T={T}/>
            <MF label="Annual $" cls="mf-md" value={s.amount} type="number" w="0.4fr" onChange={v=>update(d=>{d.fixedIncome[i].amount=+v||0;return d;})} T={T}/>
            <MF label="Start Year" cls="mf-sm" value={s.startYear} type="number" w="0.25fr" onChange={v=>update(d=>{d.fixedIncome[i].startYear=+v||2030;return d;})} T={T}/>
            <MF label="Index%" cls="mf-xs" value={s.indexing} type="number" step="0.5" w="0.22fr" onChange={v=>update(d=>{d.fixedIncome[i].indexing=+v||0;return d;})} T={T}/>
            <CurrencyTag currency={s.currency||baseCurrency} base={baseCurrency} onChange={v=>update(d=>{d.fixedIncome[i].currency=v;return d;})} T={T}/>
            <TaxToggleBtn open={showTax[tk]} applyTax={s.applyTax} onToggle={()=>toggleTax(tk)} T={T}/>
          </ItemRow>
          {showTax[tk]&&<TaxSubRowIncome
            taxRate={s.taxRate||0} applyTax={s.applyTax} type="income"
            onTaxRate={v=>update(d=>{d.fixedIncome[i].taxRate=v;return d;})}
            onApplyTax={()=>update(d=>{d.fixedIncome[i].applyTax=!d.fixedIncome[i].applyTax;return d;})}
            T={T}
          />}
        </div>;
      })}
    </Card>

    {/* TAX DEFERRED SOURCES */}
    <Card title="Tax Deferred Sources of Income" badge="RRSP, TFSA, RRIF, 401(k), IRA, ISA, SIPP, Super, KiwiSaver, Pillar 3a, Afore" T={T}
      action={plan.investmentIncome.length<10?()=>update(d=>{d.investmentIncome.push({id:mkId(),name:"New Investment",note:"",shares:0,pricePerShare:0,cagr:7,cagrDecline1:0.3,cagrDecline2:0.2,cagrDecline3:0.1,dividendPercent:0,includeDividend:false,autoCalc:true,enabled:false,taxRate:0,applyTax:false});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Tax-deferred accounts worldwide. Amort/Sell draws balance to $0 by end of term. Div pays dividends from remaining balance. Three-phase CAGR decline: Yr 1-5, Yr 6-20, Yr 21+. Tax treatment varies — use % Tax to configure per account.</Hint>
      {plan.investmentIncome.map((s,i)=>{
        const tk=`ii_${i}`;
        return <div key={s.id}>
          <ItemRow enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.investmentIncome[i].enabled=!d.investmentIncome[i].enabled;return d;})} onRemove={()=>update(d=>{d.investmentIncome.splice(i,1);return d;})}>
            <MF label="Name" value={s.name} w="1.0fr" onChange={v=>update(d=>{d.investmentIncome[i].name=v;return d;})} T={T}/>
            <MF label="Shares" cls="mf-sm" value={s.shares} type="number" w="0.25fr" onChange={v=>update(d=>{d.investmentIncome[i].shares=+v||0;return d;})} T={T}/>
            <MF label="Price" cls="mf-md" value={s.pricePerShare} type="number" w="0.4fr" onChange={v=>update(d=>{d.investmentIncome[i].pricePerShare=+v||0;return d;})} T={T}/>
            <MF label="CAGR%" cls="mf-xs" value={s.cagr} type="number" step="0.5" w="0.22fr" onChange={v=>update(d=>{d.investmentIncome[i].cagr=+v||0;return d;})} T={T}/>
            <MF label="Yr 1-5 ↓%" cls="mf-xs" value={s.cagrDecline1!==undefined?s.cagrDecline1:(s.cagrDecline||0.3)} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.investmentIncome[i].cagrDecline1=+v||0;return d;})} T={T}/>
            <MF label="Yr 6-20 ↓%" cls="mf-xs" value={s.cagrDecline2!==undefined?s.cagrDecline2:((s.cagrDecline||0.3)*0.6)} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.investmentIncome[i].cagrDecline2=+v||0;return d;})} T={T}/>
            <MF label="Yr 21+ ↓%" cls="mf-xs" value={s.cagrDecline3!==undefined?s.cagrDecline3:((s.cagrDecline||0.3)*0.3)} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.investmentIncome[i].cagrDecline3=+v||0;return d;})} T={T}/>
            <MF label="Div%" cls="mf-xs" value={s.dividendPercent} type="number" step="0.5" w="0.22fr" onChange={v=>update(d=>{d.investmentIncome[i].dividendPercent=+v||0;return d;})} T={T}/>
            <CurrencyTag currency={s.currency||baseCurrency} base={baseCurrency} onChange={v=>update(d=>{d.investmentIncome[i].currency=v;return d;})} T={T}/>
            <Chk label="Div" checked={s.includeDividend} onChange={()=>update(d=>{d.investmentIncome[i].includeDividend=!d.investmentIncome[i].includeDividend;return d;})} T={T}/>
            <Chk label="Amort/Sell" checked={s.autoCalc} onChange={()=>update(d=>{d.investmentIncome[i].autoCalc=!d.investmentIncome[i].autoCalc;return d;})} T={T}/>
            <div style={{display:"flex",flexDirection:"column",gap:2,alignSelf:"end",paddingBottom:4}}>
              <YahooLink ticker={s.name} T={T}/>
              <button onClick={()=>setShowInvPresets(showInvPresets===i?null:i)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:FONT_LABEL}}>CAGR % Preset</button>
            </div>
            <TaxToggleBtn open={showTax[tk]} applyTax={s.applyTax} onToggle={()=>toggleTax(tk)} T={T}/>
          </ItemRow>
          {showTax[tk]&&<TaxSubRowIncome
            taxRate={s.taxRate||0} applyTax={s.applyTax} type="deferred"
            onTaxRate={v=>update(d=>{d.investmentIncome[i].taxRate=v;return d;})}
            onApplyTax={()=>update(d=>{d.investmentIncome[i].applyTax=!d.investmentIncome[i].applyTax;return d;})}
            T={T}
          />}
          {s.enabled&&s.shares>0&&s.pricePerShare>0&&<div style={{textAlign:"right",fontSize:11,color:T.gold,fontWeight:600,fontFamily:FONT_MONO,paddingRight:10,marginTop:2,marginBottom:4}}>{fmt(s.shares*s.pricePerShare,s.currency||baseCurrency)}</div>}
          {showInvPresets===i&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:6,padding:"6px 28px 10px",background:T.bg,borderRadius:8,margin:"-2px 0 6px"}}>
            {Object.entries(CAGR_PRESETS).map(([k,pr])=><button key={k} onClick={()=>applyInvPreset(i,k)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:11,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{pr.label}</div>
              <div style={{fontSize:9,color:T.textMid,fontFamily:FONT_LABEL}}>{pr.desc}</div>
              <div style={{fontSize:9,color:T.accent,fontFamily:FONT_MONO}}>{pr.cagr}% | {pr.d1}/{pr.d2}/{pr.d3}</div>
            </button>)}
          </div>}
        </div>;
      })}
    </Card>

    {/* OTHER SOURCES OF INCOME */}
    <Card title="Other Sources of Income" badge="Business, Rental" T={T}
      action={plan.otherIncome.length<10?()=>update(d=>{d.otherIncome.push({id:mkId(),name:"New Source",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline:0.1,annualIncome:0,includeIncome:false,enabled:false,taxRate:0,applyTax:false});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Business income, rental properties, royalties. Appreciate in value + optional annual income.</Hint>
      {plan.otherIncome.map((s,i)=>{
        const tk=`oi_${i}`;
        return <React.Fragment key={s.id}>
          <ItemRow enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.otherIncome[i].enabled=!d.otherIncome[i].enabled;return d;})} onRemove={()=>update(d=>{d.otherIncome.splice(i,1);return d;})}>
            <MF label="Name" value={s.name} w="0.9fr" onChange={v=>update(d=>{d.otherIncome[i].name=v;return d;})} T={T}/>
            <MF label="Units" cls="mf-sm" value={s.shares} type="number" w="0.25fr" onChange={v=>update(d=>{d.otherIncome[i].shares=+v||0;return d;})} T={T}/>
            <MF label="Price" cls="mf-md" value={s.pricePerShare} type="number" w="0.4fr" onChange={v=>update(d=>{d.otherIncome[i].pricePerShare=+v||0;return d;})} T={T}/>
            <MF label="CAGR%" cls="mf-xs" value={s.cagr} type="number" step="0.5" w="0.22fr" onChange={v=>update(d=>{d.otherIncome[i].cagr=+v||0;return d;})} T={T}/>
            <MF label="Decl%" cls="mf-xs" value={s.cagrDecline} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.otherIncome[i].cagrDecline=+v||0;return d;})} T={T}/>
            <MF label="Annual$" cls="mf-md" value={s.annualIncome} type="number" w="0.4fr" onChange={v=>update(d=>{d.otherIncome[i].annualIncome=+v||0;return d;})} T={T}/>
            <CurrencyTag currency={s.currency||baseCurrency} base={baseCurrency} onChange={v=>update(d=>{d.otherIncome[i].currency=v;return d;})} T={T}/>
            <Chk label="Inc" checked={s.includeIncome} onChange={()=>update(d=>{d.otherIncome[i].includeIncome=!d.otherIncome[i].includeIncome;return d;})} T={T}/>
            <TaxToggleBtn open={showTax[tk]} applyTax={s.applyTax} onToggle={()=>toggleTax(tk)} T={T}/>
          </ItemRow>
          {showTax[tk]&&<TaxSubRowIncome
            taxRate={s.taxRate||0} applyTax={s.applyTax} type="other"
            onTaxRate={v=>update(d=>{d.otherIncome[i].taxRate=v;return d;})}
            onApplyTax={()=>update(d=>{d.otherIncome[i].applyTax=!d.otherIncome[i].applyTax;return d;})}
            T={T}
          />}
          {s.enabled&&s.shares>0&&s.pricePerShare>0&&<div style={{textAlign:"right",fontSize:11,color:T.gold,fontWeight:600,fontFamily:FONT_MONO,paddingRight:10,marginTop:2,marginBottom:4}}>{fmt(s.shares*s.pricePerShare,s.currency||baseCurrency)}</div>}
        </React.Fragment>;
      })}
    </Card>
    <CagrExamplesBox T={T}/>
  </div>;
}

// ============================================================
// TAB: DIVEST
// ============================================================
function DivestTab({plan, update, T, baseCurrency="USD"}) {
  const [showPresets, setShowPresets] = useState(null);
  const [showTax, setShowTax] = useState({});
  const applyPreset = (i, key) => {const p=CAGR_PRESETS[key];update(d=>{d.divestAssets[i].cagr=p.cagr;d.divestAssets[i].cagrDecline1=p.d1;d.divestAssets[i].cagrDecline2=p.d2;d.divestAssets[i].cagrDecline3=p.d3;return d;});setShowPresets(null);};
  const toggleTax = (key) => setShowTax(prev=>({...prev,[key]:!prev[key]}));

  return <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Investment Assets to Divest" badge="Max 20" T={T}
      action={plan.divestAssets.length<20?()=>update(d=>{d.divestAssets.push({id:mkId(),name:`Asset ${d.divestAssets.length+1}`,note:"",shares:0,pricePerShare:0,cagr:10,cagrDecline1:0.5,cagrDecline2:0.3,cagrDecline3:0.1,dividendPercent:0,includeDividend:false,autoCalc:true,enabled:false,taxRate:0,applyTax:false,costBasis:0});return d;}):null} actionLabel="+ Add Asset">
      <Hint T={T}>Unregistered assets sold on an amortization schedule to $0 by end of term. Three-phase CAGR decline: Yr 1-5, Yr 6-20, Yr 21+. Use % Tax to set cap gains rate and cost basis.</Hint>
      {plan.divestAssets.map((a,i)=>{
        const tk=`da_${i}`;
        return <div key={a.id}>
          <ItemRow enabled={a.enabled} T={T} onToggle={()=>update(d=>{d.divestAssets[i].enabled=!d.divestAssets[i].enabled;return d;})} onRemove={()=>update(d=>{d.divestAssets.splice(i,1);return d;})}>
            <MF label="Ticker" value={a.name} w="0.7fr" onChange={v=>update(d=>{d.divestAssets[i].name=v;return d;})} T={T}/>
            <MF label="Shares" cls="mf-sm" value={a.shares} type="number" w="0.25fr" onChange={v=>update(d=>{d.divestAssets[i].shares=+v||0;return d;})} T={T}/>
            <MF label="Price" cls="mf-md" value={a.pricePerShare} type="number" w="0.4fr" onChange={v=>update(d=>{d.divestAssets[i].pricePerShare=+v||0;return d;})} T={T}/>
            <MF label="CAGR%" cls="mf-xs" value={a.cagr} type="number" step="1" w="0.22fr" onChange={v=>update(d=>{d.divestAssets[i].cagr=+v||0;return d;})} T={T}/>
            <MF label="Yr 1-5 ↓%" cls="mf-xs" value={a.cagrDecline1} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.divestAssets[i].cagrDecline1=+v||0;return d;})} T={T}/>
            <MF label="Yr 6-20 ↓%" cls="mf-xs" value={a.cagrDecline2} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.divestAssets[i].cagrDecline2=+v||0;return d;})} T={T}/>
            <MF label="Yr 21+ ↓%" cls="mf-xs" value={a.cagrDecline3} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.divestAssets[i].cagrDecline3=+v||0;return d;})} T={T}/>
            <MF label="Div%" cls="mf-xs" value={a.dividendPercent||0} type="number" step="0.5" w="0.22fr" onChange={v=>update(d=>{d.divestAssets[i].dividendPercent=+v||0;return d;})} T={T}/>
            <CurrencyTag currency={a.currency||baseCurrency} base={baseCurrency} onChange={v=>update(d=>{d.divestAssets[i].currency=v;return d;})} T={T}/>
            <Chk label="Div" checked={!!a.includeDividend} onChange={()=>update(d=>{d.divestAssets[i].includeDividend=!d.divestAssets[i].includeDividend;return d;})} T={T}/>
            <Chk label="Amort/Sell" checked={a.autoCalc} onChange={()=>update(d=>{d.divestAssets[i].autoCalc=!d.divestAssets[i].autoCalc;return d;})} T={T}/>
            <div style={{display:"flex",flexDirection:"column",gap:2,alignSelf:"end",paddingBottom:4}}>
              <YahooLink ticker={a.name} T={T}/>
              <button onClick={()=>setShowPresets(showPresets===i?null:i)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:FONT_LABEL}}>CAGR % Preset</button>
            </div>
            <TaxToggleBtn open={showTax[tk]} applyTax={a.applyTax} onToggle={()=>toggleTax(tk)} T={T}/>
          </ItemRow>
          {showTax[tk]&&<TaxSubRowCapGains
            taxRate={a.taxRate||0} applyTax={a.applyTax} costBasis={a.costBasis||0}
            currency={a.currency||baseCurrency}
            onTaxRate={v=>update(d=>{d.divestAssets[i].taxRate=v;return d;})}
            onApplyTax={()=>update(d=>{d.divestAssets[i].applyTax=!d.divestAssets[i].applyTax;return d;})}
            onCostBasis={v=>update(d=>{d.divestAssets[i].costBasis=v;return d;})}
            T={T}
          />}
          {a.enabled&&a.shares>0&&a.pricePerShare>0&&<div style={{textAlign:"right",fontSize:11,fontFamily:FONT_MONO,paddingRight:10,marginTop:2,marginBottom:4,display:"flex",justifyContent:"flex-end",gap:14,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{color:T.gold,fontWeight:600}}>{fmt(a.shares*a.pricePerShare,a.currency||baseCurrency)}</span>
            {a.applyTax&&(a.taxRate||0)>0&&(a.costBasis||0)>0&&(
              <span style={{color:T.amber,fontSize:10,display:"flex",alignItems:"center"}}>
                Notional gain tax: {fmt(a.shares*Math.max(0,a.pricePerShare-(a.costBasis||0))*(a.taxRate/100),a.currency||baseCurrency)}
                <NotionalGainInfo T={T}/>
              </span>
            )}
          </div>}
          {showPresets===i&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:6,padding:"6px 28px 10px",background:T.bg,borderRadius:8,margin:"-2px 0 6px"}}>
            {Object.entries(CAGR_PRESETS).map(([k,p])=><button key={k} onClick={()=>applyPreset(i,k)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:11,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{p.label}</div>
              <div style={{fontSize:9,color:T.textMid,fontFamily:FONT_LABEL}}>{p.desc}</div>
              <div style={{fontSize:9,color:T.accent,fontFamily:FONT_MONO}}>{p.cagr}% | {p.d1}/{p.d2}/{p.d3}</div>
            </button>)}
          </div>}
        </div>;
      })}
      {plan.divestAssets.filter(a=>a.enabled&&a.shares>0).length>0&&<div style={{background:T.summaryBg,borderRadius:10,padding:"12px 18px",marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`}}>
        <span style={{fontWeight:600,color:T.text,fontSize:13,fontFamily:FONT_LABEL}}>Total Divest Portfolio</span>
        <span style={{fontFamily:FONT_DISPLAY,fontSize:20,fontWeight:700,color:T.gold}}>{fmt(plan.divestAssets.filter(a=>a.enabled).reduce((t,a)=>t+a.shares*a.pricePerShare,0))}</span>
      </div>}
    </Card>
    <CagrExamplesBox T={T}/>
  </div>;
}

// ============================================================
// CAGR DECLINE EXAMPLES BOX
// ============================================================
function CagrExamplesBox({T}) {
  const [open, setOpen] = useState(false);
  const examples = [
    {label:"🔥 Hyper Growth Stocks",desc:"e.g., disruptive companies (early TSLA, early NVDA)",cagr:30,d1:2.8,d2:1.0,d3:0.2,explain:"Starts at 30% CAGR. Years 1-5: declines 2.8%/yr to ~16% by year 5. Years 6-20: declines 1.0%/yr to ~1% by year 20. Years 21+: declines 0.2%/yr, settling near 0%."},
    {label:"📈 Growth Stocks",desc:"e.g., NVDA, AMZN, META",cagr:18,d1:0.8,d2:0.4,d3:0.15,explain:"Starts at 18% CAGR. Years 1-5: declines 0.8%/yr to ~14% by year 5. Years 6-20: declines 0.4%/yr to ~8% by year 20. Years 21+: declines 0.15%/yr, settling near 6-7%."},
    {label:"⚖️ Moderate Stocks",desc:"e.g., AAPL, MSFT, JNJ",cagr:12,d1:0.5,d2:0.3,d3:0.1,explain:"Starts at 12% CAGR. Years 1-5: declines 0.5%/yr to ~9.5% by year 5. Years 6-20: declines 0.3%/yr to ~5% by year 20. Years 21+: declines 0.1%/yr, settling near 4%."},
    {label:"🛡️ Conservative / Index",desc:"e.g., SPY, VOO, VTI",cagr:10,d1:0.3,d2:0.2,d3:0.1,explain:"Starts at 10% CAGR. Years 1-5: declines 0.3%/yr to ~8.5% by year 5. Years 6-20: declines 0.2%/yr to ~5.5% by year 20. Years 21+: declines 0.1%/yr, settling near 4-5%."},
    {label:"💴 Ultra Conservative",desc:"e.g., Bonds, GICs, T-Bills",cagr:3,d1:0.1,d2:0.0,d3:0.0,explain:"Starts at 3% CAGR. Years 1-5: slight decline of 0.1%/yr to ~2.5% by year 5. Years 6+: rate holds essentially flat, reflecting stable fixed-income instruments."},
  ];
  return <Card title="CAGR Decline Examples" T={T}>
    <div style={{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onClick={()=>setOpen(!open)}>
      <Hint T={T}>How does the 3-phase CAGR decline work? Click to {open?"hide":"see"} examples for common asset types.</Hint>
      <span style={{fontSize:16,color:T.accent,transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",flexShrink:0}}>{"▼"}</span>
    </div>
    {open&&<div style={{display:"flex",flexDirection:"column",gap:10,marginTop:6}}>
      <div style={{fontSize:12,color:T.textMid,fontFamily:FONT_LABEL,lineHeight:1.6,padding:"0 4px"}}>
        The 3-phase model assumes high early growth that gradually matures — mimicking how companies evolve from high-growth to stable phases. The three decline rates (1-5%, 6-20%, 21+%) control how quickly CAGR drops in each period. The CAGR never goes below 0%.
      </div>
      {examples.map((ex,i)=><div key={i} style={{background:T.inputBg,borderRadius:10,padding:"14px 18px",border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
          <div>
            <span style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{ex.label}</span>
            <span style={{fontSize:11,color:T.textMid,marginLeft:8,fontFamily:FONT_LABEL}}>{ex.desc}</span>
          </div>
          <div style={{fontFamily:FONT_MONO,fontSize:12,color:T.accent,background:`${T.accent}10`,padding:"3px 10px",borderRadius:6}}>
            {ex.cagr}% | {ex.d1} / {ex.d2} / {ex.d3}
          </div>
        </div>
        <div style={{fontSize:11.5,color:T.text,fontFamily:FONT_LABEL,lineHeight:1.7,opacity:0.85}}>{ex.explain}</div>
      </div>)}
      <div style={{fontSize:11,color:T.textDim,fontFamily:FONT_LABEL,padding:"4px 4px 0",lineHeight:1.5}}>
        💡 <strong>Tip:</strong> Use the Preset button on each asset for quick setup. Ultra Conservative suits bonds and GICs; steeper declines suit individual growth stocks that may mature over decades.
      </div>
    </div>}
  </Card>;
}

// ============================================================
// TAB: FIXED ASSETS
// ============================================================
function FixedAssetsTab({plan, update, T, baseCurrency="USD"}) {
  const [showPresets, setShowPresets] = useState(null);
  const [showTax, setShowTax] = useState({});
  const applyPreset = (i,key)=>{const p=CAGR_PRESETS[key];update(d=>{d.fixedAssets[i].cagr=p.cagr;d.fixedAssets[i].cagrDecline1=p.d1;d.fixedAssets[i].cagrDecline2=p.d2;d.fixedAssets[i].cagrDecline3=p.d3;return d;});setShowPresets(null);};
  const toggleTax = (key) => setShowTax(prev=>({...prev,[key]:!prev[key]}));

  return <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Fixed Assets (Non-Income)" badge="Real Estate, Precious Metals, Collectibles, Hard Assets" T={T}
      action={plan.fixedAssets.length<10?()=>update(d=>{d.fixedAssets.push({id:mkId(),name:"New Asset",note:"",shares:1,pricePerShare:0,cagr:3,cagrDecline1:0.1,cagrDecline2:0.05,cagrDecline3:0.02,enabled:false,taxRate:0,applyTax:false,costBasis:0});return d;}):null} actionLabel="+ Add">
      <Hint T={T}>Assets that grow in value but don't generate income. Three-phase CAGR decline: Yr 1-5, Yr 6-20, Yr 21+. Use % Tax for notional cap gains on sale.</Hint>
      {plan.fixedAssets.map((a,i)=>{
        const tk=`fa_${i}`;
        return <div key={a.id}>
          <ItemRow enabled={a.enabled} T={T} onToggle={()=>update(d=>{d.fixedAssets[i].enabled=!d.fixedAssets[i].enabled;return d;})} onRemove={()=>update(d=>{d.fixedAssets.splice(i,1);return d;})}>
            <MF label="Name" value={a.name} w="1.0fr" onChange={v=>update(d=>{d.fixedAssets[i].name=v;return d;})} T={T}/>
            <MF label="Units" cls="mf-sm" value={a.shares} type="number" w="0.25fr" onChange={v=>update(d=>{d.fixedAssets[i].shares=+v||0;return d;})} T={T}/>
            <MF label="Price" cls="mf-md" value={a.pricePerShare} type="number" w="0.4fr" onChange={v=>update(d=>{d.fixedAssets[i].pricePerShare=+v||0;return d;})} T={T}/>
            <MF label="CAGR%" cls="mf-xs" value={a.cagr} type="number" step="0.5" w="0.22fr" onChange={v=>update(d=>{d.fixedAssets[i].cagr=+v||0;return d;})} T={T}/>
            <MF label="Yr 1-5 ↓%" cls="mf-xs" value={a.cagrDecline1!==undefined?a.cagrDecline1:(a.cagrDecline||0.1)} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.fixedAssets[i].cagrDecline1=+v||0;return d;})} T={T}/>
            <MF label="Yr 6-20 ↓%" cls="mf-xs" value={a.cagrDecline2!==undefined?a.cagrDecline2:((a.cagrDecline||0.1)*0.5)} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.fixedAssets[i].cagrDecline2=+v||0;return d;})} T={T}/>
            <MF label="Yr 21+ ↓%" cls="mf-xs" value={a.cagrDecline3!==undefined?a.cagrDecline3:((a.cagrDecline||0.1)*0.2)} type="number" step="0.1" w="0.22fr" onChange={v=>update(d=>{d.fixedAssets[i].cagrDecline3=+v||0;return d;})} T={T}/>
            <CurrencyTag currency={a.currency||baseCurrency} base={baseCurrency} onChange={v=>update(d=>{d.fixedAssets[i].currency=v;return d;})} T={T}/>
            <div style={{display:"flex",flexDirection:"column",gap:2,alignSelf:"end",paddingBottom:4}}>
              <button onClick={()=>setShowPresets(showPresets===i?null:i)} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:FONT_LABEL}}>CAGR % Preset</button>
            </div>
            <TaxToggleBtn open={showTax[tk]} applyTax={a.applyTax} onToggle={()=>toggleTax(tk)} T={T}/>
          </ItemRow>
          {showTax[tk]&&<TaxSubRowCapGains
            taxRate={a.taxRate||0} applyTax={a.applyTax} costBasis={a.costBasis||0}
            currency={a.currency||baseCurrency}
            onTaxRate={v=>update(d=>{d.fixedAssets[i].taxRate=v;return d;})}
            onApplyTax={()=>update(d=>{d.fixedAssets[i].applyTax=!d.fixedAssets[i].applyTax;return d;})}
            onCostBasis={v=>update(d=>{d.fixedAssets[i].costBasis=v;return d;})}
            T={T}
          />}
          {a.enabled&&a.pricePerShare>0&&<div style={{textAlign:"right",fontSize:11,fontFamily:FONT_MONO,paddingRight:10,marginTop:2,marginBottom:4,display:"flex",justifyContent:"flex-end",gap:14,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{color:T.gold,fontWeight:600}}>{fmt(a.shares*a.pricePerShare,a.currency||baseCurrency)}</span>
            {a.applyTax&&(a.taxRate||0)>0&&(a.costBasis||0)>0&&(
              <span style={{color:T.amber,fontSize:10,display:"flex",alignItems:"center"}}>
                Notional gain tax: {fmt(a.shares*Math.max(0,a.pricePerShare-(a.costBasis||0))*(a.taxRate/100),a.currency||baseCurrency)}
                <NotionalGainInfo T={T}/>
              </span>
            )}
          </div>}
          {showPresets===i&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:6,padding:"6px 28px 10px",background:T.bg,borderRadius:8,margin:"-2px 0 6px"}}>
            {Object.entries(CAGR_PRESETS).map(([k,p])=><button key={k} onClick={()=>applyPreset(i,k)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:11,fontWeight:600,color:T.text,fontFamily:FONT_LABEL}}>{p.label}</div>
              <div style={{fontSize:9,color:T.textMid,fontFamily:FONT_LABEL}}>{p.desc}</div>
              <div style={{fontSize:9,color:T.accent,fontFamily:FONT_MONO}}>{p.cagr}% | {p.d1}/{p.d2}/{p.d3}</div>
            </button>)}
          </div>}
        </div>;
      })}
    </Card>
    <CagrExamplesBox T={T}/>
  </div>;
}

// ============================================================
// LIFETIME INCOME SUMMARY CARD
// ============================================================
function NetIncomeSummary({results, T, bc}) {
  const totGross=results.reduce((t,r)=>t+r.totalIncome,0);
  const totTax=results.reduce((t,r)=>t+(r.totalTax||0),0);
  const totNet=results.reduce((t,r)=>t+(r.netIncome??r.totalIncome),0);
  return(
    <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"16px 20px",width:"100%",marginTop:0}}>
      <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:24}}>
        <h2 style={{fontFamily:FONT_DISPLAY,fontSize:17,color:T.text,margin:0,flexShrink:0}}>Lifetime Income Summary</h2>
        <div style={{display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,fontFamily:FONT_LABEL}}>Lifetime Gross</div>
            <div style={{fontSize:16,fontWeight:700,color:T.gold,fontFamily:FONT_DISPLAY}}>{fmtK(totGross,bc)}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,fontFamily:FONT_LABEL}}>Lifetime Tax</div>
            <div style={{fontSize:16,fontWeight:700,color:T.amber,fontFamily:FONT_DISPLAY}}>{fmtK(totTax,bc)}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,fontFamily:FONT_LABEL}}>Lifetime Net</div>
            <div style={{fontSize:16,fontWeight:700,color:T.green,fontFamily:FONT_DISPLAY}}>{fmtK(totNet,bc)}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,fontFamily:FONT_LABEL}}>Avg Tax Rate</div>
            <div style={{fontSize:16,fontWeight:700,color:T.amber,fontFamily:FONT_DISPLAY}}>{totGross>0?((totTax/totGross)*100).toFixed(1):0}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: PROJECTIONS (frozen year column)
// ============================================================
function ProjectionsTab({plan, results, T, baseCurrency="USD"}) {
  const bc=baseCurrency||"USD";
  const ea=plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const ei=plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  if(!results.length) return <div style={{width:"100%"}}><Card title="Projections" T={T}><Empty T={T}/></Card></div>;
  const th={padding:"7px 6px",textAlign:"right",fontSize:10,fontWeight:600,color:"#ccc",whiteSpace:"nowrap",fontFamily:FONT_MONO};
  const td={padding:"5px 6px",textAlign:"right",fontSize:11,whiteSpace:"nowrap",fontFamily:FONT_MONO,color:T.text};
  const hasTax=results.some(r=>(r.totalTax||0)>0);
  return <div style={{width:"100%"}}><Card title="Year-by-Year Projections" T={T}>
    <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"75vh",width:"100%"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
        <thead style={{position:"sticky",top:0,zIndex:2}}>
          <tr style={{background:"#1a1a3a"}}>
            <th style={{...th,position:"sticky",left:0,zIndex:3,background:"#1a1a3a",textAlign:"left"}}>Year</th>
            <th style={th}>Age</th>
            <th style={{...th,color:T.gold}}>Gross Income</th>
            <th style={{...th,color:T.green}}>Net Income</th>
            {hasTax&&<th style={{...th,color:T.amber}}>Tax Paid</th>}
            <th style={{...th,color:T.green}}>Portfolio</th>
            <th style={th}>Fixed</th><th style={th}>Inv.Inc</th><th style={th}>Div</th><th style={th}>Other Inc</th>
            <th style={{...th,color:T.purple}}>Fixed+Other Assets</th>
            {ea.map(a=><th key={a.id} colSpan={3} style={{...th,background:"#222244"}}>{a.name}</th>)}
            {ei.map(s=><th key={s.id} colSpan={2} style={{...th,background:"#1a2a3a"}}>{s.name}</th>)}
          </tr>
          {(ea.length>0||ei.length>0)&&<tr style={{background:T.card}}>
            <th style={{...th,position:"sticky",left:0,zIndex:3,background:T.card,fontSize:8,color:T.textDim}}/>
            <th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/>
            {hasTax&&<th style={{...th,fontSize:8,color:T.textDim}}/>}
            <th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/><th style={{...th,fontSize:8,color:T.textDim}}/>
            {ea.map(a=><React.Fragment key={a.id}><th style={{...th,fontSize:8,color:T.textDim}}>W/D</th><th style={{...th,fontSize:8,color:T.textDim}}>Shrs</th><th style={{...th,fontSize:8,color:T.textDim}}>Px</th></React.Fragment>)}
            {ei.map(s=><React.Fragment key={s.id}><th style={{...th,fontSize:8,color:T.textDim}}>W/D</th><th style={{...th,fontSize:8,color:T.textDim}}>Div</th></React.Fragment>)}
          </tr>}
        </thead>
        <tbody>{results.map((r,i)=><tr key={i} style={{background:i%2?T.rowAlt:"transparent",borderBottom:`1px solid ${T.border}`}}>
          <td style={{...td,position:"sticky",left:0,zIndex:1,background:i%2?T.rowAlt:T.card,fontWeight:600,textAlign:"left"}}>{r.year}</td>
          <td style={td}>{r.age}</td>
          <td style={{...td,fontWeight:700,color:T.gold}}>{fmt(r.totalIncome,bc)}</td>
          <td style={{...td,fontWeight:700,color:T.green}}>{fmt(r.netIncome??r.totalIncome,bc)}</td>
          {hasTax&&<td style={{...td,fontWeight:600,color:(r.totalTax||0)>0?T.amber:T.textDim}}>{(r.totalTax||0)>0?fmt(r.totalTax,bc):"—"}</td>}
          <td style={{...td,fontWeight:700,color:T.green}}>{fmtK(r.totalValue,bc)}</td>
          <td style={td}>{fmt(r.fixedIncome,bc)}</td><td style={td}>{fmt(r.investmentIncome,bc)}</td><td style={td}>{fmt(r.dividendIncome,bc)}</td><td style={td}>{fmt(r.otherIncome,bc)}</td>
          <td style={{...td,color:T.purple,fontWeight:600}}>{fmtK((r.fixedAssetValues||[]).reduce((t,a)=>t+a.value,0)+(r.otherIncomeValues||[]).reduce((t,a)=>t+a.value,0),bc)}</td>
          {r.assets.map((a,j)=><React.Fragment key={j}><td style={td}>{fmt(a.withdrawal,bc)}</td><td style={{...td,color:T.textDim}}>{fmtN(a.shares,1)}</td><td style={{...td,color:T.textDim}}>{fmt(a.price,bc)}</td></React.Fragment>)}
          {(r.investmentIncomeSources||[]).map((s,j)=><React.Fragment key={j}><td style={td}>{fmt(s.withdrawal,bc)}</td><td style={{...td,color:T.green}}>{fmt(s.dividendIncome,bc)}</td></React.Fragment>)}
        </tr>)}</tbody>
      </table>
    </div>
  </Card>
  {results.some(r=>(r.totalTax||0)>0)&&<NetIncomeSummary results={results} T={T} bc={bc}/>}
  </div>;
}

// ============================================================
// TAB: WITHDRAWAL PLAN
// ============================================================
function WithdrawalTab({plan, results, T, baseCurrency="USD"}) {
  const bc=baseCurrency||"USD";
  const ea=plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const ei=plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  if(!results.length||(!ea.length&&!ei.length)) return <div style={{width:"100%"}}><Card title="Withdrawal Plan" T={T}><Empty T={T} msg="Enable divest assets or registered investment income to see withdrawal schedule."/></Card></div>;
  const th={padding:"8px 8px",textAlign:"right",fontSize:11,fontWeight:600,color:"#ccc",whiteSpace:"nowrap",fontFamily:FONT_MONO};
  const td={padding:"6px 8px",textAlign:"right",fontSize:12,whiteSpace:"nowrap",fontFamily:FONT_MONO,color:T.text};
  const hasTax=results.some(r=>(r.totalTax||0)>0);
  return <div style={{width:"100%"}}><Card title="Annual Withdrawal Plan" T={T}>
    <Hint T={T}>Shares to sell each year and income generated from each asset and registered investment account.</Hint>
    <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"75vh",width:"100%"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead style={{position:"sticky",top:0,zIndex:2}}>
          <tr style={{background:"#1a1a3a"}}>
            <th style={{...th,position:"sticky",left:0,zIndex:3,background:"#1a1a3a",textAlign:"left"}}>Year</th>
            <th style={th}>Age</th>
            <th style={{...th,color:T.gold}}>Total W/D</th>
            {hasTax&&<th style={{...th,color:T.amber}}>Tax Paid</th>}
            {hasTax&&<th style={{...th,color:T.green}}>After-Tax</th>}
            {ea.map(a=><React.Fragment key={a.id}>
              <th style={{...th,background:"#222244"}}>{a.name} Sell</th>
              <th style={{...th,background:"#222244"}}>{a.name} Gross</th>
              {a.applyTax&&<th style={{...th,background:"#222244",color:T.green}}>{a.name} Net</th>}
              <th style={{...th,background:"#1a1a3a"}}>{a.name} Left</th>
            </React.Fragment>)}
            {ei.map(s=><React.Fragment key={s.id}>
              <th style={{...th,background:"#1a2a3a"}}>{s.name} Sell</th>
              <th style={{...th,background:"#1a2a3a"}}>{s.name} Div</th>
              {s.applyTax&&<th style={{...th,background:"#1a2a3a",color:T.green}}>{s.name} Net</th>}
              <th style={{...th,background:"#1a2a3a"}}>{s.name} Left</th>
            </React.Fragment>)}
          </tr>
        </thead>
        <tbody>{results.map((r,i)=>{
          const tw=(r.assets.reduce((t,a)=>t+a.withdrawal,0))+(r.investmentIncomeSources||[]).reduce((t,s)=>t+s.withdrawal+s.dividendIncome,0);
          return<tr key={i} style={{background:i%2?T.rowAlt:"transparent",borderBottom:`1px solid ${T.border}`}}>
            <td style={{...td,position:"sticky",left:0,zIndex:1,background:i%2?T.rowAlt:T.card,fontWeight:600,textAlign:"left"}}>{r.year}</td>
            <td style={td}>{r.age}</td>
            <td style={{...td,fontWeight:700,color:T.gold}}>{fmt(tw,bc)}</td>
            {hasTax&&<td style={{...td,fontWeight:600,color:(r.totalTax||0)>0?T.amber:T.textDim}}>{(r.totalTax||0)>0?fmt(r.totalTax,bc):"—"}</td>}
            {hasTax&&<td style={{...td,fontWeight:700,color:T.green}}>{fmt(tw-(r.totalTax||0),bc)}</td>}
            {r.assets.map((a,j)=>{
              const daOrig=ea[j];
              return <React.Fragment key={j}>
                <td style={{...td,color:T.accent}}>{fmtN(a.sharesSold,4)}</td>
                <td style={{...td,color:T.green}}>{fmt(a.withdrawal,bc)}</td>
                {daOrig?.applyTax&&<td style={{...td,color:T.green,fontWeight:600}}>{fmt(a.netWithdrawal??a.withdrawal,bc)}</td>}
                <td style={{...td,color:T.textDim}}>{fmtN(a.shares,2)}</td>
              </React.Fragment>;
            })}
            {(r.investmentIncomeSources||[]).map((s,j)=>{
              const eiOrig=ei[j];
              return <React.Fragment key={j}>
                <td style={{...td,color:T.cyan}}>{fmtN(s.sharesSold,4)}</td>
                <td style={{...td,color:T.green}}>{fmt(s.dividendIncome,bc)}</td>
                {eiOrig?.applyTax&&<td style={{...td,color:T.green,fontWeight:600}}>{fmt(s.netWithdrawal??s.withdrawal,bc)}</td>}
                <td style={{...td,color:T.textDim}}>{fmtN(s.shares,2)}</td>
              </React.Fragment>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </Card></div>;
}

// ============================================================
// TAB: CHARTS
// ============================================================
const CHART_VIEWS=[
  {id:"portfolio",label:"Total Portfolio Value"},
  {id:"income",label:"Annual Income (Stacked)"},
  {id:"grossNet",label:"Gross vs Net Income"},
  {id:"taxPaid",label:"Annual Tax Paid"},
  {id:"appreciation",label:"Growth vs Spending"},
  {id:"withdrawals",label:"Withdrawals by Asset"},
  {id:"shares",label:"Remaining Shares (Divest)"},
  {id:"investmentShares",label:"Tax Deferred Account Value"},
  {id:"fixedAssets",label:"Fixed & Other Assets Value"},
];

function ChartsTab({plan, results, T, baseCurrency="USD"}) {
  const [view,setView]=useState("portfolio");
  const ea=plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const ei=plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  const efa=plan.fixedAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  if(!results.length) return <div style={{width:"100%"}}><Card title="Charts" T={T}><Empty T={T}/></Card></div>;
  const desc={
    portfolio:"Total portfolio value over time (all assets).",
    income:"Stacked income breakdown from all sources.",
    grossNet:"Gross income vs net income after tax — shows the tax drag growing over time as your portfolio appreciates.",
    taxPaid:"Annual tax paid across all sources — grows as share prices rise and gains increase each year.",
    appreciation:"Portfolio appreciation vs total withdrawals each year.",
    withdrawals:"Annual withdrawal amount from each divest and registered account.",
    shares:"Remaining share count as divest assets are sold down.",
    investmentShares:"Registered investment account values over time.",
    fixedAssets:"Fixed asset and other income source appreciation over the projection.",
  };
  const hasTaxData=results.some(r=>(r.totalTax||0)>0);
  const CTooltip=({active,payload,label})=>{if(!active||!payload?.length)return null;return<div style={{background:"#0d0d1f",border:"1px solid #2a2a4a",borderRadius:8,padding:"10px 14px",fontSize:11,fontFamily:FONT_MONO}}><div style={{color:"#888",marginBottom:4}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,marginBottom:2}}>{p.name}: {typeof p.value==="number"&&p.value>100?fmtK(p.value):fmtN(p.value,2)}</div>)}</div>;};

  const renderChart=()=>{
    if(view==="portfolio"){
      const data=results.map(r=>({year:r.year,Portfolio:r.totalValue}));
      return<ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.accent} stopOpacity={0.3}/><stop offset="100%" stopColor={T.accent} stopOpacity={0}/></linearGradient></defs>
        <XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Area type="monotone" dataKey="Portfolio" stroke={T.accent} fill="url(#gP)" strokeWidth={2.5}/></AreaChart></ResponsiveContainer>;
    }
    if(view==="income"){
      const data=results.map(r=>({year:r.year,Fixed:r.fixedIncome,Divest_WD:r.assets?.reduce((t,a)=>t+a.withdrawal,0)||0,Reg_WD:(r.investmentIncomeSources||[]).reduce((t,s)=>t+s.withdrawal,0),Dividends:r.dividendIncome,Other:r.otherIncome}));
      return<ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        <Bar dataKey="Fixed" stackId="a" fill={T.accent}/><Bar dataKey="Divest_WD" stackId="a" fill={T.gold}/><Bar dataKey="Reg_WD" stackId="a" fill={T.cyan}/><Bar dataKey="Dividends" stackId="a" fill={T.green}/><Bar dataKey="Other" stackId="a" fill={T.purple} radius={[3,3,0,0]}/></ComposedChart></ResponsiveContainer>;
    }
    if(view==="grossNet"){
      if(!hasTaxData) return<div style={{textAlign:"center",padding:60,color:T.textDim,fontFamily:FONT_LABEL,fontSize:13}}>No tax applied yet. Enable Apply Tax on at least one income source or asset to see Gross vs Net.</div>;
      const data=results.map(r=>({year:r.year,"Gross Income":r.totalIncome,"Net Income":r.netIncome??r.totalIncome}));
      return<ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="gGross" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.gold} stopOpacity={0.15}/><stop offset="100%" stopColor={T.gold} stopOpacity={0}/></linearGradient>
            <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity={0.2}/><stop offset="100%" stopColor={T.green} stopOpacity={0}/></linearGradient>
          </defs>
          <XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/>
          <YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
          <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
          <Area type="monotone" dataKey="Gross Income" stroke={T.gold} fill="url(#gGross)" strokeWidth={2} strokeDasharray="6 3" dot={false}/>
          <Area type="monotone" dataKey="Net Income" stroke={T.green} fill="url(#gNet)" strokeWidth={2.5} dot={false}/>
        </ComposedChart>
      </ResponsiveContainer>;
    }
    if(view==="taxPaid"){
      if(!hasTaxData) return<div style={{textAlign:"center",padding:60,color:T.textDim,fontFamily:FONT_LABEL,fontSize:13}}>No tax applied yet. Enable Apply Tax on at least one income source or asset to see Annual Tax Paid.</div>;
      const data=results.map(r=>({year:r.year,"Tax Paid":r.totalTax||0}));
      return<ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/>
          <YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
          <Tooltip content={<CTooltip/>}/>
          <Bar dataKey="Tax Paid" fill={T.amber} radius={[3,3,0,0]}/>
        </BarChart>
      </ResponsiveContainer>;
    }
    if(view==="appreciation"){
      const data=results.map((r,i)=>{const pv=i>0?results[i-1].totalValue:r.totalValue;return{year:r.year,Appreciation:Math.max(r.totalValue-pv+r.totalIncome,0),Spending:r.totalIncome};});
      return<ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        <Bar dataKey="Appreciation" fill={T.accent}/><Line dataKey="Spending" stroke={T.gold} strokeWidth={2} dot={false} strokeDasharray="6 3"/></ComposedChart></ResponsiveContainer>;
    }
    if(view==="withdrawals"){
      const allAssets=[...ea,...ei];
      const data=results.map(r=>{const o={year:r.year};r.assets.forEach(a=>{o[a.name]=a.withdrawal;});(r.investmentIncomeSources||[]).forEach(s=>{o[s.name]=s.withdrawal;});return o;});
      return<ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        {allAssets.map((a,i)=><Line key={a.id} type="monotone" dataKey={a.name} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>;
    }
    if(view==="shares"){
      const data=results.map(r=>{const o={year:r.year};r.assets.forEach(a=>{o[a.name]=a.shares;});return o;});
      return<ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        {ea.map((a,i)=><Line key={a.id} type="monotone" dataKey={a.name} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>;
    }
    if(view==="investmentShares"){
      if(!ei.length) return<div style={{textAlign:"center",padding:60,color:T.textDim}}>No registered investment accounts enabled.</div>;
      const data=results.map(r=>{const o={year:r.year};(r.investmentIncomeSources||[]).forEach(s=>{o[s.name]=s.value;});return o;});
      return<ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        {ei.map((s,i)=><Line key={s.id} type="monotone" dataKey={s.name} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>;
    }
    if(view==="fixedAssets"){
      const eoa=plan.otherIncome.filter(s=>s.enabled&&((s.shares>0&&s.pricePerShare>0)||(s.includeIncome&&s.annualIncome>0)));
      if(!efa.length&&!eoa.length) return<div style={{textAlign:"center",padding:60,color:T.textDim}}>No fixed or other income assets enabled.</div>;
      const data=results.map(r=>{const o={year:r.year};(r.fixedAssetValues||[]).forEach(a=>{o[a.name]=a.value;});(r.otherIncomeValues||[]).forEach(a=>{o[a.name]=a.value;});return o;});
      const allLines=[...efa,...eoa];
      return<ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="year" tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={{stroke:T.border}}/><YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:T.textDim}} tickLine={false} axisLine={false}/>
        <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:11,fontFamily:FONT_MONO}}/>
        {allLines.map((a,i)=><Line key={a.id} type="monotone" dataKey={a.name} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>;
    }
  };

  return<div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",overflow:"visible"}}><div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"visible",width:"100%"}}>
    <div style={{padding:"16px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
      <div><h2 style={{fontFamily:FONT_DISPLAY,fontSize:18,color:T.text,margin:0}}>Portfolio Projections</h2><p style={{fontSize:11,color:T.textDim,margin:"4px 0 0",fontFamily:FONT_LABEL}}>{desc[view]||""}</p></div>
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
  </div></div>;
}

// ============================================================
// TAB: ADDITIONAL
// ============================================================
function AdditionalTab({plan, update, T, baseCurrency="USD", fxRate={}}) {
  const base=baseCurrency||"USD";
  const [showTax, setShowTax] = useState({});
  const toggleTax = (key) => setShowTax(prev=>({...prev,[key]:!prev[key]}));
  const btEnabled=plan.bigTicketStocks.filter(s=>s.enabled&&s.shares>0&&s.price>0);
  const totalInBase=btEnabled.reduce((t,s)=>t+toBase(s.shares*s.price,s.currency||base,base,fxRate),0);
  // After-tax proceeds for big ticket
  const afterTaxInBase=btEnabled.reduce((t,s)=>{
    const price=toBase(s.price,s.currency||base,base,fxRate);
    const cb=toBase(s.costBasis||0,s.currency||base,base,fxRate);
    const gain=Math.max(0,price-cb);
    const tax=(s.applyTax&&(s.taxRate||0)>0)?s.shares*gain*(s.taxRate/100):0;
    return t+(s.shares*price)-tax;
  },0);
  const totalTaxBT=totalInBase-afterTaxInBase;
  const hasTax=btEnabled.some(s=>s.applyTax&&(s.taxRate||0)>0);

  return<div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
    <Card title="Notes & Plans" T={T}>
      <textarea value={plan.notes||""} onChange={e=>{e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";update(d=>{d.notes=e.target.value;return d;});}} placeholder="Emergency fund, healthcare, estate planning, tax strategies..."
        style={{width:"100%",minHeight:70,padding:14,background:T.inputBg,border:`1px solid ${T.border}`,borderRadius:8,fontFamily:FONT_LABEL,fontSize:13,color:T.text,resize:"none",outline:"none",overflow:"hidden"}}/>
    </Card>
    <Card title="Big Ticket Calculator" T={T} action={plan.bigTicketStocks.length<10?()=>update(d=>{d.bigTicketStocks.push({id:mkId(),ticker:"",shares:0,price:0,enabled:false,taxRate:0,applyTax:false,costBasis:0});return d;}):null} actionLabel="+ Add">
      <Field label="Saving for?" value={plan.bigTicketItem||""} onChange={v=>update(d=>{d.bigTicketItem=v;return d;})} T={T} placeholder="e.g., Bucket list item"/>
      <div style={{marginTop:10}}>{plan.bigTicketStocks.map((s,i)=>{
        const tk=`bt_${i}`;
        return <React.Fragment key={s.id}>
          <ItemRow enabled={s.enabled} T={T} onToggle={()=>update(d=>{d.bigTicketStocks[i].enabled=!d.bigTicketStocks[i].enabled;return d;})} onRemove={()=>update(d=>{d.bigTicketStocks.splice(i,1);return d;})}>
            <MF label="Ticker" value={s.ticker} w="0.7fr" onChange={v=>update(d=>{d.bigTicketStocks[i].ticker=v;return d;})} T={T}/>
            <MF label="Shares" cls="mf-sm" value={s.shares} type="number" w="0.25fr" onChange={v=>update(d=>{d.bigTicketStocks[i].shares=+v||0;return d;})} T={T}/>
            <MF label="Price" cls="mf-md" value={s.price} type="number" w="0.4fr" onChange={v=>update(d=>{d.bigTicketStocks[i].price=+v||0;return d;})} T={T}/>
            <CurrencyTag currency={s.currency||baseCurrency} base={baseCurrency} onChange={v=>update(d=>{d.bigTicketStocks[i].currency=v;return d;})} T={T}/>
            <YahooLink ticker={s.ticker} T={T}/>
            <TaxToggleBtn open={showTax[tk]} applyTax={s.applyTax} onToggle={()=>toggleTax(tk)} T={T}/>
          </ItemRow>
          {showTax[tk]&&<TaxSubRowCapGains
            taxRate={s.taxRate||0} applyTax={s.applyTax} costBasis={s.costBasis||0}
            currency={s.currency||baseCurrency}
            onTaxRate={v=>update(d=>{d.bigTicketStocks[i].taxRate=v;return d;})}
            onApplyTax={()=>update(d=>{d.bigTicketStocks[i].applyTax=!d.bigTicketStocks[i].applyTax;return d;})}
            onCostBasis={v=>update(d=>{d.bigTicketStocks[i].costBasis=v;return d;})}
            T={T}
          />}
          {s.enabled&&s.shares>0&&s.price>0&&<div style={{textAlign:"right",fontSize:11,color:T.gold,fontWeight:600,fontFamily:FONT_MONO,paddingRight:10,marginTop:2,marginBottom:4}}>{fmt(s.shares*s.price,s.currency||baseCurrency)}</div>}
        </React.Fragment>;
      })}</div>
      {totalInBase>0&&<div style={{background:T.summaryBg,border:`1px solid ${T.gold}20`,borderRadius:10,padding:"14px 20px",marginTop:10}}>
        <div style={{display:"flex",alignItems:"center",gap:32,flexWrap:"wrap",justifyContent:"center"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:T.gold,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:3,fontFamily:FONT_LABEL}}>Total Available {hasTax?"(Pre-Tax)":""}</div>
            <div style={{fontFamily:FONT_DISPLAY,fontSize:22,fontWeight:700,color:T.gold}}>{fmt(totalInBase,base)}</div>
          </div>
          {hasTax&&<>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:T.amber,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3,fontFamily:FONT_LABEL}}>Est. Cap Gains Tax</div>
              <div style={{fontSize:18,fontWeight:700,color:T.amber,fontFamily:FONT_DISPLAY}}>{fmt(totalTaxBT,base)}</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:T.green,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3,fontFamily:FONT_LABEL}}>After-Tax Proceeds</div>
              <div style={{fontSize:22,fontWeight:700,color:T.green,fontFamily:FONT_DISPLAY}}>{fmt(afterTaxInBase,base)}</div>
            </div>
          </>}
        </div>
      </div>}
      <div style={{background:T.inputBg,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 18px",marginTop:10}}>
        <div style={{fontSize:11,fontWeight:700,color:T.accent,fontFamily:FONT_LABEL,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>What is being sold to fund big ticket items?</div>
        <div style={{fontSize:12,color:T.textMid,fontFamily:FONT_LABEL,lineHeight:1.7}}>
          The Big Ticket Calculator shows the <strong style={{color:T.text}}>current market value</strong> of stocks you could liquidate for a major purchase.
          When selling, consider: <strong style={{color:T.text}}>capital gains tax</strong> on appreciated positions,
          the <strong style={{color:T.text}}>opportunity cost</strong> of removing assets from your growth portfolio,
          and whether selling from <strong style={{color:T.text}}>registered accounts</strong> (RRSP/401k/TFSA/IRA) triggers additional withholding tax.
          Use the <strong style={{color:T.amber}}>% Tax</strong> toggle on each row to enter your effective cap gains rate and cost basis.
        </div>
      </div>
    </Card>
  </div>;
}

// ============================================================
// SHARED COMPONENTS
// ============================================================
function Card({title,badge,children,action,actionLabel,T,noPad}){return<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:noPad?0:"16px 20px",overflow:"hidden",width:"100%"}}>
  {title&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><h2 style={{fontFamily:FONT_DISPLAY,fontSize:17,color:T.text,margin:0}}>{title}</h2>
    {badge&&<span style={{fontSize:9,color:T.textMid,background:`${T.accent}10`,padding:"2px 8px",borderRadius:10,fontFamily:FONT_LABEL,whiteSpace:"normal"}}>{badge}</span>}</div>
    {action&&<button onClick={action} style={{padding:"5px 12px",background:T.accent,color:"#fff",border:"none",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:FONT_LABEL}}>{actionLabel}</button>}
  </div>}{children}</div>;}

function ItemRow({children,enabled,onToggle,onRemove,T}){return<div style={{display:"flex",gap:6,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:8,border:`1px solid ${enabled?T.accent+"20":T.border}`,background:enabled?T.inputBg+"80":"transparent",opacity:enabled?1:0.5,transition:"all 0.15s",flexWrap:"wrap"}}>
  <button onClick={onToggle} style={{width:18,height:18,borderRadius:3,border:`2px solid ${enabled?T.green:T.border2}`,background:enabled?T.green:"transparent",color:"#fff",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:16,padding:0}}>{enabled?"\u2713":""}</button>
  <div style={{display:"flex",gap:6,flex:1,flexWrap:"wrap",alignItems:"flex-start"}}>{children}</div>
  <button onClick={onRemove} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:14,padding:2,marginTop:14,flexShrink:0}}>{"\u00D7"}</button></div>;}

function Field({label,value,onChange,type="text",step,placeholder,T}){return<div><label style={{fontSize:10,color:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:3,fontFamily:FONT_LABEL}}>{label}</label>
  <input type={type} value={value} step={step} placeholder={placeholder} onChange={e=>onChange(e.target.value)} onFocus={e=>e.target.select()} style={{width:"100%",padding:"7px 10px",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:6,fontSize:13,color:T.text,fontFamily:FONT_LABEL}}/></div>;}

function MF({label,value,onChange,type="text",step,w="1fr",lock=false,px,cls,T}){return<div className={cls||""} style={{minWidth:30,flex:px?`0 0 ${px}px`:lock?"0 0 auto":w,width:px?px:undefined}}><label style={{fontSize:9,color:T.label,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,display:"block",marginBottom:2,fontFamily:FONT_LABEL}}>{label}</label>
  <input type={type} value={value} step={step} onChange={e=>onChange(e.target.value)} onFocus={e=>e.target.select()} style={{width:"100%",padding:"4px 6px",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:4,fontSize:12,color:T.text,fontFamily:FONT_LABEL}}/></div>;}

function Chk({label,checked,onChange,T}){return<div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:32}}><label style={{fontSize:9,color:T.label,fontWeight:600,letterSpacing:0.3,marginBottom:2,fontFamily:FONT_LABEL}}>{label}</label>
  <input type="checkbox" checked={checked} onChange={onChange} style={{width:14,height:14,cursor:"pointer",accentColor:T.accent}}/></div>;}

function SumCard({label,value,color,note,T}){return<div style={{background:T.card,borderRadius:10,padding:"14px 16px",textAlign:"center",border:`1px solid ${T.border}`,borderLeft:`3px solid ${color}`,minHeight:72}}>
  <div style={{fontSize:10,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:5,fontFamily:FONT_LABEL}}>{label}</div>
  <div style={{fontSize:20,fontWeight:700,color,fontFamily:FONT_DISPLAY,lineHeight:1.2}}>{value}</div>
  {note&&<div style={{fontSize:9,color:T.textDim,fontFamily:FONT_LABEL,marginTop:4,letterSpacing:0.3}}>{note}</div>}
</div>;}

function CurrencyTag({currency,onChange,base,T}){
  const cur=currency||base;
  const isForeign=cur!==base;
  const [tip,setTip]=useState(null);
  const btnRef=useRef(null);
  const handleInfo=(e)=>{
    e.stopPropagation();
    if(tip){setTip(null);return;}
    const r=btnRef.current?.getBoundingClientRect();
    if(r) setTip({top:r.bottom+6,left:Math.min(r.left,window.innerWidth-252)});
  };
  useEffect(()=>{
    if(!tip)return;
    const close=()=>setTip(null);
    document.addEventListener("click",close);
    document.addEventListener("touchstart",close);
    return()=>{document.removeEventListener("click",close);document.removeEventListener("touchstart",close);};
  },[tip]);
  return<div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:54}}>
    <label style={{fontSize:9,color:T.label,fontWeight:600,letterSpacing:0.3,marginBottom:2,fontFamily:FONT_LABEL,display:"flex",alignItems:"center",gap:2}}>
      CCY<span ref={btnRef} onClick={handleInfo} onTouchEnd={e=>{e.preventDefault();handleInfo(e);}} style={{cursor:"pointer",color:T.accent,fontSize:9,WebkitUserSelect:"none",userSelect:"none"}}>ⓘ</span>
    </label>
    {tip&&<div className="np-infobubble" style={{top:tip.top,left:tip.left,background:T.card,color:T.text,border:`1px solid ${T.border2}`,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>Select the currency this asset is priced in. If different from your base currency, values will be converted automatically using the live exchange rate.</div>}
    <select value={cur} onChange={e=>onChange(e.target.value)} style={{
      padding:"2px 4px",fontSize:9,fontWeight:600,
      background:isForeign?`${T.accent}18`:T.inputBg,
      color:isForeign?T.accent:T.text,
      border:`1px solid ${isForeign?T.accent+"50":T.border2}`,
      borderRadius:4,cursor:"pointer",fontFamily:FONT_LABEL,width:"100%"
    }}>
      {CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.code}</option>)}
    </select>
  </div>;
}
function Hint({children,T}){return<p style={{color:T.textDim,fontSize:12,marginBottom:10,fontFamily:FONT_LABEL,lineHeight:1.4}}>{children}</p>;}
function Empty({T,msg}){return<p style={{color:T.textDim,textAlign:"center",padding:50,fontSize:13,fontFamily:FONT_LABEL}}>{msg||"Enable at least one asset or income source."}</p>;}
function SaveDot({status,T}){const c=status==="saving"?T.gold:T.green;return<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:c,fontFamily:FONT_LABEL}}><span style={{width:5,height:5,borderRadius:"50%",background:c}}/>{status==="saving"?"Saving...":"Saved"}</div>;}
function SmBtn({onClick,label,T,danger}){return<button onClick={onClick} style={{padding:"5px 12px",background:danger?T.red+"15":T.inputBg,color:danger?T.red:T.textMid,border:`1px solid ${danger?T.red+"30":T.border2}`,borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:500,fontFamily:FONT_LABEL,whiteSpace:"nowrap"}}>{label}</button>;}
// ============================================================
// TAB: SUMMARY
// ============================================================
function SummaryTab({plan, results, T, baseCurrency="USD"}) {
  const p = plan.params;
  const bc = baseCurrency||"USD";
  const y1 = results[0]||{};
  const yL = results[results.length-1]||{};
  const peakValue = results.length?Math.max(...results.map(r=>r.totalValue)):0;
  const anyTax = results.some(r=>(r.totalTax||0)>0);
  const totGross = results.reduce((t,r)=>t+r.totalIncome,0);
  const totTax = results.reduce((t,r)=>t+(r.totalTax||0),0);
  const totNet = results.reduce((t,r)=>t+(r.netIncome??r.totalIncome),0);

  const fi = plan.fixedIncome.filter(s=>s.enabled&&s.amount>0);
  const ii = plan.investmentIncome.filter(s=>s.enabled&&s.shares>0&&s.pricePerShare>0);
  const oi = plan.otherIncome.filter(s=>s.enabled&&((s.shares>0&&s.pricePerShare>0)||(s.includeIncome&&s.annualIncome>0)));
  const da = plan.divestAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const fa = plan.fixedAssets.filter(a=>a.enabled&&a.shares>0&&a.pricePerShare>0);
  const bt = plan.bigTicketStocks.filter(s=>s.enabled&&s.shares>0&&s.price>0);

  const Section = ({title, children}) => (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:10,fontWeight:700,color:T.accent,textTransform:"uppercase",letterSpacing:1.2,fontFamily:FONT_LABEL,marginBottom:8,paddingBottom:4,borderBottom:`1px solid ${T.border}`}}>{title}</div>
      {children}
    </div>
  );

  const Row = ({label, value, color}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"4px 0",borderBottom:`1px solid ${T.border}20`}}>
      <span style={{fontSize:12,color:T.textMid,fontFamily:FONT_LABEL}}>{label}</span>
      <span style={{fontSize:13,fontWeight:600,color:color||T.text,fontFamily:FONT_MONO}}>{value}</span>
    </div>
  );

  const Tag = ({label, color}) => (
    <span style={{fontSize:10,color:color||T.textMid,background:`${color||T.accent}15`,padding:"2px 8px",borderRadius:10,fontFamily:FONT_LABEL,fontWeight:600,marginRight:4,marginBottom:4,display:"inline-block"}}>{label}</span>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
      <Card title="Summary" badge="Read-only overview of your retirement plan" T={T}>

        {/* PLAN IDENTITY */}
        <Section title="Plan Details">
          <Row label="Name / Couple" value={p.personName||"—"}/>
          <Row label="Age at Start" value={p.ageAtStart}/>
          <Row label="Start Year" value={p.startYear}/>
          <Row label="Projection" value={`${p.projectionYears} years (to ${p.startYear+Math.ceil(p.projectionYears)-1})`}/>
          <Row label="Base Currency" value={p.baseCurrency||"USD"}/>
          <Row label="Inflation Rate" value={`${p.inflationRate}%`}/>
        </Section>

        {/* INCOME SOURCES */}
        {(fi.length>0||ii.length>0||oi.length>0)&&<Section title="Income Sources">
          {fi.map(s=>(
            <div key={s.id} style={{padding:"5px 0",borderBottom:`1px solid ${T.border}20`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <span style={{fontSize:12,color:T.text,fontFamily:FONT_LABEL,fontWeight:600}}>{s.name}</span>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:T.gold,fontFamily:FONT_MONO}}>{fmt(s.amount,s.currency||bc)}/yr</span>
                  {s.startYear>p.startYear&&<Tag label={`starts ${s.startYear}`} color={T.textDim}/>}
                  {s.indexing>0&&<Tag label={`+${s.indexing}% indexed`} color={T.cyan}/>}
                  {s.applyTax&&(s.taxRate||0)>0&&<Tag label={`${s.taxRate}% tax`} color={T.amber}/>}
                </div>
              </div>
            </div>
          ))}
          {ii.map(s=>(
            <div key={s.id} style={{padding:"5px 0",borderBottom:`1px solid ${T.border}20`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <span style={{fontSize:12,color:T.text,fontFamily:FONT_LABEL,fontWeight:600}}>{s.name}</span>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:T.gold,fontFamily:FONT_MONO}}>{fmt(toBase(s.shares*s.pricePerShare,s.currency||bc,bc,{}),bc)}</span>
                  <Tag label={`${s.cagr}% CAGR`} color={T.accent}/>
                  {s.applyTax&&(s.taxRate||0)>0&&<Tag label={`${s.taxRate}% tax`} color={T.amber}/>}
                  {!s.applyTax&&<Tag label="tax-free" color={T.green}/>}
                </div>
              </div>
            </div>
          ))}
          {oi.map(s=>(
            <div key={s.id} style={{padding:"5px 0",borderBottom:`1px solid ${T.border}20`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <span style={{fontSize:12,color:T.text,fontFamily:FONT_LABEL,fontWeight:600}}>{s.name}</span>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  {s.includeIncome&&s.annualIncome>0&&<span style={{fontSize:12,color:T.gold,fontFamily:FONT_MONO}}>{fmt(s.annualIncome,s.currency||bc)}/yr</span>}
                  {s.applyTax&&(s.taxRate||0)>0&&<Tag label={`${s.taxRate}% tax`} color={T.amber}/>}
                </div>
              </div>
            </div>
          ))}
        </Section>}

        {/* ASSETS */}
        {(da.length>0||fa.length>0)&&<Section title="Assets">
          {da.map(a=>(
            <div key={a.id} style={{padding:"5px 0",borderBottom:`1px solid ${T.border}20`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <span style={{fontSize:12,color:T.text,fontFamily:FONT_LABEL,fontWeight:600}}>{a.name} <span style={{fontSize:10,color:T.textDim}}>Divest</span></span>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:T.gold,fontFamily:FONT_MONO}}>{fmt(toBase(a.shares*a.pricePerShare,a.currency||bc,bc,{}),bc)}</span>
                  <Tag label={`${a.cagr}% CAGR`} color={T.accent}/>
                  {a.applyTax&&(a.taxRate||0)>0&&<Tag label={`${a.taxRate}% cap gains`} color={T.amber}/>}
                </div>
              </div>
            </div>
          ))}
          {fa.map(a=>(
            <div key={a.id} style={{padding:"5px 0",borderBottom:`1px solid ${T.border}20`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <span style={{fontSize:12,color:T.text,fontFamily:FONT_LABEL,fontWeight:600}}>{a.name} <span style={{fontSize:10,color:T.textDim}}>Fixed</span></span>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:T.purple,fontFamily:FONT_MONO}}>{fmt(toBase(a.shares*a.pricePerShare,a.currency||bc,bc,{}),bc)}</span>
                  <Tag label={`${a.cagr}% CAGR`} color={T.accent}/>
                </div>
              </div>
            </div>
          ))}
        </Section>}

        {/* BIG TICKET */}
        {bt.length>0&&plan.bigTicketItem&&(()=>{
          const btTotal=bt.reduce((t,s)=>t+toBase(s.shares*s.price,s.currency||bc,bc,{}),0);
          const btAfterTax=bt.reduce((t,s)=>{
            const price=toBase(s.price,s.currency||bc,bc,{});
            const cb=toBase(s.costBasis||0,s.currency||bc,bc,{});
            const gain=Math.max(0,price-cb);
            const tax=(s.applyTax&&(s.taxRate||0)>0)?s.shares*gain*(s.taxRate/100):0;
            return t+(s.shares*price)-tax;
          },0);
          const btHasTax=bt.some(s=>s.applyTax&&(s.taxRate||0)>0);
          return <Section title="Big Ticket">
            <Row label={`${plan.bigTicketItem} — Pre-Tax`} value={fmt(btTotal,bc)} color={T.gold}/>
            {btHasTax&&<Row label={`${plan.bigTicketItem} — After-Tax`} value={fmt(btAfterTax,bc)} color={T.green}/>}
          </Section>;
        })()}

        {/* KEY OUTCOMES */}
        {results.length>0&&<Section title="Key Outcomes">
          <Row label="Year 1 Gross Income" value={fmt(y1.totalIncome,bc)} color={T.gold}/>
          {anyTax&&<Row label="Year 1 Net Income" value={fmt(y1.netIncome??y1.totalIncome,bc)} color={T.green}/>}
          <Row label="Year 1 Portfolio Value" value={fmtK(y1.totalValue,bc)} color={T.accent}/>
          <Row label="Peak Portfolio" value={fmtK(peakValue,bc)} color={T.purple}/>
          <Row label="Final Year Income" value={fmt(yL.totalIncome,bc)} color={T.cyan}/>
          <Row label="Final Portfolio Value" value={fmtK(yL.totalValue,bc)} color={T.amber}/>
          {anyTax&&<>
            <Row label="Lifetime Gross Income" value={fmtK(totGross,bc)} color={T.gold}/>
            <Row label="Lifetime Tax Paid" value={fmtK(totTax,bc)} color={T.amber}/>
            <Row label="Lifetime Net Income" value={fmtK(totNet,bc)} color={T.green}/>
            <Row label="Average Tax Rate" value={totGross>0?((totTax/totGross)*100).toFixed(1)+"%":"—"} color={T.amber}/>
          </>}
        </Section>}

        {/* NOTES */}
        {plan.notes&&<Section title="Notes & Plans">
          <p style={{fontSize:12,color:T.textMid,fontFamily:FONT_LABEL,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{plan.notes}</p>
        </Section>}

        {!results.length&&<Empty T={T} msg="Enable at least one income source or asset to see outcomes."/>}

      </Card>
    </div>
  );
}

// v2.3 Phase 3 — Numbered tabs, Summary tab, notes height, big ticket one-line totals
