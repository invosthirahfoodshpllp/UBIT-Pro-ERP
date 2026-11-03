using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Threading;

namespace UbitErpLauncher
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            // Handle Stop command
            if (args.Length > 0 && (args[0] == "--stop" || args[0] == "-stop" || args[0] == "/stop"))
            {
                StopServer();
                return;
            }

            string url = "http://localhost:5173/";

            // Check if server is already running
            if (IsServerResponding(url))
            {
                OpenBrowser(url);
                return;
            }

            // Start ubit-server.exe hidden
            string exePath = Path.Combine(baseDir, "ubit-server.exe");
            if (File.Exists(exePath))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = exePath;
                psi.Arguments = "--hidden";
                psi.WorkingDirectory = baseDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                try
                {
                    Process.Start(psi);
                }
                catch { }
            }
            else
            {
                // Fallback to powershell local-server
                string psPath = Path.Combine(baseDir, "local-server.ps1");
                if (File.Exists(psPath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "powershell.exe";
                    psi.Arguments = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \"" + psPath + "\"";
                    psi.WorkingDirectory = baseDir;
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    try
                    {
                        Process.Start(psi);
                    }
                    catch { }
                }
            }

            // Poll until server responds (up to 4 seconds)
            for (int i = 0; i < 20; i++)
            {
                Thread.Sleep(200);
                if (IsServerResponding(url))
                {
                    break;
                }
            }

            // Open browser
            OpenBrowser(url);
        }

        static void StopServer()
        {
            foreach (var p in Process.GetProcessesByName("ubit-server"))
            {
                try
                {
                    p.Kill();
                    p.WaitForExit(1000);
                }
                catch { }
            }
        }

        static bool IsServerResponding(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 600;
                req.Method = "GET";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    return ((int)resp.StatusCode >= 200 && (int)resp.StatusCode < 400);
                }
            }
            catch
            {
                return false;
            }
        }

        static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch
            {
                try
                {
                    Process.Start("cmd.exe", "/c start " + url);
                }
                catch { }
            }
        }
    }
}
