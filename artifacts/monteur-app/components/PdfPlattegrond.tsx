import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { STATUSKLEUREN, TYPEN } from "@/constants/spots";

export type PlattegrondSpot = {
  id: number;
  objectnummer: string;
  type: string;
  status: string;
  locatie_x: number | null;
  locatie_y: number | null;
};

type Props = {
  plattegrondUrl: string | null | undefined;
  spots: PlattegrondSpot[];
  plaatsModus: boolean;
  token: string;
  domein: string;
  onTap: (x: number, y: number) => void;
  onSpot: (id: number) => void;
};

const TYPE_KLEUREN: Record<string, { kleur: string }> = Object.fromEntries(
  Object.entries(TYPEN).map(([k, v]) => [k, { kleur: v.kleur }]),
);

function bouwHtml(domein: string, token: string, url: string | null): string {
  const cfg = {
    domein: `https://${domein}`,
    token,
    url,
    typen: TYPE_KLEUREN,
    status: STATUSKLEUREN,
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
  var placeMode = false;
  var stage = document.getElementById('stage');
  var wrap = document.getElementById('wrap');
  var crosshair = document.getElementById('crosshair');
  var msg = document.getElementById('msg');
  var pageW = 0, pageH = 0, scale = 1, tx = 0, ty = 0, rendered = false;
  var MINS = 0.15, MAXS = 10;

  function post(o){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function apply(){ wrap.style.transform = 'translate('+tx+'px,'+ty+'px) scale('+scale+')'; wrap.style.setProperty('--inv', 1/scale); }

  function renderMarkers(){
    var olds = wrap.querySelectorAll('.mk');
    for (var i=0;i<olds.length;i++) olds[i].remove();
    spots.forEach(function(s){
      if (s.locatie_x==null||s.locatie_y==null) return;
      var el=document.createElement('div');
      el.className='mk';
      var t=CFG.typen[s.type]||{kleur:'#94a3b8'};
      el.style.background=CFG.status[s.status]||'#94a3b8';
      el.style.left=s.locatie_x+'px';
      el.style.top=s.locatie_y+'px';
      var ring=document.createElement('div');
      ring.className='ring';
      ring.style.background=t.kleur;
      el.appendChild(ring);
      var lab=document.createElement('span');
      var nr=String(s.objectnummer||'');
      var m=nr.match(/(\d+)$/);
      lab.textContent=m?m[1]:nr;
      el.appendChild(lab);
      (function(id){ el.addEventListener('click',function(ev){ ev.stopPropagation(); post({type:'spot',id:id}); }); })(s.id);
      wrap.appendChild(el);
    });
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
        rendered=true; msg.style.display='none'; renderMarkers(); fit();
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
    if (e.touches.length===0){ panning=false; pinching=false; crosshair.style.display='none'; }
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
  plaatsModus,
  token,
  domein,
  onTap,
  onSpot,
}: Props) {
  const webRef = useRef<WebView>(null);
  const [klaar, setKlaar] = useState(false);

  const html = useMemo(
    () => bouwHtml(domein, token, plattegrondUrl ?? null),
    [domein, token, plattegrondUrl],
  );

  useEffect(() => {
    if (!klaar) return;
    webRef.current?.injectJavaScript(
      `window.__setSpots && window.__setSpots(${JSON.stringify(JSON.stringify(spots))}); true;`,
    );
  }, [spots, klaar]);

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
      };
      if (m.type === "tap" && m.x != null && m.y != null) onTap(m.x, m.y);
      else if (m.type === "spot" && m.id != null) onSpot(m.id);
    } catch {
      // negeren
    }
  };

  return (
    <View style={styles.vlak}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html }}
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
