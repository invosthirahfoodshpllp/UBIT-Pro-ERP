param(
    [int]$Port = 5173
)

$Directory = $PSScriptRoot
if (-not $Directory) { $Directory = (Get-Location).Path }

# Stop any existing ubit-server.exe or previous local-server
try {
    Get-Process ubit-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

$listener = $null
$portsToTry = @($Port, 5174, 8080, 8081, 3000)
$started = $false

foreach ($p in $portsToTry) {
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://localhost:$p/")
        $l.Prefixes.Add("http://127.0.0.1:$p/")
        $l.Start()
        $listener = $l
        $Port = $p
        $started = $true
        break
    } catch {
        if ($l) { try { $l.Close() } catch {} }
    }
}

if (-not $started) {
    Write-Host "[ERROR] Could not bind to local ports (5173, 5174, 8080, 8081, 3000)." -ForegroundColor Red
    exit 1
}

# Save active port
try {
    Set-Content -Path (Join-Path $Directory "active-port.txt") -Value $Port -Force
} catch {}

$prefix = "http://localhost:$Port/"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   Ubit Pro ERP - Local Server Engine" -ForegroundColor Green
Write-Host "   Access URL : $prefix" -ForegroundColor White
Write-Host "   Directory  : $Directory" -ForegroundColor DarkGray
Write-Host "   Status     : ONLINE (PowerShell Engine)" -ForegroundColor Yellow
Write-Host "   Note       : Keep this window minimized while working on ERP." -ForegroundColor DarkCyan
Write-Host "================================================================================" -ForegroundColor Cyan

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $stateObj = @($ctx, $Directory)
        [System.Threading.ThreadPool]::QueueUserWorkItem([System.Threading.WaitCallback]{
            param($state)
            $c = $state[0]
            $dir = $state[1]
            try {
                $req = $c.Request
                $res = $c.Response

                $origin = $req.Headers['Origin']
                if ($origin -and ($origin -eq 'null' -or $origin -like 'http://localhost:*' -or $origin -like 'http://127.0.0.1:*' -or $origin -like 'https://localhost:*' -or $origin -like 'https://127.0.0.1:*')) {
                    $res.AddHeader('Access-Control-Allow-Origin', $origin)
                    $res.AddHeader('Access-Control-Allow-Credentials', 'true')
                } else {
                    $res.AddHeader('Access-Control-Allow-Origin', "http://localhost:$Port")
                }
                $res.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
                $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Ubit-Auth')
                $res.AddHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
                $res.AddHeader('X-Frame-Options', 'SAMEORIGIN')
                $res.AddHeader('X-Content-Type-Options', 'nosniff')
                $res.AddHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
                $res.AddHeader('X-XSS-Protection', '1; mode=block')

                if ($req.HttpMethod -eq 'OPTIONS') {
                    $res.StatusCode = 204
                    $res.Close()
                    return
                }

                $path = $req.Url.LocalPath.TrimStart('/')
                if ($path -eq '' -or $path -eq '/') { $path = 'index.html' }
                $path = $path -replace '\.\.', ''

                # API Endpoint: System MAC (Hardware Identification)
                if ($req.HttpMethod -eq 'GET' -and ($path -eq 'api/system/mac' -or $path -eq 'api/system/device-mac')) {
                    $mac = ""
                    try {
                        $nics = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()
                        foreach ($nic in $nics) {
                            if ($nic.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and $nic.NetworkInterfaceType -ne [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback) {
                                $b = $nic.GetPhysicalAddress().GetAddressBytes()
                                if ($b.Length -gt 0) {
                                    $mac = ($b | ForEach-Object { $_.ToString("X2") }) -join ":"
                                    break
                                }
                            }
                        }
                    } catch {}
                    if (-not $mac) { $mac = "PC-" + $env:COMPUTERNAME }
                    $resp = "{`"success`":true,`"mac`":`"$mac`"}"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($resp)
                    $res.ContentType = 'application/json; charset=utf-8'
                    $res.ContentLength64 = $bytes.Length
                    $res.StatusCode = 200
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    $res.Close()
                    return
                }

                # API Endpoint: Secure Server Login
                if ($req.HttpMethod -eq 'POST' -and ($path -eq 'api/auth/login' -or $path -eq 'auth/login')) {
                    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $data = $body | ConvertFrom-Json
                    $sysPath = Join-Path $dir 'data\system.json'
                    if (Test-Path $sysPath) {
                        $sys = Get-Content $sysPath -Raw -Encoding UTF8 | ConvertFrom-Json
                        $u = $sys.users | Where-Object { $_.username.ToLower() -eq $data.username.ToLower().Trim() } | Select-Object -First 1
                        
                        $isPwdMatch = $false
                        if ($u -and $data.password) {
                            $sha = [System.Security.Cryptography.SHA256]::Create()
                            $saltBytes = [System.Text.Encoding]::UTF8.GetBytes("ubit_salt_2026_" + $data.password)
                            $curHash = "sha256:" + [System.BitConverter]::ToString($sha.ComputeHash($saltBytes)).Replace("-", "").ToLower()
                            if ($u.password -eq $curHash -or $u.password -eq $data.password) {
                                $isPwdMatch = $true
                            }
                        }

                        if ($isPwdMatch) {
                            if ($u.isRestricted) {
                                $errResp = '{"success":false,"error":"Access Suspended: Software usage has been restricted by Administrator."}'
                                $bytes = [System.Text.Encoding]::UTF8.GetBytes($errResp)
                                $res.ContentType = 'application/json; charset=utf-8'
                                $res.ContentLength64 = $bytes.Length
                                $res.StatusCode = 403
                                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                                $res.Close()
                                return
                            }

                            if ($data.mac -and $u.role -ne 'Admin' -and $u.username -ne 'Pradheep' -and $u.username -ne 'Hari') {
                                $u.activeMacId = $data.mac
                                $u.bondedMacId = $data.mac
                            }
                            $sys | ConvertTo-Json -Depth 10 | Set-Content $sysPath -Encoding UTF8

                            $uSafe = $u | Select-Object * -ExcludeProperty password
                            $respObj = @{ success = $true; user = $uSafe }
                            $resp = $respObj | ConvertTo-Json -Depth 10
                            $bytes = [System.Text.Encoding]::UTF8.GetBytes($resp)
                            $res.ContentType = 'application/json; charset=utf-8'
                            $res.ContentLength64 = $bytes.Length
                            $res.StatusCode = 200
                            $res.OutputStream.Write($bytes, 0, $bytes.Length)
                            $res.Close()
                            return
                        }
                    }
                    $errResp = '{"success":false,"error":"Invalid User ID or Password"}'
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($errResp)
                    $res.ContentType = 'application/json; charset=utf-8'
                    $res.ContentLength64 = $bytes.Length
                    $res.StatusCode = 401
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    $res.Close()
                    return
                }

                # API Endpoint: Reset Password (SEC-001 & SEC-004 Hardening)
                if ($req.HttpMethod -eq 'POST' -and ($path -eq 'api/auth/reset-password' -or $path -eq 'auth/reset-password')) {
                    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $data = $body | ConvertFrom-Json
                    $sysPath = Join-Path $dir 'data\system.json'
                    if (Test-Path $sysPath) {
                        $sys = Get-Content $sysPath -Raw -Encoding UTF8 | ConvertFrom-Json
                        $u = $sys.users | Where-Object { $_.username.ToLower() -eq $data.username.ToLower().Trim() } | Select-Object -First 1
                        
                        $isPwdMatch = $false
                        if ($u -and $data.currentPassword) {
                            $sha = [System.Security.Cryptography.SHA256]::Create()
                            $saltBytes = [System.Text.Encoding]::UTF8.GetBytes("ubit_salt_2026_" + $data.currentPassword)
                            $curHash = "sha256:" + [System.BitConverter]::ToString($sha.ComputeHash($saltBytes)).Replace("-", "").ToLower()
                            if ($u.password -eq $curHash -or $u.password -eq $data.currentPassword) {
                                $isPwdMatch = $true
                            }
                        }

                        if ($isPwdMatch) {
                            $newSaltBytes = [System.Text.Encoding]::UTF8.GetBytes("ubit_salt_2026_" + $data.newPassword)
                            $u.password = "sha256:" + [System.BitConverter]::ToString($sha.ComputeHash($newSaltBytes)).Replace("-", "").ToLower()
                            $sys | ConvertTo-Json -Depth 10 | Set-Content $sysPath -Encoding UTF8
                            $resp = '{"success":true,"message":"Password reset successfully"}'
                            $bytes = [System.Text.Encoding]::UTF8.GetBytes($resp)
                            $res.ContentType = 'application/json; charset=utf-8'
                            $res.ContentLength64 = $bytes.Length
                            $res.StatusCode = 200
                            $res.OutputStream.Write($bytes, 0, $bytes.Length)
                            $res.Close()
                            return
                        }
                    }
                    $errResp = '{"success":false,"error":"Invalid user or password"}'
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($errResp)
                    $res.ContentType = 'application/json; charset=utf-8'
                    $res.ContentLength64 = $bytes.Length
                    $res.StatusCode = 400
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    $res.Close()
                    return
                }

                # Block sensitive files and source code (SEC-002 Hardening)
                $ext = [System.IO.Path]::GetExtension($path).ToLower()
                if ($ext -in @('.cs', '.ps1', '.bat', '.vbs', '.cmd', '.exe') -or $path -like '.git*' -or $path -like '.agent*') {
                    $res.StatusCode = 403
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden: System file access denied.")
                    $res.ContentType = 'text/plain'
                    $res.ContentLength64 = $bytes.Length
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    $res.Close()
                    return
                }

                # Protect data/system.json from direct unauthenticated GET (SEC-002)
                $normPath = $path.Replace('/', '\').Trim()
                if ($normPath -eq 'data\system.json') {
                    $authHdr = $req.Headers['X-Ubit-Auth']
                    if (-not $authHdr -or $authHdr -ne 'ubit-admin-session') {
                        $res.StatusCode = 403
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"403 Forbidden: Direct unauthenticated access to system database is blocked."}')
                        $res.ContentType = 'application/json; charset=utf-8'
                        $res.ContentLength64 = $bytes.Length
                        $res.OutputStream.Write($bytes, 0, $bytes.Length)
                        $res.Close()
                        return
                    }
                }

                $file = Join-Path $dir $path

                if (Test-Path $file -PathType Leaf) {
                    $ext = [System.IO.Path]::GetExtension($file).ToLower()
                    switch ($ext) {
                        '.html'  { $res.ContentType = 'text/html; charset=utf-8' }
                        '.htm'   { $res.ContentType = 'text/html; charset=utf-8' }
                        '.js'    { $res.ContentType = 'application/javascript; charset=utf-8' }
                        '.mjs'   { $res.ContentType = 'application/javascript; charset=utf-8' }
                        '.css'   { $res.ContentType = 'text/css; charset=utf-8' }
                        '.json'  { $res.ContentType = 'application/json; charset=utf-8' }
                        '.svg'   { $res.ContentType = 'image/svg+xml' }
                        '.png'   { $res.ContentType = 'image/png' }
                        '.jpg'   { $res.ContentType = 'image/jpeg' }
                        '.jpeg'  { $res.ContentType = 'image/jpeg' }
                        '.ico'   { $res.ContentType = 'image/x-icon' }
                        '.webp'  { $res.ContentType = 'image/webp' }
                        '.woff2' { $res.ContentType = 'font/woff2' }
                        '.woff'  { $res.ContentType = 'font/woff' }
                        '.ttf'   { $res.ContentType = 'font/ttf' }
                        default  { $res.ContentType = 'application/octet-stream' }
                    }
                    $bytes = [System.IO.File]::ReadAllBytes($file)
                    $res.ContentLength64 = $bytes.Length
                    $res.StatusCode = 200
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                } else {
                    $ext = [System.IO.Path]::GetExtension($path).ToLower()
                    if ($ext -in @('.svg', '.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2', '.ttf', '.map')) {
                        $res.StatusCode = 404
                    } else {
                        $spa = Join-Path $dir 'index.html'
                        if (Test-Path $spa) {
                            $res.ContentType = 'text/html; charset=utf-8'
                            $bytes = [System.IO.File]::ReadAllBytes($spa)
                            $res.ContentLength64 = $bytes.Length
                            $res.StatusCode = 200
                            $res.OutputStream.Write($bytes, 0, $bytes.Length)
                        } else {
                            $res.StatusCode = 404
                        }
                    }
                }
                $res.Close()
            } catch {
                try { $c.Response.Close() } catch {}
            }
        }, $stateObj) | Out-Null
    } catch {
        if (-not $listener.IsListening) { break }
    }
}
