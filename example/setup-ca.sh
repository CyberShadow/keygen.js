#!/bin/bash
set -eEuo pipefail

# Script to set up a minimal certificate authority for keygen.js testing.
# Not a secure configuration! Do not use in production!

rm -rf tmp/ssl
mkdir -p tmp/ssl
cd tmp/ssl

mkdir demoCA
mkdir demoCA/private
openssl genpkey -algorithm RSA -out demoCA/private/cakey.pem
openssl req -x509 -new -nodes -key demoCA/private/cakey.pem -sha256 -out demoCA/cacert.pem \
		-subj "/C=XX/CN=keygen-js"
mkdir demoCA/newcerts
touch demoCA/index.txt
echo '0000000000000000' > demoCA/serial
mkdir tmp

cat > openssl.cnf <<'EOF'
[ ca ]
default_ca = CA_default

[ CA_default ]
dir           = ./demoCA
private_key   = $dir/private/cakey.pem
certificate   = $dir/cacert.pem
new_certs_dir = $dir/newcerts
database      = $dir/index.txt
serial        = $dir/serial
policy        = policy_match

[ policy_match ]
countryName             = match
stateOrProvinceName     = optional
organizationName        = supplied
organizationalUnitName  = optional
commonName              = supplied
emailAddress            = optional
EOF
