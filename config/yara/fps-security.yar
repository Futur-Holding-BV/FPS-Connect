// FPS Connect — YARA Security Rules
// Detecteert ransomware-indicatoren, bekende malwarekenmerken en verdachte patronen

rule RansomwareNoteKeywords {
  meta:
    description = "Ransomware losgeldbrief patronen"
    severity = "kritiek"
  strings:
    $r1 = "YOUR FILES HAVE BEEN ENCRYPTED" nocase
    $r2 = "your files are encrypted" nocase
    $r3 = "DECRYPT_INSTRUCTIONS" nocase
    $r4 = "pay the ransom" nocase
    $r5 = "bitcoin address" nocase
    $r6 = "All your files" nocase
    $r7 = "restore your files" nocase wide ascii
    $r8 = ".onion" nocase
    $r9 = "decryption key" nocase
    $r10 = "README_FOR_DECRYPT" nocase
  condition:
    3 of them
}

rule SuspiciousPowerShell {
  meta:
    description = "Verdachte PowerShell-commando's"
    severity = "hoog"
  strings:
    $ps1 = "powershell" nocase
    $ps2 = "-EncodedCommand" nocase
    $ps3 = "Invoke-Expression" nocase
    $ps4 = "IEX(" nocase
    $ps5 = "DownloadString" nocase
    $ps6 = "DownloadFile" nocase
    $ps7 = "Net.WebClient" nocase
    $ps8 = "bypass" nocase
    $enc = /[A-Za-z0-9+\/]{100,}={0,2}/
  condition:
    ($ps1 and 2 of ($ps2,$ps3,$ps4,$ps5,$ps6,$ps7,$ps8)) or
    ($ps1 and $enc)
}

rule EmbeddedExecutable {
  meta:
    description = "Ingesloten uitvoerbaar bestand"
    severity = "kritiek"
  strings:
    $mz = { 4D 5A }
    $elf = { 7F 45 4C 46 }
    $pe = { 50 45 00 00 }
  condition:
    ($mz at 0) or ($elf at 0) or
    ((@mz[2] < filesize) and @pe[1] > 0)
}

rule SuspiciousMacroKeywords {
  meta:
    description = "Verdachte VBA-macro patronen"
    severity = "hoog"
  strings:
    $m1 = "AutoOpen" nocase
    $m2 = "AutoExec" nocase
    $m3 = "Document_Open" nocase
    $m4 = "Shell(" nocase
    $m5 = "WScript.Shell" nocase
    $m6 = "CreateObject" nocase
    $m7 = "cmd.exe" nocase
    $m8 = "Environ(" nocase
    $m9 = "FSO.OpenTextFile" nocase
  condition:
    2 of them
}

rule PhishingIndicators {
  meta:
    description = "Phishing-indicatoren in documenten"
    severity = "midden"
  strings:
    $p1 = "Enable Content" nocase
    $p2 = "Enable Macros" nocase
    $p3 = "Enable Editing" nocase
    $p4 = "your account has been suspended" nocase
    $p5 = "verify your account" nocase
    $p6 = "update your payment" nocase
    $p7 = "click here to unlock" nocase
  condition:
    2 of them
}

rule SuspiciousWebShell {
  meta:
    description = "Webshell-patronen in uploads"
    severity = "kritiek"
  strings:
    $w1 = "eval(base64_decode" nocase
    $w2 = "system($_" nocase
    $w3 = "exec($_" nocase
    $w4 = "passthru($_" nocase
    $w5 = "<?php" nocase
    $w6 = "base64_decode" nocase
    $w7 = "shell_exec" nocase
  condition:
    ($w5 and 1 of ($w1,$w2,$w3,$w4,$w7)) or
    (2 of ($w1,$w2,$w3,$w4,$w7))
}

rule MimeTypeMismatch {
  meta:
    description = "JPEG header met verdachte inhoud"
    severity = "midden"
  strings:
    $jpg = { FF D8 FF }
    $php = "<?php" nocase
    $asp = "<%@" nocase
  condition:
    $jpg at 0 and (1 of ($php, $asp))
}
