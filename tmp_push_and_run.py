#!/usr/bin/env python3
import paramiko, io

def ssh_pve():
    j = paramiko.SSHClient(); j.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    j.connect('100.93.195.102', username='root', look_for_keys=True, timeout=10)
    transport = j.get_transport()
    channel = transport.open_channel('direct-tcpip', ('192.168.1.68', 22), ('100.93.195.102', 0))
    pve = paramiko.SSHClient(); pve.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    pve.connect('192.168.1.68', username='root', look_for_keys=True, sock=channel, timeout=10)
    return pve

pve = ssh_pve()

# Push test script to LXC
print("Push test script...")
sftp = pve.open_sftp()
sftp.put(r'D:\Mop_Projects\Asset_Verification\tmp_test_script.py', '/tmp/t.py')
sftp.close()

# pct push to LXC 203
stdin, stdout, stderr = pve.exec_command('pct push 203 /tmp/t.py /tmp/test.py')
out = stdout.read().decode()
err = stderr.read().decode()
print("push result:", out, err)

# Run it
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && python3 /tmp/test.py"',
    timeout=15
)
out = stdout.read().decode()
err = stderr.read().decode()
print("STDOUT:", out)
print("STDERR:", err[:200])

pve.close()
