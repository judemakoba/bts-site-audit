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
    return stdout.read().decode().strip(), stderr.read().decode().strip()

pve = ssh_pve()
out, err = run(pve, 'pct status 203')
print('LXC status:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /usr/local/bin/node /usr/local/bin/npm 2>&1"')
print('Symlinks:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "/usr/local/bin/node --version 2>&1"')
print('Node:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/"')
print('Root dir:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/ 2>&1"')
print('Repo:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "cat /root/bts-site-audit/.env 2>&1"')
print('Env:', out)
pve.close()
