$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class BlazeActivity {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO input);
  public static double IdleSeconds() {
    LASTINPUTINFO input = new LASTINPUTINFO(); input.cbSize = (uint)Marshal.SizeOf(input);
    GetLastInputInfo(ref input); return (uint)(Environment.TickCount - input.dwTime) / 1000.0;
  }
  public static uint ActiveProcessId() {
    uint active; GetWindowThreadProcessId(GetForegroundWindow(), out active); return active;
  }
}
'@
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
while ($true) {
    Start-Sleep -Seconds 5
    try {
        $activeProcess = Get-Process -Id ([BlazeActivity]::ActiveProcessId()) -ErrorAction Stop
        @{ name = $activeProcess.ProcessName; idle = [BlazeActivity]::IdleSeconds(); seconds = 5 } | ConvertTo-Json -Compress | Write-Output
    } catch { }
}
