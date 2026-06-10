import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

function bouwHtml(domein: string, token: string, url: string): string {
  const cfg = { domein: `https://${domein}`, token, url };
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { background:#2b303b; font-family:-apple-system,system-ui,sans-serif; }
  #msg { color:#cbd5e1; font-size:15px; text-align:center; padding:40px 24px; line-height:1.5; }
  #pages { display:flex; flex-direction:column; align-items:center; gap:12px; padding:12px; }
  #pages canvas, #pages img { max-width:100%; height:auto; border-radius:6px; background:#fff;
    box-shadow:0 2px 8px rgba(0,0,0,.35); }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
<div id="msg">Document laden\u2026</div>
<div id="pages"></div>
<script>
(function(){
  var CFG = ${JSON.stringify(cfg)};
  var msg = document.getElementById('msg');
  var pages = document.getElementById('pages');
  function post(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  var ext = (String(CFG.url).split('?')[0].split('.').pop()||'').toLowerCase();
  var isImg = ['jpg','jpeg','png','webp','gif','bmp'].indexOf(ext) >= 0;

  function showImage(buf){
    var url = URL.createObjectURL(new Blob([buf]));
    var img = document.createElement('img');
    img.src = url;
    pages.appendChild(img);
    return Promise.resolve();
  }
  function showPdf(buf){
    if (typeof pdfjsLib === 'undefined') throw new Error('pdfjs niet geladen');
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise.then(function(pdf){
      var chain = Promise.resolve();
      for (var i=1; i<=pdf.numPages; i++){
        (function(n){
          chain = chain.then(function(){
            return pdf.getPage(n).then(function(page){
              var vp = page.getViewport({scale:2});
              var canvas = document.createElement('canvas');
              canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
              pages.appendChild(canvas);
              var ctx = canvas.getContext('2d');
              return page.render({canvasContext:ctx,viewport:vp,canvas:canvas}).promise;
            });
          });
        })(i);
      }
      return chain;
    });
  }

  fetch(CFG.domein+'/api/storage'+CFG.url, { headers:{ Authorization:'Bearer '+CFG.token } })
    .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.arrayBuffer(); })
    .then(function(buf){ return isImg ? showImage(buf) : showPdf(buf); })
    .then(function(){ msg.style.display='none'; post({type:'ready'}); })
    .catch(function(e){ msg.textContent='Document kon niet geladen worden.'; post({type:'error',message:String(e)}); });
})();
</script>
</body>
</html>`;
}

export default function DocumentViewer() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { url, naam } = useLocalSearchParams<{
    tekeningId: string;
    url: string;
    naam: string;
  }>();

  const [bezig, setBezig] = useState(true);

  const html = useMemo(
    () => bouwHtml(DOMEIN, token ?? "", url ?? ""),
    [token, url],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#2b303b" }}>
      <View
        style={{
          backgroundColor: "rgba(33,38,49,0.96)",
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.primary, fontSize: 26, fontFamily: "Inter_700Bold" }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" }}
            numberOfLines={1}
          >
            {naam || "Document"}
          </Text>
          <Text style={{ color: "#9AA3B2", fontSize: 13, fontFamily: "Inter_400Regular" }}>
            Alleen-lezen · knijp om te zoomen
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={() => setBezig(false)}
          onLoadEnd={() => setBezig(false)}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          style={{ flex: 1, backgroundColor: "#2b303b" }}
        />
        {bezig && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
            pointerEvents="none"
          >
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        )}
      </View>
    </View>
  );
}
