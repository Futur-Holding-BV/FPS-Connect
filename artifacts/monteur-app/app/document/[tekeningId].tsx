import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const BEELD_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

// De data wordt in React Native opgehaald (met de sessie-token) en als data-URL
// aan de WebView doorgegeven. De token komt zo nooit in de WebView-HTML of bij
// het externe pdf.js-script terecht.
function bouwHtml(dataUrl: string, isBeeld: boolean): string {
  const cfg = { dataUrl, isBeeld };
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
  function klaar(){ msg.style.display='none'; post({type:'ready'}); }
  function fout(e){ msg.textContent='Document kon niet geladen worden.'; post({type:'error',message:String(e)}); }

  function toonBeeld(){
    var img = document.createElement('img');
    img.onload = klaar;
    img.onerror = function(){ fout('beeld'); };
    img.src = CFG.dataUrl;
    pages.appendChild(img);
  }

  function toonPdf(){
    if (typeof pdfjsLib === 'undefined') return fout('pdfjs niet geladen');
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var b64 = (CFG.dataUrl.split(',')[1] || '');
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
    pdfjsLib.getDocument({data:bytes}).promise.then(function(pdf){
      var chain = Promise.resolve();
      for (var n=1; n<=pdf.numPages; n++){
        (function(p){
          chain = chain.then(function(){
            return pdf.getPage(p).then(function(page){
              var vp = page.getViewport({scale:2});
              var canvas = document.createElement('canvas');
              canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
              pages.appendChild(canvas);
              return page.render({canvasContext:canvas.getContext('2d'),viewport:vp,canvas:canvas}).promise;
            });
          });
        })(n);
      }
      return chain;
    }).then(klaar).catch(fout);
  }

  if (CFG.isBeeld) toonBeeld(); else toonPdf();
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

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [fout, setFout] = useState(false);

  const isBeeld = useMemo(() => {
    const ext = ((url ?? "").split("?")[0].split(".").pop() ?? "").toLowerCase();
    return BEELD_EXT.includes(ext);
  }, [url]);

  useEffect(() => {
    let actief = true;
    setDataUrl(null);
    setFout(false);
    if (!url || !token) return;
    void (async () => {
      try {
        const res = await fetch(`https://${DOMEIN}/api/storage${url}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const blob = await res.blob();
        const d = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error("lezen mislukt"));
          fr.readAsDataURL(blob);
        });
        if (actief) setDataUrl(d);
      } catch {
        if (actief) setFout(true);
      }
    })();
    return () => {
      actief = false;
    };
  }, [url, token]);

  const html = useMemo(
    () => (dataUrl ? bouwHtml(dataUrl, isBeeld) : null),
    [dataUrl, isBeeld],
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
        {html ? (
          <WebView
            originWhitelist={["*"]}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            style={{ flex: 1, backgroundColor: "#2b303b" }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            {fout ? (
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 15,
                  textAlign: "center",
                  fontFamily: "Inter_400Regular",
                }}
              >
                Document kon niet geladen worden.
              </Text>
            ) : (
              <ActivityIndicator size="large" color={c.primary} />
            )}
          </View>
        )}
      </View>
    </View>
  );
}
