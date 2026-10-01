using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
public static class BlazeLauncher {
  [STAThread]
  public static void Main() {
    string root = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Blaze");
    string electron = Path.Combine(root, "node_modules", "electron", "dist", "electron.exe");
    if (!File.Exists(electron)) { MessageBox.Show("Не найдена среда Blaze. Откройте инструкцию Blaze/README.md.", "Blaze"); return; }
    try {
      ProcessStartInfo info = new ProcessStartInfo(electron, "\"" + root + "\"");
      info.WorkingDirectory = root; info.UseShellExecute = true;
      Process.Start(info);
    } catch(Exception error) { MessageBox.Show(error.Message, "Blaze"); }
  }
}
