[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$r = [Net.WebRequest]::Create('https://flowauxi.com')
$r.Method = 'HEAD'
$r.AllowAutoRedirect = $false
$resp = $r.GetResponse()
Write-Host "Status:" $resp.StatusCode
Write-Host "Location:" $resp.Headers['Location']
$resp.Close()
