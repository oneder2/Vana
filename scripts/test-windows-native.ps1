# Runs only on a disposable Windows user/runner with a self-created account.
param([Parameter(Mandatory=$true)][string]$InstallerRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$config = Get-Content $env:VANA_NATIVE_ACCEPTANCE_CONFIG -Raw | ConvertFrom-Json
if ($config.email -notmatch '^vana-acceptance-.*@example\.com$') { throw 'Disposable fixture required' }
$data = Join-Path $env:APPDATA 'com.vana.no-visitors'
if (Test-Path $data) { throw 'Use a new Windows user; existing app data must not be touched' }
$msi = @(Get-ChildItem $InstallerRoot -Filter '*.msi' -Recurse)
if ($msi.Count -ne 1) { throw 'Exactly one MSI is required' }
$extract = Join-Path $env:RUNNER_TEMP 'vana-installed-native'
$install = Start-Process msiexec.exe -ArgumentList "/a `"$($msi[0].FullName)`" /qn TARGETDIR=`"$extract`"" -PassThru -Wait
if ($install.ExitCode -ne 0) { throw 'MSI administrative extraction failed' }
$executables = @(Get-ChildItem $extract -Recurse -Filter vana.exe)
if ($executables.Count -ne 1) { throw 'Installed native executable not found' }
$app = $null
function Wait-For($action, [string]$description) {
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    try { $result = & $action; if ($result) { return $result } } catch [System.Windows.Automation.ElementNotAvailableException] {}
    Start-Sleep -Milliseconds 250
  }
  throw "Timeout: $description"
}
function Start-Vana {
  $script:app = Start-Process $executables[0].FullName -PassThru
  $script:window = Wait-For {
    if ($script:app.HasExited) { throw 'Native app exited' }
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $script:app.Id)
    [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
  } 'native app window'
}
function Find-Name([string]$name) {
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
  $script:window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Click-Name([string]$name) {
  $element = Wait-For { Find-Name $name } "control $name"
  $pattern = $null
  if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke() }
  else { $element.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
}
function Set-PrivateValue($element, [string]$value) {
  $element.SetFocus()
  $pattern = $null
  if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { $pattern.SetValue($value) }
  else {
    [System.Windows.Forms.Clipboard]::SetText($value)
    [System.Windows.Forms.SendKeys]::SendWait('^a^v')
    [System.Windows.Forms.Clipboard]::Clear()
  }
}
try {
  Start-Vana
  $edits = Wait-For {
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $items = $script:window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if ($items.Count -eq 2) { return ,$items }
  } 'welcome login fields'
  $email = @($edits | Where-Object { -not $_.Current.IsPassword })
  $password = @($edits | Where-Object { $_.Current.IsPassword })
  if ($email.Count -ne 1 -or $password.Count -ne 1) { throw 'Ambiguous authentication fields' }
  Set-PrivateValue $email[0] $config.email
  Set-PrivateValue $password[0] $config.password
  Click-Name '登录'
  Wait-For { Find-Name '新建文档' } 'authenticated app navigation' | Out-Null
  Write-Host 'PASS: installed Windows app launches and logs in through native IPC'
  $pattern = $script:window.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
  $pattern.Close()
  if (-not $script:app.WaitForExit(15000)) { throw 'Normal close did not finish' }
  Start-Vana
  Wait-For { Find-Name '新建文档' } 'reopened authenticated app' | Out-Null
  Click-Name '设置'
  Wait-For { Find-Name '身份模式：authenticated' } 'reopened native session' | Out-Null
  Write-Host 'PASS: Windows normal close/relaunch restores authenticated session'
  Click-Name '切换为访客'
  Wait-For { Find-Name '身份模式：guest' } 'native logout' | Out-Null
  Write-Host 'PASS: installed Windows app logs out and switches to guest space'
} finally {
  [System.Windows.Forms.Clipboard]::Clear()
  if ($app -and -not $app.HasExited) { $app.Kill(); $app.WaitForExit() }
}
