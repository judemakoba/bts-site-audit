#!/usr/bin/env python3
import paramiko

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

# Check everything
out, err = run(pve, 'pct exec 203 -- bash -c "ls /tmp/bts.log"')
print("Log exists:", out, err)

out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log"')
print("Log content:", out[:500], err[:200])

out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node"')
print("Node processes:", out)

out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3000/api/health 2>&1"')
print("Health:", out)

out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- --post-data=email=admin@bts-audit.com --post-data=password=admin123 --header=Content-Type:application/json http://localhost:3000/api/auth/login 2>&1"')
print("Login:", out)

pve.close()
