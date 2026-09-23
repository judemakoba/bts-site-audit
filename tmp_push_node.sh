#!/bin/bash
# Deploy Node.js to LXC 203
PCT="/usr/sbin/pct"
LXC=203

# Encode binary to base64
echo "Encoding..."
base64 /tmp/node.tar.xz > /tmp/node.b64
echo "Base64 size: $(wc -c < /tmp/node.b64)"

# Push to LXC
echo "Pushing to LXC..."
$PCT push $LXC /tmp/node.b64 /tmp/node.b64
echo "Push done. Size in LXC:"
$PCT exec $LXC -- wc -c /tmp/node.b64

# Decode
echo "Decoding..."
$PCT exec $LXC -- bash -c "base64 -d /tmp/node.b64 > /tmp/node.tar.xz && rm /tmp/node.b64"
$PCT exec $LXC -- ls -lh /tmp/node.tar.xz

# Extract
echo "Extracting..."
$PCT exec $LXC -- bash -c "cd /usr/local && tar -xJf /tmp/node.tar.xz && rm /tmp/node.tar.xz && echo 'Done'"
$PCT exec $LXC -- node --version
$PCT exec $LXC -- npm --version
