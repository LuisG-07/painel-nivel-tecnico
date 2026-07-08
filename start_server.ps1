# SkillMatrix Pro — servidor local com proxy Zendesk
# Uso: clique com botao direito -> Executar com PowerShell
# Porta 3000 por padrao (onde ficam salvos os dados). Para outra porta:
#   powershell -File start_server.ps1 -port 8080
param([int]$port = 3000)

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
Write-Host "  Proxy Zendesk ativo em /zdproxy/{subdomain}/..." -ForegroundColor Cyan
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
        # Uses RawUrl to preserve exact query-string encoding (cursor tokens, page params, etc.)
        if ($localPath.StartsWith('zdproxy/')) {
            $rawUrl = $req.RawUrl

            if ($rawUrl -match '^/zdproxy/([^/?]+)(/.+)$') {
                $subdomain   = $Matches[1]
                $apiAndQuery = $Matches[2]
            } else {
                $resp.StatusCode = 400
                $resp.OutputStream.Close()
                continue
            }

            if ($subdomain -notmatch '^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]?$') {
                $resp.StatusCode = 400
                $resp.OutputStream.Close()
                continue
            }

            $zdUrl = 'https://' + $subdomain + '.zendesk.com' + $apiAndQuery

            try {
                $wreq = [System.Net.HttpWebRequest]::Create($zdUrl)
                $wreq.Method  = 'GET'
                $wreq.Headers.Add('Authorization', $req.Headers['Authorization'])
                $wreq.Accept  = 'application/json'
                $wreq.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
                $wres   = $wreq.GetResponse()
                $stream = $wres.GetResponseStream()
                $ms     = [System.IO.MemoryStream]::new()
                $stream.CopyTo($ms)
                $stream.Close()
                $wres.Close()
                $bytes = $ms.ToArray()
                $resp.ContentType     = 'application/json; charset=utf-8'
                $resp.ContentLength64 = $bytes.Length
                $resp.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch [System.Net.WebException] {
                $wexResp    = $_.Exception.Response
                $statusCode = 502
                if ($wexResp) { $statusCode = [int]$wexResp.StatusCode }

                $errBody = '{"error":"Zendesk HTTP ' + $statusCode + '"}'
                if ($wexResp) {
                    try {
                        $es      = $wexResp.GetResponseStream()
                        $sr      = [System.IO.StreamReader]::new($es)
                        $rawBody = $sr.ReadToEnd()
                        $sr.Close()
                        if ($rawBody) { $errBody = $rawBody }
                    } catch {}
                }

                $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errBody)
                $resp.StatusCode      = $statusCode
                $resp.ContentType     = 'application/json'
                $resp.ContentLength64 = $errBytes.Length
                $resp.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $resp.OutputStream.Close()
            continue
        }

        # --- Arquivos estaticos ---
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
