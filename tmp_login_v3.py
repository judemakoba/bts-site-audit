#!/usr/bin/env python3
import paramiko, json

def ssh_pve():
    j = paramiko.SSHClient(); j.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    j.connect('100.93.195.102', username='root', look_for_keys=True, timeout=10)
    transport = j.get_transport()
    channel = transport.open_channel('direct-tcpip', ('192.168.1.68', 22), ('100.93.195.102', 0))
    pve = paramiko.SSHClient(); pve.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    pve.connect('192.168.1.68', username='root', look_for_keys=True, sock=channel, timeout=10)
    return pve

pve = ssh_pve()

# Use Python's built-in HTTP client
print("=== Login Test ===")
cmd = 'pct exec 203 -- python3 -c "import urllib.request,urllib.parse,json; d=json.dumps({\\\"email\\\":\\\"admin@bts-audit.com\\\",\\\"password\\\":\\\"admin123\\\"}).encode(); req=urllib.request.Request(\\\"http://localhost:3000/api/auth/login\\\",data=d,headers={\\\"Content-Type\\\":\\\"application/json\\\"}); r=urllib.request.urlopen(req); print(r.read().decode())" 2>&1'
stdin, stdout, stderr = pve.exec_command(cmd, timeout=15)
out = stdout.read().decode()
print("Response:", out[:400])

# Check users in db
cmd2 = 'pct exec 203 -- python3 -c "import urllib.request; r=urllib.request.urlopen(\\\"http://localhost:3000/api/auth/login\\\"); print(r.read().decode())"'
print("\n=== Users in DB ===")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && node -e \\"const fs=require(\\'fs\\'); const d=JSON.parse(fs.readFileSync(\\'data/db.json\\',\\\'utf8\\')); console.log(\\'Users:\\', d.users.map(u=>({email:u.email,role:u.role})));\\""')
out = stdout.read().decode()
print("Users:", out)

pve.close()
