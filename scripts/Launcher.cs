using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace WatchTogetherLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string serverScript = Path.Combine(baseDir, "server", "server.js");

                // 1. Check if server is already running on port 3001
                if (!IsPortOpen("127.0.0.1", 3001))
                {
                    if (File.Exists(serverScript))
                    {
                        ProcessStartInfo serverPsi = new ProcessStartInfo
                        {
                            FileName = "node.exe",
                            Arguments = "\"" + serverScript + "\"",
                            WorkingDirectory = Path.Combine(baseDir, "server"),
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            WindowStyle = ProcessWindowStyle.Hidden
                        };

                        try
                        {
                            Process.Start(serverPsi);
                        }
                        catch (Exception ex)
                        {
                            MessageBox.Show(
                                "Could not launch Node.js server: " + ex.Message + "\nMake sure Node.js is installed.",
                                "Watch Together Launcher",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Warning
                            );
                        }

                        // Wait up to 3 seconds for server to be responsive
                        for (int i = 0; i < 15; i++)
                        {
                            Thread.Sleep(200);
                            if (IsPortOpen("127.0.0.1", 3001)) break;
                        }
                    }
                }

                // 2. Launch Dedicated Standalone Native App if installed/unpacked
                string portableExe = Path.Combine(baseDir, "WatchTogether-Desktop.exe");
                if (File.Exists(portableExe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = portableExe,
                        WorkingDirectory = baseDir,
                        UseShellExecute = true
                    });
                    return;
                }

                string electronExe = Path.Combine(baseDir, "client", "dist-electron", "win-unpacked", "Watch Together.exe");
                if (File.Exists(electronExe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = electronExe,
                        WorkingDirectory = Path.GetDirectoryName(electronExe),
                        UseShellExecute = true
                    });
                    return;
                }

                // Fallback: Launch Standalone App Window (prefer local server, fallback to cloud)
                string targetUrl = IsPortOpen("127.0.0.1", 3001) ? "http://localhost:3001" : "https://watch-together-8wj2.onrender.com";
                string edgePath86 = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                string edgePath64 = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                string chromePath64 = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
                string chromePath86 = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";

                string browserExe = null;
                if (File.Exists(edgePath64)) browserExe = edgePath64;
                else if (File.Exists(edgePath86)) browserExe = edgePath86;
                else if (File.Exists(chromePath64)) browserExe = chromePath64;
                else if (File.Exists(chromePath86)) browserExe = chromePath86;

                if (browserExe != null)
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = "--app=\"" + targetUrl + "\" --window-size=1280,800",
                        UseShellExecute = true
                    });
                }
                else
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = targetUrl,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error starting Watch Together: " + ex.Message,
                    "Watch Together Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        static bool IsPortOpen(string host, int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(300);
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
