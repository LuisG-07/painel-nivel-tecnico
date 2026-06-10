# SkillMatrix Pro — servidor local com proxy Zendesk
# Uso: clique com botao direito → Executar com PowerShell

$port = 8080
$root = $PSScriptRoot

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")

try { $listener.Start() }
catch {
    Write-Host "Porta $port ocupada. Feche outras instancias e tente novamente." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit
}

$url = "http://localhost:$port/index.html"
Write-Host ""
Write-Host "  SkillMatrix Pro: $url" -ForegroundColor Green
Write-Host "  Proxy Zendesk ativo em /zdproxy/" -ForegroundColor Cyan
Write-Host "  Pressione Ctrl+C para parar." -ForegroundColor Gray
Write-Host ""

Start-Process $url

$mimeMap = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

while ($listener.IsListening) {
    try {
        $ctx  = $listener.GetContext()
        $req  = $ctx.Request
        $resp = $ctx.Response

        $resp.Headers.Add('Access-Control-Allow-Origin', '*')
        $resp.Headers.Add('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        $resp.Headers.Add('X-Frame-Options', 'DENY')
        $resp.Headers.Add('X-Content-Type-Options', 'nosniff')
        $resp.Headers.Add('Content-Security-Policy', "frame-ancestors 'none'")

        $localPath = $req.Url.LocalPath.TrimStart('/')

        # --- Proxy Zendesk ---
        # URL format: /zdproxy/{subdomain}/api/v2/...
        if ($localPath.StartsWith('zdproxy/')) {
            $rest      = $localPath.Substring('zdproxy/'.Length)   # "{subdomain}/api/v2/..."
            $slashIdx  = $rest.IndexOf('/')
            if ($slashIdx -lt 1) {
                $resp.StatusCode = 400
                $resp.OutputStream.Close()
                continue
            }
            $subdomain = $rest.Substring(0, $slashIdx)
            $apiPath   = $rest.Substring($slashIdx)                # "/api/v2/..."
            $query     = if ($req.Url.Query) { $req.Url.Query } else { '' }

            # Validate subdomain — alphanumeric + hyphens only
            if ($subdomain -notmatch '^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]?$') {
                $resp.StatusCode = 400
                $resp.OutputStream.Close()
                continue
            }

            $zdUrl = 'https://' + $subdomain + '.zendesk.com' + $apiPath + $query

            try {
                $wc = [System.Net.WebClient]::new()
                $wc.Headers.Add('Authorization', $req.Headers['Authorization'])
                $wc.Headers.Add('Content-Type', 'application/json')
                $bytes = $wc.DownloadData($zdUrl)
                $resp.ContentType     = 'application/json; charset=utf-8'
                $resp.ContentLength64 = $bytes.Length
                $resp.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch [System.Net.WebException] {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $resp.StatusCode = $statusCode
                $errMsg  = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Zendesk HTTP ' + $statusCode + '"}')
                $resp.ContentType = 'application/json'
                $resp.ContentLength64 = $errMsg.Length
                $resp.OutputStream.Write($errMsg, 0, $errMsg.Length)
            }
            $resp.OutputStream.Close()
            continue
        }

        # --- Arquivos estáticos ---
        if ($localPath -eq '') { $localPath = 'index.html' }
        $filePath = Join-Path $root $localPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext   = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime  = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $resp.ContentType     = $mime
            $resp.ContentLength64 = $bytes.Length
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $resp.StatusCode = 404
        }

        $resp.OutputStream.Close()
    } catch { }
}
