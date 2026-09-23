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
sftp = pve.open_sftp()

# Write test script to LXC
test_script = b'''#!/usr/bin/env python3
import urllib.request, json

# Login
data = json.dumps({"email": "admin@bts-audit.com", "password": "admin123"}).encode()
req = urllib.request.Request(
    "http://localhost:3000/api/auth/login",
    data=data,
    headers={"Content-Type": "application/json"}
)
try:
    r = urllib.request.urlopen(req)
    print("LOGIN OK:", r.read().decode()[:200])
except Exception as e:
    print("LOGIN ERROR:", e)

# Check users
import urllib.request as ur
r = ur.urlopen("http://localhost:3000/api/health")
print("HEALTH:", r.read().decode()[:100])
'''

f = io.BytesIO(test_script)
sftp.putfo(f, '/tmp/test_login.py')
sftp.close()

# Run it
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && python3 /tmp/test_login.py"',
    timeout=15
)
out = stdout.read().decode()
err = stderr.read().decode()
print("STDOUT:", out)
print("STDERR:", err[:200])

pve.close()
