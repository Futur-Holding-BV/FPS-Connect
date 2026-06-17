import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { STATUSKLEUREN, TYPEN } from "@/constants/spots";

export type PlattegrondSpot = {
  id: number;
  objectnummer: string;
  type: string;
  status: string;
  wand_of_plafond?: string | null;
  locatie_x: number | null;
  locatie_y: number | null;
  cluster_id?: number | null;
};

export type PlattegrondScheiding = {
  id: number;
  type: string;
  waarde?: string | null;
  kleur?: string | null;
  punten: string;
};

export type PlattegrondCluster = {
  id: number;
  naam: string;
  kleur?: string | null;
  monteur_naam?: string | null;
  voorbereid_aantal?: number | null;
};

type Props = {
  plattegrondUrl: string | null | undefined;
  spots: PlattegrondSpot[];
  scheidingen: PlattegrondScheiding[];
  clusters?: PlattegrondCluster[];
  plaatsModus: boolean;
  token: string;
  domein: string;
  onTap: (x: number, y: number) => void;
  onSpot: (id: number) => void;
  onCluster: (id: number) => void;
  onGroep: (ids: number[]) => void;
};

const TYPE_KLEUREN: Record<string, { kleur: string }> = Object.fromEntries(
  Object.entries(TYPEN).map(([k, v]) => [k, { kleur: v.kleur }]),
);

const STANDAARD_CLUSTERKLEUR = "#6366f1";

function bouwHtml(domein: string, token: string, url: string | null): string {
  const cfg = {
    domein: `https://${domein}`,
    token,
    url,
    typen: TYPE_KLEUREN,
    status: STATUSKLEUREN,
    scheidingTypen: { brand: { kleur: "#dc2626" }, rook: { kleur: "#2563eb" } },
    standaardClusterKleur: STANDAARD_CLUSTERKLEUR,
    visueelClusterPx: 42,
  };
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
  html,body { height:100%; width:100%; background:#2b303b; overflow:hidden; font-family:-apple-system,system-ui,sans-serif; }
  #stage { position:absolute; inset:0; overflow:hidden; touch-action:none; }
  #wrap { position:absolute; top:0; left:0; transform-origin:0 0; }
  canvas { display:block; }
  .mk { position:absolute; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        color:#fff; font-size:12px; font-weight:700; border:2.5px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,.45);
        transform:translate(-50%,-50%) scale(var(--inv,1)); }
  .mk .ring { position:absolute; inset:-7px; border-radius:50%; opacity:.3; z-index:-1; }
  .cb { position:absolute; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        color:#fff; font-size:15px; font-weight:800; background:#1e293b; border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,.5);
        transform:translate(-50%,-50%) scale(var(--inv,1)); }
  .env { position:absolute; pointer-events:none; }
  .env.tapbaar { pointer-events:auto; cursor:pointer; }
  .clbl { transform-origin:left bottom; transform:translateY(-100%) scale(var(--inv,1)); }
  .clbl-naam { display:inline-block; color:#fff; font-size:13px; font-weight:700;
        padding:2px 8px; border-radius:11px; white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,.4); }
  .clbl-status { display:inline-block; margin-top:2px; background:#fff; font-size:11px; font-weight:600;
        padding:2px 8px; border-radius:9px; white-space:nowrap; border:1px solid #94a3b8; box-shadow:0 1px 3px rgba(0,0,0,.3); }
  .mk .arrow { position:absolute; left:50%; top:50%; width:52px; height:52px; transform:translate(-50%,-50%); overflow:visible; pointer-events:none; z-index:1; }
  .mk span { position:relative; z-index:2; }
  .placing .mk { pointer-events:none; }
  #msg { position:absolute; top:50%; left:0; right:0; text-align:center; color:#cbd5e1; font-size:16px;
         transform:translateY(-50%); padding:24px; line-height:1.5; }
  #crosshair {
    position:absolute; pointer-events:none; display:none;
    width:44px; height:44px; transform:translate(-50%,-50%);
  }
  #crosshair::before, #crosshair::after {
    content:''; position:absolute; background:#F23B0D;
  }
  #crosshair::before { width:2px; height:100%; left:50%; top:0; transform:translateX(-50%); }
  #crosshair::after  { height:2px; width:100%; top:50%; left:0; transform:translateY(-50%); }
  #crosshair .ring2 {
    position:absolute; inset:8px; border-radius:50%;
    border:2px solid #F23B0D; opacity:.8;
  }
  .placing #stage { cursor:crosshair; }
</style>
</head>
<body>
<div id="stage"><div id="wrap"></div><div id="crosshair"><div class="ring2"></div></div></div>
<div id="msg">Plattegrond laden\u2026</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
(function(){
  var CFG = ${JSON.stringify(cfg)};
  var spots = [];
  var scheidingen = [];
  var clusters = [];
  var placeMode = false;
  var stage = document.getElementById('stage');
  var wrap = document.getElementById('wrap');
  var crosshair = document.getElementById('crosshair');
  var msg = document.getElementById('msg');
  var pageW = 0, pageH = 0, scale = 1, tx = 0, ty = 0, rendered = false;
  var linesEl = null;
  var MINS = 0.15, MAXS = 10;

  function post(o){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function apply(){ wrap.style.transform = 'translate('+tx+'px,'+ty+'px) scale('+scale+')'; wrap.style.setProperty('--inv', 1/scale); }

  function maakVisueleGroepen(lijst, drempel){
    var groepen=[], gebruikt={}, i, j;
    for (i=0;i<lijst.length;i++){
      if (gebruikt[lijst[i].id]) continue;
      var groep=[lijst[i]]; gebruikt[lijst[i].id]=1;
      for (j=i+1;j<lijst.length;j++){
        if (gebruikt[lijst[j].id]) continue;
        var dichtbij=false;
        for (var k=0;k<groep.length;k++){
          if (Math.hypot(groep[k].locatie_x-lijst[j].locatie_x, groep[k].locatie_y-lijst[j].locatie_y)<=drempel){ dichtbij=true; break; }
        }
        if (dichtbij){ groep.push(lijst[j]); gebruikt[lijst[j].id]=1; }
      }
      groepen.push(groep);
    }
    return groepen;
  }

  function groepCentroid(groep){
    var sx=0, sy=0;
    for (var i=0;i<groep.length;i++){ sx+=groep[i].locatie_x; sy+=groep[i].locatie_y; }
    return {x:sx/groep.length, y:sy/groep.length};
  }

  function maakSpotEl(s){
    var el=document.createElement('div');
    el.className='mk';
    var t=CFG.typen[s.type]||{kleur:'#94a3b8'};
    el.style.background=CFG.status[s.status]||'#94a3b8';
    if (s.status==='voorbereid'){ el.style.border='2.5px dashed #475569'; el.style.color='#1e293b'; }
    el.style.left=s.locatie_x+'px';
    el.style.top=s.locatie_y+'px';
    var ring=document.createElement('div');
    ring.className='ring';
    ring.style.background=t.kleur;
    el.appendChild(ring);
    if ((s.wand_of_plafond||'')==='plafond'){
      var arr=document.createElement('div');
      arr.className='arrow';
      arr.innerHTML='<svg width="52" height="52" viewBox="-26 -26 52 52" style="overflow:visible"><line x1="0" y1="-26" x2="0" y2="26" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="0" y1="-26" x2="0" y2="26" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/><polygon points="0,-29 -6,-19 6,-19" fill="#1e293b" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><polygon points="0,29 -6,19 6,19" fill="#1e293b" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
      el.appendChild(arr);
    }
    var lab=document.createElement('span');
    var nr=String(s.objectnummer||'');
    var m=nr.match(/(\\d+)$/);
    lab.textContent=m?m[1]:nr;
    el.appendChild(lab);
    (function(id){ el.addEventListener('click',function(ev){ ev.stopPropagation(); post({type:'spot',id:id}); }); })(s.id);
    return el;
  }

  function renderEnvelopes(){
    var olds=wrap.querySelectorAll('.env');
    for (var i=0;i<olds.length;i++) olds[i].remove();
    if (!clusters.length) return;
    clusters.forEach(function(c){
      var leden=spots.filter(function(s){ return s.cluster_id===c.id && s.locatie_x!=null && s.locatie_y!=null; });
      if (!leden.length) return;
      var xs=leden.map(function(l){return l.locatie_x;});
      var ys=leden.map(function(l){return l.locatie_y;});
      var marge=26;
      var minX=Math.min.apply(null,xs)-marge, minY=Math.min.apply(null,ys)-marge;
      var maxX=Math.max.apply(null,xs)+marge, maxY=Math.max.apply(null,ys)+marge;
      var kleur=veiligeKleur(c.kleur, CFG.standaardClusterKleur);
      var env=document.createElement('div');
      env.className='env tapbaar';
      env.style.left=minX+'px'; env.style.top=minY+'px';
      env.style.width=(maxX-minX)+'px'; env.style.height=(maxY-minY)+'px';
      env.style.border='2px dashed '+kleur; env.style.borderRadius='20px';
      env.style.background=kleur+'14';
      (function(id){ env.addEventListener('click',function(ev){ if(placeMode) return; ev.stopPropagation(); post({type:'cluster',id:id}); }); })(c.id);
      wrap.insertBefore(env, wrap.firstChild.nextSibling);

      // Naamlabel + statusregel (toegewezen monteur / "n voorbereid"), gelijk aan
      // de web-plattegrond zodat de planning dit direct in het veld ziet.
      var voorbereid=Number(c.voorbereid_aantal)||0;
      var monteurNaam=(typeof c.monteur_naam==='string'&&c.monteur_naam)?c.monteur_naam:null;
      var monteurTekst=monteurNaam||'Niet toegewezen';
      var statusTekst=voorbereid>0?(monteurTekst+' \u00b7 '+voorbereid+' voorbereid'):monteurTekst;
      var lbl=document.createElement('div');
      lbl.className='env clbl tapbaar';
      lbl.style.left=minX+'px'; lbl.style.top=minY+'px';
      lbl.innerHTML=
        '<div class="clbl-naam" style="background:'+kleur+'">'+esc(c.naam)+'</div>'+
        '<div class="clbl-status" style="border-color:'+kleur+';color:'+(monteurNaam?'#1e293b':'#64748b')+'">'+esc(statusTekst)+'</div>';
      (function(id){ lbl.addEventListener('click',function(ev){ if(placeMode) return; ev.stopPropagation(); post({type:'cluster',id:id}); }); })(c.id);
      wrap.insertBefore(lbl, wrap.firstChild.nextSibling);
    });
  }

  function renderMarkers(){
    var olds = wrap.querySelectorAll('.mk, .cb');
    for (var i=0;i<olds.length;i++) olds[i].remove();
    renderEnvelopes();
    var geplaatst = spots.filter(function(s){ return s.locatie_x!=null && s.locatie_y!=null; });
    var drempel = scale>0 ? (CFG.visueelClusterPx/scale) : CFG.visueelClusterPx;
    var groepen = maakVisueleGroepen(geplaatst, drempel);
    groepen.forEach(function(groep){
      if (groep.length===1){ wrap.appendChild(maakSpotEl(groep[0])); return; }
      var c=groepCentroid(groep);
      var b=document.createElement('div');
      b.className='cb';
      b.style.left=c.x+'px'; b.style.top=c.y+'px';
      b.textContent=String(groep.length);
      (function(groep){
        var ids=groep.map(function(g){ return g.id; });
        b.addEventListener('click',function(ev){ ev.stopPropagation(); post({type:'groep',ids:ids}); });
      })(groep);
      wrap.appendChild(b);
    });
  }

  function esc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function veiligeKleur(k, fallback){ return (typeof k==='string' && /^#[0-9a-fA-F]{3,8}$/.test(k)) ? k : fallback; }

  function markerPosities(punten, stap){
    if (punten.length<2) return punten.slice();
    var segLengtes=[], totaal=0, i;
    for (i=1;i<punten.length;i++){
      var len=Math.hypot(punten[i].x-punten[i-1].x, punten[i].y-punten[i-1].y);
      segLengtes.push(len); totaal+=len;
    }
    if (totaal===0) return [{x:punten[0].x,y:punten[0].y}];
    var tussen=Math.min(8,Math.max(1,Math.round(totaal/stap)));
    var afstanden=[0];
    for (i=1;i<=tussen;i++) afstanden.push((totaal*i)/(tussen+1));
    afstanden.push(totaal);
    return afstanden.map(function(d){
      var rest=d, j;
      for (j=0;j<segLengtes.length;j++){
        var l=segLengtes[j];
        if (rest<=l || j===segLengtes.length-1){
          var t=l===0?0:Math.min(1,rest/l);
          var a=punten[j], b=punten[j+1];
          return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t};
        }
        rest-=l;
      }
      var last=punten[punten.length-1];
      return {x:last.x,y:last.y};
    });
  }

  function renderScheidingen(){
    if (!linesEl) return;
    var parts=[];
    scheidingen.forEach(function(s){
      var ruw=[];
      try { ruw=JSON.parse(s.punten); } catch(e){ ruw=[]; }
      if (!ruw || !ruw.length) return;
      var punten=[];
      for (var pi=0;pi<ruw.length;pi++){
        var px=Number(ruw[pi]&&ruw[pi].x), py=Number(ruw[pi]&&ruw[pi].y);
        if (isFinite(px)&&isFinite(py)) punten.push({x:px,y:py});
      }
      if (punten.length<2) return;
      var st=CFG.scheidingTypen[s.type];
      var kleur=veiligeKleur(s.kleur, (st&&st.kleur) || '#dc2626');
      var puntenStr=punten.map(function(p){ return p.x+','+p.y; }).join(' ');
      var dash=s.type==='rook' ? ' stroke-dasharray="12 8"' : '';
      parts.push('<polyline points="'+puntenStr+'" fill="none" stroke="'+kleur+'" stroke-width="4"'+dash+' stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />');
      if (s.waarde){
        var markers=markerPosities(punten, Math.max(pageW,pageH)/4.6);
        var wlen=String(s.waarde).length;
        var fs=wlen>=6?8:(wlen>=5?9.5:11);
        markers.forEach(function(m){
          parts.push('<g transform="translate('+m.x+','+m.y+')"><circle r="18" fill="#fff" stroke="'+kleur+'" stroke-width="3" /><text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="'+fs+'" font-weight="800" fill="'+kleur+'">'+esc(s.waarde)+'</text></g>');
        });
      }
    });
    linesEl.innerHTML='<svg width="'+pageW+'" height="'+pageH+'" viewBox="0 0 '+pageW+' '+pageH+'" style="position:absolute;top:0;left:0;overflow:visible">'+parts.join('')+'</svg>';
  }

  function fit(){
    var sw=stage.clientWidth, sh=stage.clientHeight;
    var s=Math.min(sw/pageW,sh/pageH);
    if (!isFinite(s)||s<=0) s=1;
    scale=s; tx=(sw-pageW*scale)/2; ty=(sh-pageH*scale)/2; apply();
  }

  function loadPdf(){
    if (!CFG.url){ msg.textContent='Geen plattegrond geüpload voor deze verdieping.'; return; }
    if (typeof pdfjsLib==='undefined'){ msg.textContent='PDF-viewer kon niet laden (geen verbinding?).'; return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    fetch(CFG.domein+'/api/storage'+CFG.url,{headers:{Authorization:'Bearer '+CFG.token}})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.arrayBuffer(); })
      .then(function(buf){ return pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise; })
      .then(function(pdf){ return pdf.getPage(1); })
      .then(function(page){
        var vp=page.getViewport({scale:2});
        pageW=Math.ceil(vp.width); pageH=Math.ceil(vp.height);
        var canvas=document.createElement('canvas');
        canvas.width=pageW; canvas.height=pageH;
        wrap.style.width=pageW+'px'; wrap.style.height=pageH+'px';
        wrap.insertBefore(canvas,wrap.firstChild);
        var ctx=canvas.getContext('2d');
        return page.render({canvasContext:ctx,viewport:vp,canvas:canvas}).promise;
      })
      .then(function(){
        rendered=true; msg.style.display='none';
        if (!linesEl){
          linesEl=document.createElement('div');
          linesEl.style.position='absolute'; linesEl.style.top='0'; linesEl.style.left='0';
          linesEl.style.width=pageW+'px'; linesEl.style.height=pageH+'px'; linesEl.style.pointerEvents='none';
          wrap.appendChild(linesEl);
        }
        renderScheidingen(); renderMarkers(); fit();
        post({type:'ready',w:pageW,h:pageH});
      })
      .catch(function(e){
        msg.textContent='Plattegrond kon niet geladen worden.';
        post({type:'error',message:String(e)});
      });
  }

  // --- Gestures ---
  var panning=false, moved=0, startX=0, startY=0, startTx=0, startTy=0, downT=0;
  var startD=0, startScale=1, midX=0, midY=0, midIx=0, midIy=0, pinching=false;

  function dist(a,b){ var dx=a.x-b.x,dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

  function updateCrosshair(cx, cy){
    if (!placeMode||!rendered){ crosshair.style.display='none'; return; }
    crosshair.style.display='block';
    crosshair.style.left=cx+'px';
    crosshair.style.top=cy+'px';
  }

  stage.addEventListener('touchstart',function(e){
    e.preventDefault();
    if (e.touches.length===1){
      panning=true; pinching=false; moved=0;
      startX=e.touches[0].clientX; startY=e.touches[0].clientY;
      startTx=tx; startTy=ty; downT=Date.now();
      // Crosshair bij eerste aanraking
      var rect=stage.getBoundingClientRect();
      updateCrosshair(e.touches[0].clientX-rect.left, e.touches[0].clientY-rect.top);
    } else if (e.touches.length===2){
      panning=false; pinching=true; downT=0; // reset: geen tap na pinch
      crosshair.style.display='none';
      var a={x:e.touches[0].clientX,y:e.touches[0].clientY};
      var b={x:e.touches[1].clientX,y:e.touches[1].clientY};
      startD=dist(a,b); startScale=scale;
      var rect=stage.getBoundingClientRect();
      midX=(a.x+b.x)/2-rect.left; midY=(a.y+b.y)/2-rect.top;
      midIx=(midX-tx)/scale; midIy=(midY-ty)/scale;
    }
  },{passive:false});

  stage.addEventListener('touchmove',function(e){
    e.preventDefault();
    if (e.touches.length===1&&panning&&!pinching){
      var dx=e.touches[0].clientX-startX, dy=e.touches[0].clientY-startY;
      moved=Math.max(moved,Math.abs(dx)+Math.abs(dy));
      tx=startTx+dx; ty=startTy+dy; apply();
      // Crosshair volgt vinger
      var rect=stage.getBoundingClientRect();
      updateCrosshair(e.touches[0].clientX-rect.left, e.touches[0].clientY-rect.top);
    } else if (e.touches.length===2){
      var a={x:e.touches[0].clientX,y:e.touches[0].clientY};
      var b={x:e.touches[1].clientX,y:e.touches[1].clientY};
      var ns=Math.min(MAXS,Math.max(MINS,startScale*(dist(a,b)/startD)));
      scale=ns; tx=midX-midIx*scale; ty=midY-midIy*scale; apply();
    }
  },{passive:false});

  stage.addEventListener('touchend',function(e){
    if (!pinching&&panning&&e.touches.length===0){
      var dt=Date.now()-downT;
      if (moved<12&&dt>0&&dt<380){
        var t=e.changedTouches[0];
        var rect=stage.getBoundingClientRect();
        var ix=(t.clientX-rect.left-tx)/scale;
        var iy=(t.clientY-rect.top-ty)/scale;
        crosshair.style.display='none';
        if (placeMode&&rendered&&ix>=0&&iy>=0&&ix<=pageW&&iy<=pageH){
          post({type:'tap',x:Math.round(ix),y:Math.round(iy)});
        }
      }
    }
    if (e.touches.length===0){
      // Na een pinch opnieuw clusteren op de nieuwe schaal.
      if (pinching && rendered) renderMarkers();
      panning=false; pinching=false; crosshair.style.display='none';
    }
    // Bij loslaten van 1 vinger tijdens pinch: geen tap triggeren
    if (e.touches.length===1&&pinching){ downT=0; }
  });

  window.__setPlace=function(v){
    placeMode=!!v;
    if (v) document.body.classList.add('placing');
    else { document.body.classList.remove('placing'); crosshair.style.display='none'; }
    wrap.classList.toggle('placing',!!v);
  };
  window.__setSpots=function(json){ try{spots=JSON.parse(json);}catch(e){spots=[];} if(rendered) renderMarkers(); };
  window.__setScheidingen=function(json){ try{scheidingen=JSON.parse(json);}catch(e){scheidingen=[];} if(rendered) renderScheidingen(); };
  window.__setClusters=function(json){ try{clusters=JSON.parse(json);}catch(e){clusters=[];} if(rendered) renderMarkers(); };
  window.__fit=function(){ if(rendered) fit(); };

  loadPdf();
})();
</script>
</body>
</html>`;
}

export function PdfPlattegrond({
  plattegrondUrl,
  spots,
  scheidingen,
  clusters,
  plaatsModus,
  token,
  domein,
  onTap,
  onSpot,
  onCluster,
  onGroep,
}: Props) {
  const webRef = useRef<WebView>(null);
  const [klaar, setKlaar] = useState(false);

  const html = useMemo(
    () => bouwHtml(domein, token, plattegrondUrl ?? null),
    [domein, token, plattegrondUrl],
  );

  // Reset 'klaar' zodra de HTML verandert (nieuw token, nieuw plattegrond-URL
  // of nieuw domein). De WebView herlaadt dan de HTML opnieuw, en de data-
  // injectie (spots/scheidingen/clusters) herstart na de nieuwe onLoadEnd.
  useEffect(() => {
    setKlaar(false);
  }, [html]);

  useEffect(() => {
    if (!klaar) return;
    webRef.current?.injectJavaScript(
      `window.__setSpots && window.__setSpots(${JSON.stringify(JSON.stringify(spots))}); true;`,
    );
  }, [spots, klaar]);

  useEffect(() => {
    if (!klaar) return;
    webRef.current?.injectJavaScript(
      `window.__setScheidingen && window.__setScheidingen(${JSON.stringify(JSON.stringify(scheidingen))}); true;`,
    );
  }, [scheidingen, klaar]);

  useEffect(() => {
    if (!klaar) return;
    webRef.current?.injectJavaScript(
      `window.__setClusters && window.__setClusters(${JSON.stringify(JSON.stringify(clusters ?? []))}); true;`,
    );
  }, [clusters, klaar]);

  useEffect(() => {
    if (!klaar) return;
    webRef.current?.injectJavaScript(
      `window.__setPlace && window.__setPlace(${plaatsModus ? "true" : "false"}); true;`,
    );
  }, [plaatsModus, klaar]);

  const opBericht = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as {
        type: string;
        x?: number;
        y?: number;
        id?: number;
        ids?: number[];
      };
      if (m.type === "tap" && m.x != null && m.y != null) onTap(m.x, m.y);
      else if (m.type === "spot" && m.id != null) onSpot(m.id);
      else if (m.type === "cluster" && m.id != null) onCluster(m.id);
      else if (m.type === "groep" && Array.isArray(m.ids)) onGroep(m.ids);
    } catch {
      // negeren
    }
  };

  return (
    <View style={styles.vlak}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: `https://${domein}` }}
        onMessage={opBericht}
        onLoadEnd={() => setKlaar(true)}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        mixedContentMode="always"
        style={styles.vlak}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  vlak: { flex: 1, backgroundColor: "#2b303b" },
});
