# AEGIS demo stage backup — same scenario as POST /api/v1/demo/run-scenario
# Requires: backend with SPRING_PROFILES_ACTIVE containing demo + local-pg, JWT for operator/supervisor.
param(
    [string]$BaseUrl = "http://localhost:8080/api/v1",
    [string]$Username = "operator1",
    [string]$Password = "password",
    [ValidateSet("", "driverRejection", "fullHospital", "competingAssignments", "aiDown")]
    [string]$Inject = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
    param([string]$Method, [string]$Url, [object]$Body = $null, [hashtable]$Headers = @{})
    $params = @{
        Method = $Method
        Uri = $Url
        Headers = $Headers
        ContentType = "application/json"
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Compress)
    }
    return Invoke-RestMethod @params
}

Write-Host "Login as $Username ..."
$login = Invoke-Json -Method POST -Url "$BaseUrl/auth/login" -Body @{ username = $Username; password = $Password }
$token = $login.token
if (-not $token) { $token = $login.accessToken }
if (-not $token) { throw "No JWT in login response" }
$auth = @{ Authorization = "Bearer $token" }

Write-Host "POST /demo/reset"
Invoke-Json -Method POST -Url "$BaseUrl/demo/reset" -Headers $auth | ConvertTo-Json -Depth 6

if ($Inject) {
    Write-Host "POST /demo/inject kind=$Inject"
    Invoke-Json -Method POST -Url "$BaseUrl/demo/inject" -Headers $auth -Body @{ kind = $Inject } | ConvertTo-Json -Depth 4
}

Write-Host "POST /demo/run-scenario"
$result = Invoke-Json -Method POST -Url "$BaseUrl/demo/run-scenario" -Headers $auth
$result | ConvertTo-Json -Depth 8
Write-Host "missionState=$($result.missionState) reservationStatus=$($result.reservationStatus)"
