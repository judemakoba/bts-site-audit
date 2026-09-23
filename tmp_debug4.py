#!/usr/bin/env python3
import paramiko, io, os

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
sftp = pve.open_sftp()

# Test: create file via SFTP
print("Test 1: Create /tmp/test_sftp.txt via SFTP...")
sftp.putfo(io.BytesIO(b"hello from sftp"), '/tmp/test_sftp.txt')

# Verify via pct exec
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/test_sftp.txt"')
print(f"  Read via pct exec: {out}")

# Check /root/bts-site-audit/
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /root/"')
print(f"  /root: {out}")

# What is /root/bts-site-audit in SFTP context?
try:
    stat = sftp.stat('/root/bts-site-audit')
    print(f"  SFTP /root/bts-site-audit exists, size={stat.st_size}")
except Exception as e:
    print(f"  SFTP /root/bts-site-audit error: {e}")

# Check the remote directory /root/bts-site-audit
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/ && find /root/bts-site-audit -type f | head -10"')
print(f"  Container /root/bts-site-audit: {out}")

# Upload a test file to /root/bts-site-audit/
print("\nTest 2: Upload test file...")
sftp.putfo(io.BytesIO(b"TEST FILE CONTENT"), '/root/bts-site-audit/test_upload.txt')

# Check where it went
out, err = run(pve, 'pct exec 203 -- bash -c "find / -name test_upload.txt 2>/dev/null"')
print(f"  Where is test_upload.txt: {out}")

out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/ | head -10"')
print(f"  /root listing: {out}")

pve.close()
