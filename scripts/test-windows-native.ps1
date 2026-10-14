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
  Click-Name '登录或注册'
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
  Click-Name '登录并开始同步'
  Wait-For { Find-Name '当前身份：已登录' } 'authenticated account page' | Out-Null
  Click-Name '继续写作'
  Wait-For { Find-Name '新建文档' } 'authenticated app navigation' | Out-Null
  Write-Host 'PASS: installed Windows app launches and logs in through native IPC'
  Click-Name '新建文档'
  Wait-For { Find-Name '保存并进入阅读模式' } 'new document editor' | Out-Null
  $body = Wait-For { Find-Name '文档正文' } 'document body'
  $synthetic = 'vana-windows-native-export-12345'
  Set-PrivateValue $body $synthetic
  Click-Name '保存并进入阅读模式'
  Wait-For { Find-Name $synthetic } 'saved document body' | Out-Null
  # Production uses the Windows Documents known folder when available.
  $documents = [Environment]::GetFolderPath('MyDocuments')
  $exports = if ($documents) { Join-Path $documents 'vana' } else { Join-Path $data 'exports' }
  foreach ($format in @(@('Markdown', 'md'), @('DOCX', 'docx'), @('PDF', 'pdf'))) {
    Click-Name '文件'
    Click-Name "导出 $($format[0])"
    $file = Wait-For { Get-ChildItem $exports -Filter "*.$($format[1])" -ErrorAction SilentlyContinue | Select-Object -First 1 } "native $($format[0]) file"
    if ($file.Length -eq 0) { throw 'Empty export' }
    if ($format[1] -eq 'md' -and (Get-Content $file.FullName -Raw) -notmatch $synthetic) { throw 'Markdown content mismatch' }
    if ($format[1] -eq 'docx') {
      $zip = [System.IO.Compression.ZipFile]::OpenRead($file.FullName)
      try {
        $reader = [System.IO.StreamReader]::new($zip.GetEntry('word/document.xml').Open())
        try { if ($reader.ReadToEnd() -notmatch $synthetic) { throw 'DOCX content mismatch' } } finally { $reader.Dispose() }
      } finally { $zip.Dispose() }
    }
    if ($format[1] -eq 'pdf') {
      $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
      if ([System.Text.Encoding]::ASCII.GetString($bytes, 0, 5) -ne '%PDF-' -or $bytes.Length -lt 1000) { throw 'Invalid PDF export' }
    }
  }
  Write-Host 'PASS: Windows native edit/save and Markdown/DOCX/PDF files; PDF checked for format and nonempty data'
  $pattern = $script:window.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
  $pattern.Close()
  if (-not $script:app.WaitForExit(15000)) { throw 'Normal close did not finish' }
  Start-Vana
  Wait-For { Find-Name '新建文档' } 'reopened authenticated app' | Out-Null
  Wait-For { Find-Name $synthetic } 'reopened saved body' | Out-Null
  Write-Host 'PASS: Windows normal close/relaunch reads the saved document body'
  Click-Name '账号'
  Wait-For { Find-Name '当前身份：已登录' } 'reopened native session' | Out-Null
  Write-Host 'PASS: Windows normal close/relaunch restores authenticated session'
  Click-Name '设置'
  Click-Name '导出空间备份'
  $backup = Wait-For { Get-ChildItem $exports -Filter '*.vana-backup.json' -ErrorAction SilentlyContinue | Select-Object -First 1 } 'native space backup'
  $json = Get-Content $backup.FullName -Raw
  $parsed = $json | ConvertFrom-Json
  if ($parsed.format -ne 'vana-space-backup' -or $json -notmatch $synthetic -or $json -match 'refresh_token|access_token') { throw 'Invalid space backup' }
  Write-Host 'PASS: Windows native space backup includes saved body and excludes session tokens'
  Click-Name '账号'
  Click-Name '退出登录'
  Wait-For { Find-Name '当前身份：访客' } 'native logout' | Out-Null
  Write-Host 'PASS: installed Windows app logs out and switches to guest space'
} finally {
  [System.Windows.Forms.Clipboard]::Clear()
  if ($app -and -not $app.HasExited) { $app.Kill(); $app.WaitForExit() }
}
