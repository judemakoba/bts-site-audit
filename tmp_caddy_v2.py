#!/usr/bin/env python3
import paramiko, io, time

def ssh_pve():
    j = paramiko.SSHClient(); j.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    j.connect('100.93.195.102', username='root', look_for_keys=True, timeout=10)
    transport = j.get_transport()
    channel = transport.open_channel('direct-tcpip', ('192.168.1.68', 22), ('100.93.195.102', 0))
    pve = paramiko.SSHClient(); pve.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    pve.connect('192.168.1.68', username='root', look_for_keys=True, sock=channel, timeout=10)
    return pve

def run(pve, cmd, timeout=30):
    stdin, stdout, stderr = pve.exec_command(cmd, timeout=timeout)
    return stdout.read().decode(), stderr.read().decode()

pve = ssh_pve()

# Check nohup
print("nohup check:")
out, err = run(pve, 'pct exec 203 -- bash -c "which nohup; nohup --help 2>&1 | head -2"')
print(out, err)

# Check setsid
print("\nsetsid check:")
out, err = run(pve, 'pct exec 203 -- bash -c "which setsid; setsid --help 2>&1 | head -2"')
print(out, err)

# Try using setsid to start caddy
print("\nStart Caddy with setsid:")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit && setsid /usr/local/bin/caddy run --config Caddyfile > /tmp/caddy.log 2>&1 &"')
print(out, err)
time.sleep(5)

out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print("Caddy process:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/caddy.log | tail -15"')
print("Log:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3001/api/health 2>&1"')
print("HTTPS health:", out[:200])

# Try with screen/tmux
print("\nAlternative: use setsid or screen...")
out, err = run(pve, 'pct exec 203 -- bash -c "which screen tmux 2>&1"')
print("screen/tmux:", out)

# Try redirecting with node's child_process
print("\nTry running caddy directly in background:")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit && /usr/local/bin/caddy run --config Caddyfile &"')
print(out, err)
time.sleep(5)
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print("Caddy:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3001/api/health 2>&1"')
print("Health:", out[:200])

pve.close()
