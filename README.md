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
<style>
    .keygen-algorithm { /* algorithm dropdown (select) */ }
    .keygen-pkeyopts { /* additional key options (text input) */ }
    .keygen-status { /* status/progress (span) */ }
    .keygen-link { /* generated certificate download link (a) */ }
</style>

<form action="/spkac-endpoint.php" method="post">
    <keygen name="key">
	<!-- More optional attributes:
	   - keytype (rsa / rsa-pss / x25519 / x448 / ed25519 / ed448)
	   - challenge
	   - -keygenjs-pkeyopts (e.g. "rsa_keygen_bits:4096")
	     and standard HTML attributes:
	   - autofocus
	   - disabled
	   - form
	-->
	<input type="submit">
</form>
```
