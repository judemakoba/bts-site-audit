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

def run(pve, cmd, timeout=10):
    stdin, stdout, stderr = pve.exec_command(cmd, timeout=timeout)
    return stdout.read().decode(), stderr.read().decode()

pve = ssh_pve()

# Try with node's fetch
print("=== Login via node ===")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && node -e \\"const r=require(\\'http\\');const d=JSON.stringify({email:\\'admin@bts-audit.com\\',password:\\'admin123\\'});const req=r.request({hostname:\\'localhost\\',port:3000,path:\\'/api/auth/login\\',method:\\'POST\\',headers:{\\'Content-Type\\':\\'application/json\\',\\'Content-Length\\':Buffer.byteLength(d)}},res=>{let s=\\'\\';res.on(\\'data\\',c=>s+=c);res.on(\\'end\\',()=>console.log(s))});req.write(d);req.end();\\""')
print("Login:", out[:400])

pve.close()
