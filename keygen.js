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

/* jshint esversion : 8 */

function isKeygenNativelySupported() {
	// TODO: iOS - https://github.com/Modernizr/Modernizr/issues/1075
	var keygen = document.getElementById('keygen');
	if ('challenge' in keygen)
		return 'blink';

	var template = document.createElement('div');
	template.innerHTML = '<form><keygen class="keygen"></form>';
	keygen = template.getElementsByClassName('keygen')[0];
	if (keygen.tagName.toLowerCase() === 'select')
		return 'gecko';

	return false;
}

function keygenJS(OpenSSL) {
	if (isKeygenNativelySupported())
		return;

	const supportedAlgorithms = [ 'RSA', 'RSA-PSS', 'X25519', 'X448', 'ED25519', 'ED448' ];
	function wipe(arr) {
		for (var i = 0; i < arr.length; i++)
			arr[i] = 0xFE;
	}

	function nextPowerOfTwo(v) {
		var p = 2;
		while ((v >>= 1)) {
			p <<= 1;
		}
		return p;
	}

	// openssl.js suggests using wasmfs, however, it adds a
	// lot of dependencies and is difficult to package, so
	// just implement a basic virtual FS here.
	let fs = { }; // TODO: should have temp scope
	let lineBuf = '';
	let tty = {
		write : function(arr) {
			for (var c of arr)
				if (c == 10) {
					console.log(lineBuf); lineBuf = '';
				} else {
					lineBuf += String.fromCharCode(c);
				}
		}
	};
	let fds = [ { }, tty, tty ];
	let fsImpl = {
		existsSync : function(fn) {
			// console.log('existsSync', fn);
			return fn in fs;
		},
		realpathSync : function(n) {
			return n;
		},
		mkdirSync : function() {
			return false;
		},
		openSync : function(fn, flags) {
			// console.log('openSync', fn, flags);
			var ro = flags & 1;
			if (!ro)
				fs[fn] = new Uint8Array(0);
			else
				if (!(fn in fs))
					return -1;
			var pos = 0;
			fds.push({
				read : function(length) {
					var arr = fs[fn].subarray(pos, pos + length);
					pos += arr.length;
					return arr;
				},
				write : ro ? null : function(arr) {
					// console.log('write', arr.length, '@', pos, '/', fs[fn].buffer.byteLength);
					if (fs[fn].buffer.byteLength < pos + arr.length) {
						var newFile = new Uint8Array(nextPowerOfTwo(pos + arr.length));
						newFile.set(fs[fn]);
						wipe(new Uint8Array(fs[fn].buffer));
						fs[fn] = newFile.subarray(0, pos);
					}
					var target = new Uint8Array(fs[fn].buffer, pos, arr.length);
					target.set(arr);
					pos += arr.length;
					fs[fn] = new Uint8Array(fs[fn].buffer, 0, pos);
					wipe(arr);
				},
			});
			return fds.length - 1;
		},
		readSync : function(fd, buffer, offset, length, position) {
			// console.log(fd, buffer, offset, length);
			if (fd < 0) return 0;
			var arr = fds[fd].read(length);
			buffer.subarray(offset, offset + arr.length).set(arr);
			return arr.length;
		},
		writeSync : function(fd, buffer) {
			if (fd < 0) return 0;
			fds[fd].write(buffer);
			return buffer.length;
		},
		closeSync : function(fd) {
			if (fd < 0) return;
			fds[fd] = null;
		},
		fstatSync : function() {
			return {
				isBlockDevice : () => false,
				isCharacterDevice : () => false,
				isDirectory : () => false,
				isFIFO : () => false,
				isFile : () => true,
			};
		},
		constants : {
			O_RDONLY : 1,
		},
	};

	let openSSL = new OpenSSL({
		fs: fsImpl,
		rootDir: '/'
	});

	async function genSpkac(algorithm, pkeyopts) {
		if (algorithm === undefined)
			algorithm = 'RSA';
		if (!algorithm.length || algorithm.match(/[\s]/))
			throw 'Invalid algorithm';
		pkeyopts = pkeyopts.split(/[\s]{1,}/g).filter(Boolean);

		await openSSL.runCommand(
			"genpkey" +
			" -algorithm " + algorithm +
			pkeyopts.map(opt => " -pkeyopt " + opt) +
			" -out /private.pem");
		if (!('/private.pem' in fs) || !fs['/private.pem'].length) throw 'Private key generation failed';

		await openSSL.runCommand(
			"spkac" +
			" -key /private.pem" +
			" -out /spkac");
		if (!('/spkac' in fs) || !fs['/spkac'].length) throw 'Private key generation failed';
		var privateKey = fs['/private.pem'];

		var spkac = fs['/spkac'];
		spkac = spkac.subarray(6); // Skip "SKPAC="
		spkac = String.fromCharCode.apply(null, spkac);
		return { spkac, privateKey };
	}

	async function convertDerToPem(der) {
		fs['/cert.der'] = der;
		await openSSL.runCommand(
			"x509" +
			" -inform der" +
			" -in /cert.der" +
			" -outform pem" +
			" -out /cert.pem");
		if (!('/cert.pem' in fs) || !fs['/cert.pem'].length) throw 'Certificate conversion failed';
		return fs['/cert.pem'];
	}

	async function convertToPkcs12(key, pem) {
		fs['/private.pem'] = key;
		fs['/cert.pem'] = pem;
		await openSSL.runCommand(
			"pkcs12" +
			" -export" +
			" -in /cert.pem" +
			" -inkey /private.pem" +
			" -out /cert.p12" +
			" -passout pass:");
		if (!('/cert.p12' in fs) || !fs['/cert.p12'].length) throw 'Certificate conversion failed';
		return fs['/cert.p12'];
	}

	async function base64Encode(data) {
		fs['/data.bin'] = data;
		await openSSL.runCommand(
			"base64" +
			" -e" +
			" -in /data.bin" +
			" -out /data.txt");
		if (!('/data.txt' in fs)) throw 'Base64 encoding failed';
		return fs['/data.txt'];
	}

	function polyfillKeygen(keygen) {
		var name = keygen.getAttribute('name');
		if (!name) throw '<keygen> element has no name';

		var algoSelect;
		if (!keygen.hasAttribute('keytype')) {
			algoSelect = document.createElement('select');
			algoSelect.setAttribute('title', 'Private key algorithm');
			algoSelect.setAttribute('class', 'keygen-algorithm');
			for (var algoName of supportedAlgorithms) {
				var algoOption = document.createElement('option');
				algoOption.setAttribute('value', algoName);
				algoOption.textContent = algoName;
				algoSelect.appendChild(algoOption);
			}
			keygen.appendChild(algoSelect);
		}

		var optInput = document.createElement('input');
		optInput.setAttribute('title', 'Space-separated public key generation algorithm options\n(e.g. "rsa_keygen_bits:4096" for a 4096-bit RSA key)');
		optInput.setAttribute('class', 'keygen-pkeyopts');
		optInput.setAttribute('placeholder', 'optional private key options');
		keygen.appendChild(optInput);

		var status = document.createElement('span');
		status.setAttribute('class', 'keygen-status');
		keygen.appendChild(status);

		var resultLink = document.createElement('a');
		resultLink.setAttribute('class', 'keygen-link');
		keygen.appendChild(resultLink);

		var form = optInput.form;
		if (!form) throw '<keygen> is not in a <form>';

		var spkacInput = document.createElement('input');
		spkacInput.setAttribute('type', 'hidden');
		keygen.removeAttribute('name');
		spkacInput.setAttribute('name', name);
		form.appendChild(spkacInput);

		form.addEventListener('submit', function(e) {
			e.preventDefault();

			(async function() {
				var algorithm = keygen.hasAttribute('keytype') ? keygen.getAttribute('keytype') : algoSelect.value;
				var spkac;
				status.textContent = 'Generating key pair...';
				try {
					spkac = await genSpkac(algorithm, optInput.value);
				} catch (e) {
					console.error('keygen.js key generation error:', e);
					status.textContent = 'Error!';
					return;
				}

				spkacInput.setAttribute('value', spkac.spkac);
				status.textContent = 'Submitting SPKAC request...';
				var data = new FormData(form);
				var xhr = new XMLHttpRequest();
				xhr.open(form.method || 'GET', form.action || '', true);
				xhr.responseType = 'arraybuffer';
				xhr.onload = function() {
					status.textContent = 'Processing response...';
					try {
						if (!xhr.response) throw 'No response';
						var der = new Uint8Array(xhr.response);
						if (!der.length) throw 'Empty response';
						
						(async function() {
							var pem;
							status.textContent = 'Converting certificate...';
							try {
								pem = await convertDerToPem(der);
							} catch (e) {
								console.error('keygen.js certificate conversion error:', e);
								status.textContent = 'Error!';
								return;
							}

							var p12;
							status.textContent = 'Combining certificate...';
							try {
								p12 = await convertToPkcs12(spkac.privateKey, pem);
							} catch (e) {
								console.error('keygen.js certificate combining error:', e);
								status.textContent = 'Error!';
								return;
							}

							var b64 = await base64Encode(p12);
							var url = 'data:application/x-pkcs12;base64,' + String.fromCharCode.apply(null, b64);

							status.textContent = ''; // OK
							resultLink.setAttribute('href', url);
							resultLink.setAttribute('download', 'cert.p12');
							resultLink.textContent = 'Save certificate';
						})();
					} catch (e) {
						console.error('keygen.js certificate generation error:', e);
						status.textContent = 'Error!';
					}
				};
				xhr.send(data);

			})();
		});
	}

	function polyfillAll() {
		var keygens = document.getElementsByTagName('keygen');
		for (var keygen of keygens) {
			try {
				polyfillKeygen(keygen);
			} catch (e) {
				console.error('keygen.js polyfill error:', e);
			}
		}
	}

	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', polyfillAll);
	else
		polyfillAll();
}
