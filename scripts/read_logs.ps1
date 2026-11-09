Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('azure_logs.zip')
$zip.Entries | Where-Object { $_.FullName -like 'LogFiles/*' -and $_.FullName -notlike 'LogFiles/kudu/*' -and $_.FullName -notlike 'LogFiles/StartupLogs/*' } | Select-Object -ExpandProperty FullName
$zip.Dispose()
