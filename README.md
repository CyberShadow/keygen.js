keygen.js
=========

This is a (very basic) JavaScript polyfill for the `<keygen>` tag, which is being removed from modern browsers.

[openssl.js](https://github.com/DigitalArsenal/openssl.js) is used for the heavy lifting.


Usage
-----

```html
<!doctype html>
<meta charset="UTF-8">
<script src="keygen.js"></script>
<script type="module">
    import { OpenSSL } from './openssl.js/dist/browser.openssl.js';
    keygenJS(OpenSSL);
</script>

<form action="/spkac-endpoint.php" method="post">
    <keygen keytype="rsa" name="key" id="keygen">
    <input type="submit">
</form>
```
