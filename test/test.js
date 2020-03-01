/* jshint esversion:8 */

// Configuration

const process = require('process');
const browser = process.argv[2];
const serverIP = process.argv[3];
const localIP = process.argv[4];
const tmpDir = process.argv[5];

// HTTP server

const http = require('http');
const url = require('url');

const finalhandler = require('finalhandler');
const serveStatic = require('serve-static');
const multiparty = require('multiparty');

const serve = serveStatic("www/");

const httpPort = 8123; // for the test HTTP server

const spkacServer = (function() {
	var keyQueue = [];
	var promiseQueue = [];

	function handleKey(key) {
		if (promiseQueue.length)
			promiseQueue.shift()(key);
		else
			keyQueue.push(key);
	}

	function receiveKey() {
		if (keyQueue.length)
			return Promise.resolve(keyQueue.shift());
		else
			return new Promise(function(resolve, reject) {
				promiseQueue.push(resolve);
			});
	}

	return { handleKey, receiveKey };
})();

const server = http
			.createServer(function(req, res) {
				console.log(req.url);
				const u = url.parse(req.url);
				if (u.pathname == '/keygen') {
					res.writeHead(200, {'Content-Type': 'text/html'});
					var options = '';

					if (u.searchParams) {
						u.searchParams.forEach(function(value, key) { 
							options += ` ${key}="${value}"`;
						});
					}

					res.end(`
<!doctype html>
<meta charset="UTF-8">
<script src="keygen.js"></script>
<script type="module">
 import { OpenSSL } from './openssl.js/dist/browser.openssl.js';
 keygenJS(OpenSSL);
</script>

<form action="/spkac-endpoint" method="post" enctype="multipart/form-data">
    <keygen name="key"${options}>
    <input type="submit">
</form>
`);
				} else if (u.pathname == '/spkac-endpoint' && req.method == 'POST') {
					var form = new multiparty.Form();
					form.parse(req, function(err, fields, files) {
						res.writeHead(200);
						res.end();
						// console.log({fields, files});
						spkacServer.handleKey(fields.key);
					});
				} else {
					var done = finalhandler(req, res);
					serve(req, res, done);
				}
			});
server.listen(httpPort, localIP);

// OpenSSL

const openssl = require('./openssl.js/dist/openssl.cjs');
const path = require('path');
const fs = require('fs');

async function checkSpkac(key) {
	let openSSL = new openssl.OpenSSL({ fs });
	let keyPath = fs.realpathSync(tmpDir) + '/key.pem';
	fs.writeFileSync(keyPath, 'SPKAC=' + key);

	let outPath = fs.realpathSync(tmpDir) + '/spkac.out';

	// Can't use virtual FS due to
	// https://github.com/DigitalArsenal/openssl.js/issues/4
  let r = await openSSL.runCommand(`spkac -verify -in ${keyPath} -out ${outPath}`);
	if (r != 0) throw new Error('Verification failed');
	return fs.readFileSync(outPath);
}

// Webdriver

const webdriver = require('selenium-webdriver');
const chromeOptions = {
	args : [
		'headless',
		'disable-gpu',
		'no-sandbox',
	]
};
const seleniumBrowser = ({
	'chromium' : {
		browser : 'chrome',
		capabilities : webdriver.Capabilities.chrome()
			.set('chromeOptions', chromeOptions)
			.set('goog:chromeOptions', chromeOptions)
	},
	'firefox' : {
		browser : 'firefox',
		capabilities : webdriver.Capabilities.firefox(),
	},
})[browser];

var driver;

async function runTests(tests) {
	driver = await new webdriver.Builder()
			.usingServer(`http://${serverIP}:9515`)
			.forBrowser(seleniumBrowser.browser)
			.withCapabilities(seleniumBrowser.capabilities)
			.build();
  try {
		var capabilities = await driver.getCapabilities();
		console.log('Testing with:', capabilities.getBrowserName(), capabilities.getBrowserVersion());
		console.log('UA:', await driver.executeScript('return navigator.userAgent'));

		for (var test of tests) {
			console.log('Running test:', test.name);
			await test();
		}
  } finally {
    await driver.quit();
		server.close();
  }
}

// The tests

runTests([
	async function basic() {
    await driver.get(`http://${localIP}:${httpPort}/keygen`);
		
		await driver.findElement(webdriver.By.css('input[type=submit]')).click();
		var key = await spkacServer.receiveKey();
		checkSpkac(key);
	},
]);
