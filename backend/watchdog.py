#!/usr/bin/env python3
"""
BTS Fail-Proof Watchdog — runs inside LXC 203 via cron every minute.
Checks: Node.js health + Funnel process + Caddy process.
Restarts dead components directly (no systemctl).
Cron: * * * * * python3 /opt/bts-audit/watchdog.py >> /var/log/bts-watchdog.log 2>&1
"""
import subprocess
import os
import urllib.request
import urllib.error
import time

LXC_DIR = "/opt/bts-audit"
LOG = "/var/log/bts-watchdog.log"

def log(msg):
    ts = subprocess.run(['date', '+%Y-%m-%d %H:%M:%S'], capture_output=True, text=True).stdout.strip()
    line = f"[{ts}] WATCHDOG: {msg}"
    print(line)
    try:
        with open(LOG, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

def run(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip(), r.returncode
    except Exception as e:
        return str(e), -1

def run_bash(script):
    return run(['bash', '-c', script], timeout=15)

def check_node_health():
    try:
        resp = urllib.request.urlopen('http://localhost:3000/api/health', timeout=5)
        data = resp.read().decode()
        if '"status"' in data:
            return True, data[:120]
    except Exception as e:
        return False, str(e)[:80]
    return False, "unknown response"

def check_process(name):
    out, rc = run_bash(f'pgrep -a {name}')
    return rc == 0, out

def restart_node():
    log("Node.js DOWN — restarting...")
    run_bash('killall node 2>/dev/null; sleep 1')
    run_bash(f'cd {LXC_DIR} && nohup /usr/local/bin/node {LXC_DIR}/server.js </dev/null >> {LXC_DIR}/bts.log 2>&1 &')
    time.sleep(3)
    node_ok, _ = check_node_health()
    log(f"Node.js {'RESTARTED' if node_ok else 'restart FAILED — retry next cycle'}")

def restart_caddy():
    log("Caddy DOWN — restarting...")
    run_bash('killall caddy 2>/dev/null; sleep 1')
    run_bash(f'cd {LXC_DIR} && nohup /usr/local/bin/caddy run --config {LXC_DIR}/Caddyfile --adapter caddyfile </dev/null >> {LXC_DIR}/caddy.log 2>&1 &')
    time.sleep(3)
    caddy_ok, _ = check_process('caddy')
    log(f"Caddy {'RESTARTED' if caddy_ok else 'restart FAILED'}")

def restart_funnel():
    log("Funnel DOWN — restarting...")
    run_bash('for i in $(seq 1 15); do test -S /var/run/tailscale/tailscaled.sock && break; sleep 1; done')
    run_bash('nohup /usr/local/bin/tailscale --socket=/var/run/tailscale/tailscaled.sock funnel 8080 </dev/null >/tmp/funnel.log 2>&1 &')
    time.sleep(4)
    funnel_ok, detail = check_process('tailscale')
    if funnel_ok and 'funnel 8080' in detail:
        log(f"Funnel RESTARTED: {detail[:60]}")
    else:
        log("Funnel restart FAILED — retry next cycle")

def restart_tailscaled():
    log("Tailscaled daemon DOWN — restarting...")
    run_bash('killall tailscaled 2>/dev/null; sleep 1')
    run_bash('nohup /usr/local/bin/tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state </dev/null >/tmp/tailscaled.log 2>&1 &')
    time.sleep(5)
    daemon_ok, _ = check_process('tailscaled')
    log(f"Tailscaled daemon {'RESTARTED' if daemon_ok else 'STILL DOWN'}")

def main():
    log("=== BTS Health Check ===")

    # 1. Node.js
    node_ok, detail = check_node_health()
    if node_ok:
        log(f"Node.js: HEALTHY — {detail}")
    else:
        log(f"Node.js: DOWN ({detail})")
        restart_node()

    # 2. Caddy
    caddy_ok, caddy_detail = check_process('caddy')
    if caddy_ok:
        first_line = caddy_detail.split('\n')[0][:80]
        log(f"Caddy: RUNNING — {first_line}")
    else:
        log("Caddy: DOWN")
        restart_caddy()

    # 3. Funnel
    funnel_ok, funnel_detail = check_process('tailscale')
    funnel_running = funnel_ok and 'funnel 8080' in funnel_detail
    if funnel_running:
        log(f"Funnel: RUNNING — {funnel_detail[:60]}")
    elif funnel_ok:
        log(f"Tailscale daemon OK but Funnel process missing: {funnel_detail[:80]}")
        restart_funnel()
    else:
        log("Tailscale daemon DOWN — restarting daemon then Funnel")
        restart_tailscaled()
        time.sleep(3)
        restart_funnel()

    log("=== Check complete ===\n")

if __name__ == "__main__":
    main()
