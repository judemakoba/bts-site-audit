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

# Check unzip
out, err = run(pve, 'pct exec 203 -- bash -c "which unzip; unzip -v | head -1"')
print('unzip:', out, err)

# Try manual unzip
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && unzip -o bts.zip 2>&1 | head -10"')
print('unzip output:', out)

# Check what's in the zip
out, err = run(pve, 'pct exec 203 -- bash -c "unzip -l bts.zip | head -15"')
print('zip contents:', out)

# Check after unzip
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /root/"')
print('Root after:', out)

pve.close()
