param([ValidateSet('reset','dispatch','receipt','acknowledge','arrival')][string]$Action='reset')
$auth=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('operator:operator-demo-only'))
$driverAuth=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('driver-b:driver-demo-only'))
switch($Action){
  'reset' { Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/demo/reset -Headers @{Authorization="Basic $auth"} }
  'dispatch' { $s=Invoke-RestMethod -Uri http://localhost:8080/api/v1/control-room/emergencies/EM-2026-001 -Headers @{Authorization="Basic $auth"}; $b=@{ambulanceId='AMB-B';entityVersion=$s.entityVersion;idempotencyKey=[guid]::NewGuid().ToString()}|ConvertTo-Json; Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/control-room/emergencies/EM-2026-001/dispatch -Headers @{Authorization="Basic $auth";'Content-Type'='application/json'} -Body $b }
  default { throw 'Run dispatch first. Use the Flutter client or API contract examples for driver lifecycle commands.' }
}
