<?php

# SPKAC endpoint for keygen.js testing.
# Not a secure example! Do not use in production!

$id = uniqid();
chdir('tmp/ssl');

$key_file = "tmp/$id-key.pem";
$out_file = "tmp/$id-out.pem";

$key = $_POST["key"];
$key = str_replace(str_split(" \t\n\r\0\x0B"), '', $key);

$key_fd = fopen($key_file, "w");
fputs($key_fd, "SPKAC=" . $key);
fputs($key_fd, "\nCN=" . $id);
fputs($key_fd, "\norganizationName=keygen-js");
fputs($key_fd, "\ncountryName=XX");
fclose($key_fd);

ob_start();
system("openssl ca -config openssl.cnf -days 365 -notext -batch -md sha512 -spkac $key_file -out $out_file -passin pass:pass");
ob_end_clean();

unlink($key_file);
$data = file_get_contents($out_file, "r");
unlink($out_file);

if (strlen($data) == 0) {
    throw new Exception('Failed to generate a certificate');
} else {
    error_log('Certificate successfully generated: ' . $id);

    header('Last-Modified: '.date('r+b'));
    header('Content-Length: '.$length);
    header('Content-Type: application/x-x509-user-cert');
    echo $data;
}
