/*
 * Copyright 2020 Vladimir Panteleev
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

const serverBase = `http://${localIP}:${httpPort}/`;
const server = http
      .createServer(function(req, res) {
        console.log(req.method, req.url);
        const u = new url.URL(req.url, serverBase);
        if (u.pathname == '/keygen') {
          res.writeHead(200, {'Content-Type': 'text/html'});
          var options = '';

          u.searchParams.forEach(function(value, key) {
            options += ` ${key}="${value}"`;
          });

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
  if (key.length == 0 || key[key.length - 1] == 10)
    throw new Error('Invalid SPKAC');

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

const assert = require('assert');

runTests([
  async function basic() {
    await driver.get(serverBase + `keygen`);

    await driver.findElement(webdriver.By.css('input[type=submit]')).click();
    var key = await spkacServer.receiveKey();
    checkSpkac(key);
  },

  async function challenge() {
    await driver.get(serverBase + `keygen?challenge=fite-me`);

    // console.log(await driver.executeScript('return typeof isKeygenNativelySupported === "undefined" ? "undefined" : isKeygenNativelySupported()'));

    await driver.findElement(webdriver.By.css('input[type=submit]')).click();
    var key = await spkacServer.receiveKey();
    var spkac = await checkSpkac(key);
    assert.match(spkac.toString(), /^  Challenge String: fite-me$/m);
  },

  async function disabled() {
    await driver.get(serverBase + `keygen?disabled=`);

    await driver.findElement(webdriver.By.css('input[type=submit]')).click();
    var key = await spkacServer.receiveKey();
    assert.strictEqual(key, undefined);
  },
]);
