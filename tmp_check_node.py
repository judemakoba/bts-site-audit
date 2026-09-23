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

def run(pve, cmd):
    stdin, stdout, stderr = pve.exec_command(cmd)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

pve = ssh_pve()
out, err = run(pve, 'pct exec 203 -- ls /usr/local/bin/ | head -20')
print('/usr/local/bin:', out)
out, err = run(pve, 'pct exec 203 -- ls /usr/local/ | head -10')
print('/usr/local/', out)
out, err = run(pve, 'pct exec 203 -- bash -c "echo PATH=$PATH"')
print('PATH:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /usr/local/bin/node"')
print('node binary:', out)
pve.close()
