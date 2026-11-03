using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections;
using System.Collections.Generic;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

namespace UbitErpServer
{
    class Program
    {
        [DllImport("kernel32.dll")]
        static extern IntPtr GetConsoleWindow();

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        const int SW_HIDE = 0;
        const int SW_SHOW = 5;

        private static HttpListener _listener;
        private static string _baseDir;
        private static int _port = 5173;
        private static bool _running = true;

        static void Main(string[] args)
        {
            try
            {
                _baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
                bool hidden = false;

                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--stop")
                    {
                        StopExistingProcesses();
                        return;
                    }
                    if (args[i] == "--hidden" || args[i] == "--daemon")
                    {
                        hidden = true;
                    }
                    if (args[i] == "--port" && i + 1 < args.Length)
                    {
                        int.TryParse(args[i + 1], out _port);
                    }
                }

                if (hidden)
                {
                    try
                    {
                        IntPtr handle = GetConsoleWindow();
                        if (handle != IntPtr.Zero)
                        {
                            ShowWindow(handle, SW_HIDE);
                        }
                    }
                    catch { }
                }

                StopExistingProcesses(true);
                StartServer(hidden);
            }
            catch (Exception ex)
            {
                try { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server-err.txt"), ex.ToString()); } catch { }
            }
        }

        static void StopExistingProcesses(bool excludeCurrent = false)
        {
            try
            {
                int currentId = Process.GetCurrentProcess().Id;
                foreach (var p in Process.GetProcessesByName("ubit-server"))
                {
                    try
                    {
                        if (excludeCurrent && p.Id == currentId) continue;
                        p.Kill();
                        p.WaitForExit(1000);
                    }
                    catch { }
                }
            }
            catch { }
        }

        static void StartServer(bool isHidden)
        {
            int[] tryPorts = new int[] { _port, 5174, 8080, 8081, 3000 };
            bool started = false;

            foreach (int p in tryPorts)
            {
                try
                {
                    _listener = new HttpListener();
                    _listener.Prefixes.Add("http://localhost:" + p + "/");
                    _listener.Prefixes.Add("http://127.0.0.1:" + p + "/");
                    _listener.Start();
                    _port = p;
                    started = true;
                    break;
                }
                catch
                {
                    try { _listener.Close(); } catch { }
                }
            }

            if (!started)
            {
                if (!isHidden)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[ERROR] Could not bind to local ports (5173, 5174, 8080, 8081, 3000).");
                    Console.ResetColor();
                }
                return;
            }

            try
            {
                File.WriteAllText(Path.Combine(_baseDir, "active-port.txt"), _port.ToString());
            }
            catch { }

            try
            {
                if (!isHidden)
                {
                    try { Console.Title = "UBIT Pro ERP Local Server - Port " + _port; } catch { }
                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("================================================================================");
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("   UBIT Pro ERP - High Performance Local Server Active");
                    Console.ForegroundColor = ConsoleColor.White;
                    Console.WriteLine("   Access URL : http://localhost:" + _port + "/");
                    Console.ForegroundColor = ConsoleColor.DarkGray;
                    Console.WriteLine("   Directory  : " + _baseDir);
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("   Status     : ONLINE (Multi-Threaded HTTP Engine)");
                    Console.ForegroundColor = ConsoleColor.DarkCyan;
                    Console.WriteLine("   Note       : Keep this window minimized while working on ERP.");
                    Console.ForegroundColor = ConsoleColor.DarkGray;
                    Console.WriteLine("   To Stop    : Run UBIT Pro ERP.exe --stop or press Ctrl+C");
                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("================================================================================");
                    Console.ResetColor();
                }
            }
            catch { }

            _listener.BeginGetContext(OnContextReceived, null);

            while (_running)
            {
                Thread.Sleep(500);
            }
        }

        private static void OnContextReceived(IAsyncResult ar)
        {
            if (_listener == null || !_listener.IsListening) return;

            try
            {
                _listener.BeginGetContext(OnContextReceived, null);
            }
            catch { }

            HttpListenerContext ctx = null;
            try
            {
                ctx = _listener.EndGetContext(ar);
            }
            catch
            {
                return;
            }

            ThreadPool.QueueUserWorkItem((state) =>
            {
                ProcessRequest(ctx);
            });
        }

        private static void ProcessRequest(HttpListenerContext ctx)
        {
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse res = ctx.Response;

            try
            {
                // Strict Local CORS Policy - Restrict origin strictly to localhost / 127.0.0.1 or null (file context)
                string reqOrigin = req.Headers["Origin"];
                if (!string.IsNullOrEmpty(reqOrigin))
                {
                    if (reqOrigin == "null" ||
                        reqOrigin.StartsWith("http://localhost:", StringComparison.OrdinalIgnoreCase) ||
                        reqOrigin.StartsWith("http://127.0.0.1:", StringComparison.OrdinalIgnoreCase) ||
                        reqOrigin.StartsWith("https://localhost:", StringComparison.OrdinalIgnoreCase) ||
                        reqOrigin.StartsWith("https://127.0.0.1:", StringComparison.OrdinalIgnoreCase))
                    {
                        res.Headers["Access-Control-Allow-Origin"] = reqOrigin;
                        res.Headers["Access-Control-Allow-Credentials"] = "true";
                    }
                }
                else
                {
                    res.Headers["Access-Control-Allow-Origin"] = "http://localhost:" + _port;
                }

                res.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
                res.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-Ubit-Auth";
                res.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                res.Headers["X-Frame-Options"] = "SAMEORIGIN";
                res.Headers["X-Content-Type-Options"] = "nosniff";
                res.Headers["Content-Security-Policy"] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' http: https: data: blob:; frame-ancestors 'self';";
                res.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
                res.Headers["X-XSS-Protection"] = "1; mode=block";

                if (req.HttpMethod == "OPTIONS")
                {
                    res.StatusCode = 204;
                    res.Close();
                    return;
                }

                string rawPath = req.Url.LocalPath.TrimStart('/');
                if (string.IsNullOrEmpty(rawPath))
                {
                    rawPath = "index.html";
                }

                // Handle System MAC Detection API
                if (req.HttpMethod == "GET" && (rawPath.Equals("api/system/mac", StringComparison.OrdinalIgnoreCase) || rawPath.Equals("api/system/device-mac", StringComparison.OrdinalIgnoreCase)))
                {
                    HandleGetMac(req, res);
                    return;
                }

                // Handle Secure Server-Side Login API
                if (req.HttpMethod == "POST" && (rawPath.Equals("api/auth/login", StringComparison.OrdinalIgnoreCase) || rawPath.Equals("auth/login", StringComparison.OrdinalIgnoreCase)))
                {
                    HandleLogin(req, res);
                    return;
                }

                // Handle Auth Reset-Password API
                if (req.HttpMethod == "POST" && (rawPath.Equals("api/auth/reset-password", StringComparison.OrdinalIgnoreCase) || rawPath.Equals("auth/reset-password", StringComparison.OrdinalIgnoreCase)))
                {
                    HandleResetPassword(req, res);
                    return;
                }

                // Handle Admin Users Sync API
                if (req.HttpMethod == "POST" && (rawPath.Equals("api/auth/admin/users/sync", StringComparison.OrdinalIgnoreCase) || rawPath.Equals("auth/admin/users/sync", StringComparison.OrdinalIgnoreCase)))
                {
                    HandleAdminUsersSync(req, res);
                    return;
                }

                string normalizedPath = rawPath.Replace("..", "").Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar).Trim();

                // Block sensitive system files and source scripts (SEC-002 Hardening)
                string extCheck = Path.GetExtension(normalizedPath).ToLowerInvariant();
                if (extCheck == ".cs" || extCheck == ".ps1" || extCheck == ".bat" || extCheck == ".vbs" || extCheck == ".cmd" || extCheck == ".exe" ||
                    normalizedPath.StartsWith(".git", StringComparison.OrdinalIgnoreCase) ||
                    normalizedPath.StartsWith(".agent", StringComparison.OrdinalIgnoreCase) ||
                    normalizedPath.StartsWith(".gemini", StringComparison.OrdinalIgnoreCase))
                {
                    res.StatusCode = 403;
                    byte[] forbidden = Encoding.UTF8.GetBytes("403 Forbidden: System file access denied.");
                    res.ContentType = "text/plain";
                    res.ContentLength64 = forbidden.Length;
                    res.OutputStream.Write(forbidden, 0, forbidden.Length);
                    res.Close();
                    return;
                }

                // Protect data/system.json from direct unauthenticated GET (SEC-002)
                if (normalizedPath.Equals("data" + Path.DirectorySeparatorChar + "system.json", StringComparison.OrdinalIgnoreCase) ||
                    normalizedPath.Equals("data/system.json", StringComparison.OrdinalIgnoreCase))
                {
                    string authHdr = req.Headers["X-Ubit-Auth"] ?? req.Headers["Authorization"] ?? "";
                    if (string.IsNullOrEmpty(authHdr) || !authHdr.Equals("ubit-admin-session", StringComparison.OrdinalIgnoreCase))
                    {
                        res.StatusCode = 403;
                        byte[] forbidden = Encoding.UTF8.GetBytes("{\"error\":\"403 Forbidden: Direct unauthenticated access to system database is blocked.\"}");
                        res.ContentType = "application/json; charset=utf-8";
                        res.ContentLength64 = forbidden.Length;
                        res.OutputStream.Write(forbidden, 0, forbidden.Length);
                        res.Close();
                        return;
                    }
                }

                string filePath = Path.Combine(_baseDir, normalizedPath);
                try
                {
                    string fullPath = Path.GetFullPath(filePath);
                    if (!fullPath.StartsWith(_baseDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
                        !fullPath.Equals(_baseDir, StringComparison.OrdinalIgnoreCase))
                    {
                        res.StatusCode = 403;
                        byte[] forbidden = Encoding.UTF8.GetBytes("403 Forbidden: Path traversal prohibited.");
                        res.ContentType = "text/plain";
                        res.ContentLength64 = forbidden.Length;
                        res.OutputStream.Write(forbidden, 0, forbidden.Length);
                        res.Close();
                        return;
                    }
                }
                catch
                {
                    res.StatusCode = 403;
                    res.Close();
                    return;
                }

                if (File.Exists(filePath))
                {
                    ServeFile(res, filePath);
                }
                else
                {
                    string ext = Path.GetExtension(normalizedPath).ToLowerInvariant();
                    if (ext == ".svg" || ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".ico" ||
                        ext == ".woff" || ext == ".woff2" || ext == ".ttf" || ext == ".map" || ext == ".json")
                    {
                        res.StatusCode = 404;
                        byte[] notFound = Encoding.UTF8.GetBytes("Not Found");
                        res.ContentType = "text/plain";
                        res.ContentLength64 = notFound.Length;
                        res.OutputStream.Write(notFound, 0, notFound.Length);
                        res.Close();
                        return;
                    }

                    string spaIndex = Path.Combine(_baseDir, "index.html");
                    if (File.Exists(spaIndex))
                    {
                        ServeFile(res, spaIndex);
                    }
                    else
                    {
                        res.StatusCode = 404;
                        byte[] notFound = Encoding.UTF8.GetBytes("File Not Found");
                        res.ContentType = "text/plain";
                        res.ContentLength64 = notFound.Length;
                        res.OutputStream.Write(notFound, 0, notFound.Length);
                        res.Close();
                    }
                }
            }
            catch
            {
                try { res.Close(); } catch { }
            }
        }

        private static void HandleGetMac(HttpListenerRequest req, HttpListenerResponse res)
        {
            try
            {
                string macAddress = "";
                foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.OperationalStatus == OperationalStatus.Up &&
                        nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    {
                        var bytes = nic.GetPhysicalAddress().GetAddressBytes();
                        if (bytes.Length > 0)
                        {
                            var parts = new string[bytes.Length];
                            for (int i = 0; i < bytes.Length; i++) parts[i] = bytes[i].ToString("X2");
                            macAddress = string.Join(":", parts);
                            break;
                        }
                    }
                }

                if (string.IsNullOrEmpty(macAddress))
                {
                    macAddress = "PC-" + Environment.MachineName.ToUpper();
                }

                SendJson(res, 200, "{\"success\":true,\"mac\":\"" + macAddress + "\"}");
            }
            catch (Exception ex)
            {
                SendJson(res, 500, "{\"success\":false,\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}");
            }
        }

        private static void HandleLogin(HttpListenerRequest req, HttpListenerResponse res)
        {
            try
            {
                using (var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    var jss = new JavaScriptSerializer();
                    var dict = jss.Deserialize<Dictionary<string, object>>(body);
                    string username = dict != null && dict.ContainsKey("username") ? (dict["username"] ?? "").ToString().Trim() : "";
                    string password = dict != null && dict.ContainsKey("password") ? (dict["password"] ?? "").ToString() : "";
                    string mac = dict != null && dict.ContainsKey("mac") ? (dict["mac"] ?? "").ToString().Trim() : "";

                    string sysPath = Path.Combine(_baseDir, "data", "system.json");
                    if (File.Exists(sysPath))
                    {
                        string sysContent = File.ReadAllText(sysPath, Encoding.UTF8);
                        var sysData = jss.Deserialize<Dictionary<string, object>>(sysContent);
                        if (sysData != null && sysData.ContainsKey("users") && sysData["users"] is ArrayList)
                        {
                            var users = (ArrayList)sysData["users"];
                            Dictionary<string, object> targetUser = null;
                            foreach (object uObj in users)
                            {
                                if (uObj is Dictionary<string, object>)
                                {
                                    var uDict = (Dictionary<string, object>)uObj;
                                    string uName = uDict.ContainsKey("username") ? (uDict["username"] ?? "").ToString() : "";
                                    if (uName.Equals(username, StringComparison.OrdinalIgnoreCase))
                                    {
                                        targetUser = uDict;
                                        break;
                                    }
                                }
                            }

                            if (targetUser == null)
                            {
                                SendJson(res, 401, "{\"success\":false,\"error\":\"Invalid User ID or Password\"}");
                                return;
                            }

                            string storedPwd = targetUser.ContainsKey("password") ? (targetUser["password"] ?? "").ToString() : "";
                            if (!VerifyPassword(password, storedPwd))
                            {
                                SendJson(res, 401, "{\"success\":false,\"error\":\"Invalid User ID or Password\"}");
                                return;
                            }

                            bool isRestricted = targetUser.ContainsKey("isRestricted") && Convert.ToBoolean(targetUser["isRestricted"]);
                            if (isRestricted)
                            {
                                SendJson(res, 403, "{\"success\":false,\"error\":\"Access Suspended: Software usage has been restricted by Administrator.\"}");
                                return;
                            }

                            string role = targetUser.ContainsKey("role") ? (targetUser["role"] ?? "").ToString() : "";
                            if (!role.Equals("Admin", StringComparison.OrdinalIgnoreCase) &&
                                !username.Equals("pradheep", StringComparison.OrdinalIgnoreCase) &&
                                !username.Equals("hari", StringComparison.OrdinalIgnoreCase))
                            {
                                if (!string.IsNullOrEmpty(mac))
                                {
                                    targetUser["activeMacId"] = mac;
                                    targetUser["bondedMacId"] = mac;
                                }
                            }

                            File.WriteAllText(sysPath, jss.Serialize(sysData), Encoding.UTF8);

                            // Create safe copy without password
                            var safeUser = new Dictionary<string, object>(targetUser);
                            safeUser.Remove("password");

                            var responseDict = new Dictionary<string, object>();
                            responseDict["success"] = true;
                            responseDict["user"] = safeUser;
                            SendJson(res, 200, jss.Serialize(responseDict));
                            return;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                SendJson(res, 500, "{\"success\":false,\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}");
                return;
            }
            SendJson(res, 400, "{\"success\":false,\"error\":\"Login failed\"}");
        }

        private static void HandleAdminUsersSync(HttpListenerRequest req, HttpListenerResponse res)
        {
            try
            {
                string authHdr = req.Headers["X-Ubit-Auth"] ?? req.Headers["Authorization"] ?? "";
                if (string.IsNullOrEmpty(authHdr) || !authHdr.Equals("ubit-admin-session", StringComparison.OrdinalIgnoreCase))
                {
                    SendJson(res, 403, "{\"success\":false,\"error\":\"Unauthorized administrative sync request\"}");
                    return;
                }

                using (var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    var jss = new JavaScriptSerializer();
                    var dict = jss.Deserialize<Dictionary<string, object>>(body);
                    if (dict != null && dict.ContainsKey("users") && dict["users"] is ArrayList)
                    {
                        var users = (ArrayList)dict["users"];
                        string sysPath = Path.Combine(_baseDir, "data", "system.json");
                        Dictionary<string, object> sysData = new Dictionary<string, object>();
                        if (File.Exists(sysPath))
                        {
                            try
                            {
                                sysData = jss.Deserialize<Dictionary<string, object>>(File.ReadAllText(sysPath, Encoding.UTF8)) ?? new Dictionary<string, object>();
                            }
                            catch { }
                        }
                        sysData["users"] = users;
                        File.WriteAllText(sysPath, jss.Serialize(sysData), Encoding.UTF8);
                        SendJson(res, 200, "{\"success\":true,\"message\":\"Users synchronized securely\"}");
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                SendJson(res, 500, "{\"success\":false,\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}");
                return;
            }
            SendJson(res, 400, "{\"success\":false,\"error\":\"Invalid request data\"}");
        }

        private static void HandleResetPassword(HttpListenerRequest req, HttpListenerResponse res)
        {
            try
            {
                using (var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    var jss = new JavaScriptSerializer();
                    var dict = jss.Deserialize<Dictionary<string, object>>(body);
                    string username = dict != null && dict.ContainsKey("username") ? (dict["username"] ?? "").ToString().Trim() : "";
                    string currentPassword = dict != null && dict.ContainsKey("currentPassword") ? (dict["currentPassword"] ?? "").ToString() : "";
                    string newPassword = dict != null && dict.ContainsKey("newPassword") ? (dict["newPassword"] ?? "").ToString() : "";

                    string sysPath = Path.Combine(_baseDir, "data", "system.json");
                    if (File.Exists(sysPath))
                    {
                        string sysContent = File.ReadAllText(sysPath, Encoding.UTF8);
                        var sysData = jss.Deserialize<Dictionary<string, object>>(sysContent);
                        if (sysData != null && sysData.ContainsKey("users") && sysData["users"] is ArrayList)
                        {
                            var users = (ArrayList)sysData["users"];
                            bool found = false;
                            bool pwdOk = false;
                            foreach (object uObj in users)
                            {
                                if (uObj is Dictionary<string, object>)
                                {
                                    var uDict = (Dictionary<string, object>)uObj;
                                    string uName = uDict.ContainsKey("username") ? (uDict["username"] ?? "").ToString() : "";
                                    if (uName.Equals(username, StringComparison.OrdinalIgnoreCase))
                                    {
                                        found = true;
                                        string oldPwd = uDict.ContainsKey("password") ? (uDict["password"] ?? "").ToString() : "";
                                        
                                        // SEC-001 Fix: Cryptographically verify current password and completely eliminate backdoor override
                                        if (VerifyPassword(currentPassword, oldPwd))
                                        {
                                            pwdOk = true;
                                            uDict["password"] = HashPassword(newPassword);
                                            break;
                                        }
                                    }
                                }
                            }

                            if (!found)
                            {
                                SendJson(res, 400, "{\"success\":false,\"error\":\"User not found\"}");
                                return;
                            }
                            if (!pwdOk)
                            {
                                SendJson(res, 400, "{\"success\":false,\"error\":\"Incorrect current password\"}");
                                return;
                            }

                            File.WriteAllText(sysPath, jss.Serialize(sysData), Encoding.UTF8);
                            SendJson(res, 200, "{\"success\":true,\"message\":\"Password reset successfully\"}");
                            return;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                SendJson(res, 500, "{\"success\":false,\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}");
                return;
            }
            SendJson(res, 400, "{\"success\":false,\"error\":\"Failed to update password\"}");
        }

        private static string HashPassword(string password)
        {
            if (string.IsNullOrEmpty(password)) return "";
            using (var sha = SHA256.Create())
            {
                byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes("ubit_salt_2026_" + password));
                var sb = new StringBuilder("sha256:");
                foreach (byte b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private static bool VerifyPassword(string inputPassword, string storedPassword)
        {
            if (string.IsNullOrEmpty(inputPassword) || string.IsNullOrEmpty(storedPassword)) return false;
            if (storedPassword.StartsWith("sha256:"))
            {
                return HashPassword(inputPassword).Equals(storedPassword, StringComparison.OrdinalIgnoreCase);
            }
            // Backward-compatible check for legacy plaintext passwords
            return storedPassword == inputPassword;
        }

        private static void SendJson(HttpListenerResponse res, int statusCode, string json)
        {
            try
            {
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                res.ContentType = "application/json; charset=utf-8";
                res.ContentLength64 = bytes.Length;
                res.StatusCode = statusCode;
                res.OutputStream.Write(bytes, 0, bytes.Length);
                res.Close();
            }
            catch { }
        }

        private static void ServeFile(HttpListenerResponse res, string filePath)
        {
            string ext = Path.GetExtension(filePath).ToLowerInvariant();
            switch (ext)
            {
                case ".html":
                case ".htm":
                    res.ContentType = "text/html; charset=utf-8";
                    break;
                case ".js":
                case ".mjs":
                    res.ContentType = "application/javascript; charset=utf-8";
                    break;
                case ".css":
                    res.ContentType = "text/css; charset=utf-8";
                    break;
                case ".json":
                    res.ContentType = "application/json; charset=utf-8";
                    break;
                case ".svg":
                    res.ContentType = "image/svg+xml";
                    break;
                case ".png":
                    res.ContentType = "image/png";
                    break;
                case ".jpg":
                case ".jpeg":
                    res.ContentType = "image/jpeg";
                    break;
                case ".ico":
                    res.ContentType = "image/x-icon";
                    break;
                case ".webp":
                    res.ContentType = "image/webp";
                    break;
                case ".woff2":
                    res.ContentType = "font/woff2";
                    break;
                case ".woff":
                    res.ContentType = "font/woff";
                    break;
                case ".ttf":
                    res.ContentType = "font/ttf";
                    break;
                default:
                    res.ContentType = "application/octet-stream";
                    break;
            }

            using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                res.ContentLength64 = fs.Length;
                res.StatusCode = 200;
                byte[] buffer = new byte[65536];
                int read;
                while ((read = fs.Read(buffer, 0, buffer.Length)) > 0)
                {
                    res.OutputStream.Write(buffer, 0, read);
                }
            }
            res.Close();
        }
    }
}
