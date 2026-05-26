Get-Process | Where-Object { $_.ProcessName -like "*weread*" -or $_.ProcessName -like "*微信*" } | Select-Object Name, Id, CommandLine | Format-Table -AutoSize
