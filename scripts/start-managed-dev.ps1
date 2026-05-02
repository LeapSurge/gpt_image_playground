[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey,
  [string]$BaseUrl = "https://www.xtokenapi.cn/v1",
  [string]$Model = "gpt-image-2",
  [string]$ProviderLabel = "xtoken-primary",
  [string]$Host = "127.0.0.1",
  [int]$Port = 5176,
  [string]$SessionSecret = "managed-gateway-dev-session-secret",
  [string]$FileStorePath = ".local-managed-gateway-store.json"
)

$env:MANAGED_GATEWAY_PRIMARY_BASE_URL = $BaseUrl
$env:MANAGED_GATEWAY_PRIMARY_API_KEY = $ApiKey
$env:MANAGED_GATEWAY_PRIMARY_LABEL = $ProviderLabel
$env:MANAGED_GATEWAY_PRIMARY_MODEL = $Model
$env:MANAGED_GATEWAY_SESSION_SECRET = $SessionSecret
$resolvedFileStorePath = if ([System.IO.Path]::IsPathRooted($FileStorePath)) {
  $FileStorePath
} else {
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $FileStorePath))
}
$env:MANAGED_GATEWAY_FILE_STORE_PATH = $resolvedFileStorePath

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmd) {
  & $npmCmd.Source run dev -- --host $Host --port $Port
  exit $LASTEXITCODE
}

$nodeExe = "D:\node-global\node.exe"
$npmCli = "D:\node-global\node_modules\npm\bin\npm-cli.js"
if ((Test-Path $nodeExe) -and (Test-Path $npmCli)) {
  & $nodeExe $npmCli run dev -- --host $Host --port $Port
  exit $LASTEXITCODE
}

throw "未找到 npm.cmd，也未找到 D:\node-global 下的 node/npm。"
