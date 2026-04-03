[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$r = [Net.WebRequest]::Create('https://www.flowauxi.com')
$r.Method = 'GET'
$r.AllowAutoRedirect = $false
$resp = $r.GetResponse()
Write-Host "Status:" $resp.StatusCode
Write-Host "Location:" $resp.Headers['Location']
Write-Host "X-Redirect-Reason:" $resp.Headers['X-Redirect-Reason']
Write-Host "Server:" $resp.Headers['Server']
$resp.Close()
