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
    return stdout.read().decode(), stderr.read().decode()

pve = ssh_pve()

# Check symlink
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /usr/local/bin/node /usr/local/bin/npm"')
print('Symlinks:', out, err)

# Try node directly with full path
out, err = run(pve, 'pct exec 203 -- /usr/local/bin/node --version')
print('Direct node:', repr(out), repr(err))

# Check if node binary works
out, err = run(pve, 'pct exec 203 -- bash -c "/usr/local/bin/node --version 2>&1"')
print('Via bash:', out, err)

# Check what bash sees
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /usr/local/bin/node"')
print('ls node:', out, err)

# Check git
out, err = run(pve, 'pct exec 203 -- bash -c "ls /usr/bin/git /usr/local/bin/git 2>&1"')
print('git:', out, err)

# Try cloning via https using node's fetch
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/"')
print('root dir:', out, err)

pve.close()
